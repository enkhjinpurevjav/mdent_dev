import express from "express";
import prisma from "../db.js";
import { Prisma } from "@prisma/client";
import multer from "multer";          
import path from "path";
import { parseRegNo } from "../utils/regno.js";
import { getPatientBalance } from "./reports-patient-balances.js";

const router = express.Router();
const uploadDir = process.env.MEDIA_UPLOAD_DIR || "/data/media";

// Helper: get next available numeric bookNumber as string (Postgres-optimized)
async function generateNextBookNumber() {
  // Fetch max numeric bookNumber via raw query for efficiency
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(MAX("bookNumber"::int), 0) AS max
    FROM "PatientBook"
    WHERE "bookNumber" ~ '^[0-9]+$'
  `;
  let next = Number(rows[0].max) + 1 || 1;

  // Retry a few times in case of a race condition on unique constraint
  for (let _attempt = 0; _attempt < 5; _attempt++) {
    const candidate = String(next);
    const existing = await prisma.patientBook.findUnique({
      where: { bookNumber: candidate },
    });
    if (!existing) {
      return candidate;
    }
    next += 1;
  }

  // Fallback: return the current candidate (schema unique constraint will catch conflicts)
  return String(next);
}

// GET /api/patients
router.get("/", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = parseInt(req.query.limit, 10) || 50;
    const limit = [10, 50, 100].includes(rawLimit) ? rawLimit : 50;
    const skip = (page - 1) * limit;
    const sort = req.query.sort === "name" ? "name" : "bookNumber";
    const dir = req.query.dir === "asc" ? "ASC" : "DESC";

    const where = q
      ? {
          OR: [
            { ovog: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { regNo: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { patientBook: { bookNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {};

    const seventeenYearsAgo = new Date();
    seventeenYearsAgo.setFullYear(seventeenYearsAgo.getFullYear() - 17);

    // Fetch data with appropriate sorting
    let data;
    if (sort === "bookNumber") {
      // Numeric bookNumber ordering via raw query (non-lexicographic)
      const searchPattern = q ? `%${q}%` : null;
      const whereClause = q
        ? Prisma.sql`WHERE (
            p."ovog" ILIKE ${searchPattern} OR
            p."name" ILIKE ${searchPattern} OR
            p."regNo" ILIKE ${searchPattern} OR
            p."phone" ILIKE ${searchPattern} OR
            pb."bookNumber" ILIKE ${searchPattern}
          )`
        : Prisma.empty;
      const orderDir = dir === "ASC" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

      const rows = await prisma.$queryRaw`
        SELECT
          p.id, p."ovog", p."name", p."regNo", p."phone", p."branchId",
          p."createdAt", p."updatedAt", p."gender", p."birthDate",
          p."email", p."address", p."workPlace", p."bloodType",
          p."citizenship", p."emergencyPhone", p."notes",
          pb.id AS "pbId", pb."bookNumber" AS "pbBookNumber", pb."patientId" AS "pbPatientId"
        FROM "Patient" p
        LEFT JOIN "PatientBook" pb ON pb."patientId" = p.id
        ${whereClause}
        ORDER BY
          CASE WHEN pb."bookNumber" ~ '^[0-9]+$' THEN pb."bookNumber"::int END ${orderDir} NULLS LAST,
          p.id DESC
        LIMIT ${limit} OFFSET ${skip}
      `;

      data = rows.map((row) => ({
        id: row.id,
        ovog: row.ovog,
        name: row.name,
        regNo: row.regNo,
        phone: row.phone,
        branchId: row.branchId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        gender: row.gender,
        birthDate: row.birthDate,
        email: row.email,
        address: row.address,
        workPlace: row.workPlace,
        bloodType: row.bloodType,
        citizenship: row.citizenship,
        emergencyPhone: row.emergencyPhone,
        notes: row.notes,
        patientBook: row.pbBookNumber
          ? { id: row.pbId, bookNumber: row.pbBookNumber, patientId: row.pbPatientId }
          : null,
      }));
    } else {
      // Name sort via Prisma
      const nameDir = dir === "ASC" ? "asc" : "desc";
      data = await prisma.patient.findMany({
        where,
        include: { patientBook: true },
        orderBy: [{ name: nameDir }, { id: "desc" }],
        skip,
        take: limit,
      });
    }

    const [total, totalMale, totalFemale, totalKids] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.count({ where: { gender: "эр" } }),
      prisma.patient.count({ where: { gender: "эм" } }),
      prisma.patient.count({ where: { birthDate: { gte: seventeenYearsAgo } } }),
    ]);

    res.json({
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      totalMale,
      totalFemale,
      totalKids,
    });
  } catch (err) {
    console.error("Error fetching patients:", err);
    res.status(500).json({ error: "failed to fetch patients" });
  }
});

// POST /api/patients
router.post("/", async (req, res) => {
  try {
    const {
  ovog,
  name,
  regNo,
  phone,
  branchId,
  bookNumber,
  gender,
  birthDate,        // <-- add here
  citizenship,
  emergencyPhone,
} = req.body || {};

    // Minimal required fields: name, phone, branchId
    if (!name || !phone || !branchId) {
      return res.status(400).json({
        error: "name, phone, branchId are required",
      });
    }

    const parsedBranchId = Number(branchId);
    if (Number.isNaN(parsedBranchId)) {
      return res
        .status(400)
        .json({ error: "branchId must be a valid number" });
    }

    // Optional regNo: only enforce unique if provided
    let finalRegNo = regNo ? String(regNo).trim() : null;
    if (finalRegNo) {
      const existingByRegNo = await prisma.patient.findUnique({
        where: { regNo: finalRegNo },
      });
      if (existingByRegNo) {
        return res
          .status(400)
          .json({ error: "This regNo is already registered" });
      }
    }

    // Gender is optional...
let finalGender = null;
if (typeof gender === "string" && gender.trim() !== "") {
  const g = gender.trim();
  if (g !== "эр" && g !== "эм") {
    return res.status(400).json({ error: "gender must be 'эр' or 'эм' if provided" });
  }
  finalGender = g;
}

// BirthDate is optional (YYYY-MM-DD), normalize similar to PATCH
let finalBirthDate = null;
if (birthDate) {
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) {
    return res.status(400).json({
      error: "Invalid birthDate format (expected YYYY-MM-DD)",
    });
  }
  finalBirthDate = d;
}
    // derive from regNo only when missing (override-friendly)
if (finalRegNo && (finalGender === null || finalBirthDate === null)) {
  const parsed = parseRegNo(finalRegNo); // import this at top
  if (parsed.isValid) {
    if (finalGender === null) finalGender = parsed.gender;

    if (finalBirthDate === null && parsed.birthDate) {
      // safest:
      finalBirthDate = new Date(`${parsed.birthDate}T00:00:00.000Z`);
    }
  }
}

    // Handle bookNumber (optional, auto-generate if blank)
    let finalBookNumber = bookNumber ? String(bookNumber).trim() : "";

    if (finalBookNumber) {
      // Manual: must be 1–6 digits
      if (!/^\d{1,6}$/.test(finalBookNumber)) {
        return res.status(400).json({
          error: "Картын дугаар нь 1-6 оронтой зөвхөн тоо байх ёстой",
        });
      }

      const existingBook = await prisma.patientBook.findUnique({
        where: { bookNumber: finalBookNumber },
      });
      if (existingBook) {
        return res.status(400).json({
          error: "Энэ картын дугаар аль хэдийн бүртгэгдсэн байна",
        });
      }
    } else {
      const candidate = await generateNextBookNumber();

      if (!/^\d{1,6}$/.test(candidate)) {
        return res.status(500).json({
          error:
            "Автомат картын дугаар үүсгэхэд алдаа гарлаа (тоо 6 орноос хэтэрсэн)",
        });
      }

      finalBookNumber = candidate;
    }

    const patient = await prisma.patient.create({
      data: {
        ovog: ovog ? String(ovog).trim() : null,
        name: String(name).trim(),
        regNo: finalRegNo, // may be null
        phone: String(phone).trim(),

        // relation to Branch: explicitly connect required branch
        branch: {
          connect: { id: parsedBranchId },
        },

        // New optional fields
        gender: finalGender,
        birthDate: finalBirthDate,
        citizenship: citizenship
          ? String(citizenship).trim()
          : undefined, // let Prisma default("Mongolian") apply when undefined
        emergencyPhone: emergencyPhone
          ? String(emergencyPhone).trim()
          : null,

        patientBook: {
          create: {
            bookNumber: finalBookNumber,
          },
        },
      },
      include: { patientBook: true },
    });

    res.status(201).json(patient);
  } catch (err) {
    console.error("Error creating patient:", err);

    if (err.code === "P2002") {
      if (err.meta && err.meta.target && Array.isArray(err.meta.target)) {
        if (err.meta.target.includes("regNo")) {
          return res
            .status(400)
            .json({ error: "This regNo is already registered" });
        }
        if (err.meta.target.includes("bookNumber")) {
          return res.status(400).json({
            error: "Энэ картын дугаар аль хэдийн бүртгэгдсэн байна",
          });
        }
      }
    }

    res.status(500).json({ error: "failed to create patient" });
  }
});

// PATCH /api/patients/:id
router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid patient id" });
    }

    const {
      ovog,
      name,
      regNo,
      phone,
      email,
      gender,
      birthDate,
      address,
      workPlace,
      bloodType,
      citizenship,
      emergencyPhone,
      notes,
    } = req.body || {};

    const data = {};

    if (ovog !== undefined) {
      data.ovog = ovog === "" ? null : String(ovog).trim();
    }
    if (name !== undefined) {
      data.name = String(name).trim();
    }
    if (regNo !== undefined) {
      data.regNo = regNo === "" ? null : String(regNo).trim();
    }
    if (phone !== undefined) {
      data.phone = phone === "" ? null : String(phone).trim();
    }
    if (email !== undefined) {
      data.email = email === "" ? null : String(email).trim();
    }

    // gender: optional, must be "эр" or "эм" if provided
    if (gender !== undefined) {
      if (!gender) {
        data.gender = null;
      } else if (gender === "эр" || gender === "эм") {
        data.gender = gender;
      } else {
        return res.status(400).json({
          error: "gender must be 'эр' or 'эм' if provided",
        });
      }
    }

    // birthDate comes as "YYYY-MM-DD" or null/empty
    if (birthDate !== undefined) {
      if (!birthDate) {
        data.birthDate = null;
      } else {
        const d = new Date(birthDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({
            error: "Invalid birthDate format (expected YYYY-MM-DD)",
          });
        }
        data.birthDate = d;
      }
    }

    if (address !== undefined) {
      data.address = address === "" ? null : String(address).trim();
    }
    if (workPlace !== undefined) {
      data.workPlace = workPlace === "" ? null : String(workPlace).trim();
    }
    if (bloodType !== undefined) {
      data.bloodType = bloodType === "" ? null : String(bloodType).trim();
    }
    if (citizenship !== undefined) {
      data.citizenship =
        citizenship === "" ? null : String(citizenship).trim();
    }
    if (emergencyPhone !== undefined) {
      data.emergencyPhone =
        emergencyPhone === "" ? null : String(emergencyPhone).trim();
    }
    if (notes !== undefined) {
      data.notes = notes === "" ? null : String(notes).trim();
    }

    const updated = await prisma.patient.update({
      where: { id },
      data,
    });

    return res.json({ patient: updated });
  } catch (err) {
    console.error("Error updating patient:", err);
    if (err.code === "P2025") {
      // Prisma "record not found"
      return res.status(404).json({ error: "Patient not found" });
    }
    // Handle unique regNo violation if you keep regNo unique
    if (err.code === "P2002" && err.meta?.target?.includes("regNo")) {
      return res
        .status(400)
        .json({ error: "This regNo is already registered" });
    }
    return res.status(500).json({ error: "failed to update patient" });
  }
});

// GET /api/patients/profile/by-book/:bookNumber
router.get("/profile/by-book/:bookNumber", async (req, res) => {
  try {
    const { bookNumber } = req.params;

    if (!bookNumber) {
      return res.status(400).json({ error: "bookNumber is required" });
    }

    const pb = await prisma.patientBook.findUnique({
      where: { bookNumber },
      include: {
        patient: {
          include: {
            branch: true,
          },
        },
        visitCards: true, // Changed to plural
      },
    });

    if (!pb || !pb.patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const patient = pb.patient;

    // Load encounters for this patientBook
    const encounters = await prisma.encounter.findMany({
  where: { patientBookId: pb.id },
  orderBy: { visitDate: "desc" },
  include: {
    doctor: true,
    nurse: true,
    invoice: {
      include: {
        payments: true,
        eBarimtReceipt: true,
        items: { include: { procedure: true } },
      },
    },
    chartTeeth: { include: { chartNotes: true } },
    media: true,
    diagnoses: {
      orderBy: { id: "asc" },
      include: {
        diagnosis: {
          include: {
            problems: {
              where: { active: true },
              orderBy: { order: "asc" },
            },
          },
        },
        problemTexts: true,
        sterilizationIndicators: {
          include: {
            indicator: {
              include: {
                items: { include: { item: true } },
              },
            },
          },
        },
      },
    },
    encounterServices: {
      orderBy: { id: "asc" },
      include: {
        service: true,
        texts: { orderBy: { order: "asc" } },
      },
    },
  },
});

    const invoices = encounters
      .map((e) => e.invoice)
      .filter((inv) => !!inv);

    const media = encounters.flatMap((e) => e.media || []);

    // Load all appointments for this patient (across branches)
    const appointments = await prisma.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { scheduledAt: "desc" },
      include: {
        branch: true,
        doctor: true,
      },
    });

    // Find the active visit card (latest savedAt)
    let activeVisitCard = null;
    if (pb.visitCards && pb.visitCards.length > 0) {
      activeVisitCard = pb.visitCards.reduce((latest, card) => {
        if (!latest) return card;
        if (!card.savedAt) return latest;
        if (!latest.savedAt) return card;
        return card.savedAt > latest.savedAt ? card : latest;
      }, null);
    }

    const { balance: patientBalance } = await getPatientBalance(patient.id);

    res.json({
      patient,
      patientBook: { id: pb.id, bookNumber: pb.bookNumber },
      encounters,
      invoices,
      media,
      appointments,
      visitCard: activeVisitCard, // Return active card for backwards compatibility
      visitCards: pb.visitCards, // Return all cards
      patientBalance,
    });
  } catch (err) {
    console.error("GET /api/patients/profile/by-book/:bookNumber error:", err);
    res.status(500).json({ error: "failed to load patient profile" });
  }
});


// GET /api/patients/visit-card/by-book/:bookNumber
router.get("/visit-card/by-book/:bookNumber", async (req, res) => {
  try {
    const { bookNumber } = req.params;
    if (!bookNumber) {
      return res.status(400).json({ error: "bookNumber is required" });
    }

    const pb = await prisma.patientBook.findUnique({
      where: { bookNumber },
      include: {
        visitCards: true, // Changed to plural
        patient: {
          include: { branch: true },
        },
      },
    });

    if (!pb || !pb.patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Find the active card (latest savedAt)
    let activeCard = null;
    if (pb.visitCards && pb.visitCards.length > 0) {
      activeCard = pb.visitCards.reduce((latest, card) => {
        if (!latest) return card;
        if (!card.savedAt) return latest;
        if (!latest.savedAt) return card;
        return card.savedAt > latest.savedAt ? card : latest;
      }, null);
    }

    return res.json({
      patientBook: { id: pb.id, bookNumber: pb.bookNumber },
      patient: pb.patient,
      visitCard: activeCard, // Return the active card for backwards compatibility
      visitCards: pb.visitCards, // Return all cards
    });
  } catch (err) {
    console.error("GET /api/patients/visit-card/by-book/:bookNumber error:", err);
    return res
      .status(500)
      .json({ error: "failed to load visit card for patient" });
  }
});

// PUT /api/patients/visit-card/:patientBookId
// Body: { type: "ADULT" | "CHILD", answers: object, signed?: boolean }
router.put("/visit-card/:patientBookId", async (req, res) => {
  try {
    const patientBookId = Number(req.params.patientBookId);
    if (!patientBookId || Number.isNaN(patientBookId)) {
      return res.status(400).json({ error: "Invalid patientBookId" });
    }

    const { type, answers, signed } = req.body || {};
    if (type !== "ADULT" && type !== "CHILD") {
      return res
        .status(400)
        .json({ error: "type must be 'ADULT' or 'CHILD'" });
    }

    // Ensure patientBook exists
    const pb = await prisma.patientBook.findUnique({
      where: { id: patientBookId },
      select: { id: true },
    });
    if (!pb) {
      return res.status(404).json({ error: "PatientBook not found" });
    }

    const now = new Date();

    // Use upsert with composite key (patientBookId, type)
    // This allows switching types and keeps separate cards per type
    const visitCard = await prisma.visitCard.upsert({
      where: {
        patientBookId_type: {
          patientBookId,
          type,
        },
      },
      create: {
        patientBookId,
        type,
        answers: answers ?? {},
        savedAt: now,
        signedAt: signed ? now : null,
      },
      update: {
        answers: answers ?? {},
        savedAt: now,
        // Keep existing signature if signed flag is false
        // In Prisma, undefined means "do not update this field"
        signedAt: signed ? now : undefined,
      },
    });

    return res.json({ visitCard });
  } catch (err) {
    console.error("PUT /api/patients/visit-card/:patientBookId error:", err);
    return res.status(500).json({ error: "failed to save visit card" });
  }

  
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\-]/g, "");
    const ts = Date.now();
    cb(null, `${base}_visitcard_${ts}${ext}`);
  },
});

const upload = multer({ storage });

// POST /api/patients/visit-card/:patientBookId/signature
// Body (form-data): file, type (ADULT or CHILD)
router.post(
  "/visit-card/:patientBookId/signature",
  upload.single("file"),
  async (req, res) => {
    try {
      const patientBookId = Number(req.params.patientBookId);
      if (!patientBookId || Number.isNaN(patientBookId)) {
        return res.status(400).json({ error: "Invalid patientBookId" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "file is required" });
      }

      // Get type from request body (form-data)
      const { type } = req.body || {};
      if (type !== "ADULT" && type !== "CHILD") {
        return res
          .status(400)
          .json({ error: "type must be 'ADULT' or 'CHILD'" });
      }

      const publicPath = `/media/${path.basename(req.file.path)}`;

      // Find the specific visit card for this type
      const existing = await prisma.visitCard.findUnique({
        where: {
          patientBookId_type: {
            patientBookId,
            type,
          },
        },
      });
      if (!existing) {
        return res.status(404).json({ error: "Visit card not found for this type" });
      }

      const updated = await prisma.visitCard.update({
        where: {
          patientBookId_type: {
            patientBookId,
            type,
          },
        },
        data: {
          patientSignaturePath: publicPath,
          signedAt: new Date(),
        },
      });

      return res.status(201).json({
        patientSignaturePath: updated.patientSignaturePath,
        signedAt: updated.signedAt,
        type: updated.type,
      });
    } catch (err) {
      console.error(
        "POST /api/patients/visit-card/:patientBookId/signature error:",
        err
      );
      return res.status(500).json({ error: "failed to save signature" });
    }
  }
);

// GET /api/patients/visit-card/:patientBookId/shared-signature
router.get("/visit-card/:patientBookId/shared-signature", async (req, res) => {
  try {
    const patientBookId = Number(req.params.patientBookId);
    if (!patientBookId || Number.isNaN(patientBookId)) {
      return res.status(400).json({ error: "Invalid patientBookId" });
    }

    const sharedSignature = await prisma.visitCardSharedSignature.findUnique({
      where: { patientBookId },
    });

    if (!sharedSignature) {
      return res.status(200).json(null);
    }

    return res.status(200).json({
      filePath: sharedSignature.filePath,
      signedAt: sharedSignature.signedAt,
    });
  } catch (err) {
    console.error(
      "GET /api/patients/visit-card/:patientBookId/shared-signature error:",
      err
    );
    return res.status(500).json({ error: "failed to fetch shared signature" });
  }
});

// POST /api/patients/visit-card/:patientBookId/shared-signature
// Body (form-data): file
router.post(
  "/visit-card/:patientBookId/shared-signature",
  upload.single("file"),
  async (req, res) => {
    try {
      const patientBookId = Number(req.params.patientBookId);
      if (!patientBookId || Number.isNaN(patientBookId)) {
        return res.status(400).json({ error: "Invalid patientBookId" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "file is required" });
      }

      const publicPath = `/media/${path.basename(req.file.path)}`;

      // Check if shared signature already exists
      const existing = await prisma.visitCardSharedSignature.findUnique({
        where: { patientBookId },
      });

      // If exists, we could optionally delete the old file here
      // For now, we'll just overwrite the record
      // TODO: Implement file cleanup if needed

      // Upsert the shared signature
      const sharedSignature = await prisma.visitCardSharedSignature.upsert({
        where: { patientBookId },
        update: {
          filePath: publicPath,
          signedAt: new Date(),
        },
        create: {
          patientBookId,
          filePath: publicPath,
          signedAt: new Date(),
        },
      });

      return res.status(201).json({
        filePath: sharedSignature.filePath,
        signedAt: sharedSignature.signedAt,
      });
    } catch (err) {
      console.error(
        "POST /api/patients/visit-card/:patientBookId/shared-signature error:",
        err
      );
      return res.status(500).json({ error: "failed to save shared signature" });
    }
  }
);

// GET /api/patients/ortho-card/by-book/:bookNumber
router.get("/ortho-card/by-book/:bookNumber", async (req, res) => {
  try {
    const { bookNumber } = req.params;
    if (!bookNumber) {
      return res.status(400).json({ error: "bookNumber is required" });
    }

    const pb = await prisma.patientBook.findUnique({
      where: { bookNumber },
      include: {
        orthoCard: true,
        patient: {
          include: { branch: true },
        },
      },
    });

    if (!pb || !pb.patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    return res.json({
      patientBook: { id: pb.id, bookNumber: pb.bookNumber },
      patient: pb.patient,
      orthoCard: pb.orthoCard, // may be null
    });
  } catch (err) {
    console.error(
      "GET /api/patients/ortho-card/by-book/:bookNumber error:",
      err
    );
    return res
      .status(500)
      .json({ error: "failed to load ortho card for patient" });
  }
});


// PUT /api/patients/ortho-card/:patientBookId
// Body: { data: object }
router.put("/ortho-card/:patientBookId", async (req, res) => {
  try {
    const patientBookId = Number(req.params.patientBookId);
    if (!patientBookId || Number.isNaN(patientBookId)) {
      return res.status(400).json({ error: "Invalid patientBookId" });
    }

    const { data } = req.body || {};
    if (!data || typeof data !== "object") {
      return res
        .status(400)
        .json({ error: "data must be a non-empty object" });
    }

    // Ensure patientBook exists
    const pb = await prisma.patientBook.findUnique({
      where: { id: patientBookId },
      select: { id: true },
    });
    if (!pb) {
      return res.status(404).json({ error: "PatientBook not found" });
    }

    const existing = await prisma.orthoCard.findUnique({
      where: { patientBookId },
    });

    let orthoCard;
    if (!existing) {
      orthoCard = await prisma.orthoCard.create({
        data: {
          patientBookId,
          data,
        },
      });
    } else {
      orthoCard = await prisma.orthoCard.update({
        where: { patientBookId },
        data: {
          data,
        },
      });
    }

    return res.json({ orthoCard });
  } catch (err) {
    console.error("PUT /api/patients/ortho-card/:patientBookId error:", err);
    return res.status(500).json({ error: "failed to save ortho card" });
  }
});

/**
 * GET /api/patients/:patientId/unpaid-encounters
 * 
 * Returns a list of encounters for the patient that have invoices
 * that are not fully paid (status UNPAID or PARTIAL, or remaining > 0).
 * 
 * This is used by the "Finish previous visit" (Өмнөх үзлэгийг дуусгах) feature
 * to allow doctors to continue working on previous unpaid encounters.
 */
router.get("/:patientId/unpaid-encounters", async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (!patientId || Number.isNaN(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }

    // Find patient and their patientBook
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        patientBook: true,
      },
    });

    if (!patient || !patient.patientBook) {
      return res.status(404).json({ error: "Patient or PatientBook not found" });
    }

    const patientBookId = patient.patientBook.id;

    // Find encounters with unpaid invoices
    const encounters = await prisma.encounter.findMany({
      where: {
        patientBookId: patientBookId,
        invoice: {
          isNot: null, // Has an invoice
        },
      },
      include: {
        doctor: {
          select: {
            id: true,
            ovog: true,
            name: true,
            email: true,
            role: true,
          },
        },
        invoice: {
          include: {
            payments: {
              select: {
                amount: true,
              },
            },
          },
        },
      },
      orderBy: {
        visitDate: "desc",
      },
    });

    // Helper function to calculate invoice amounts
    const calculateInvoiceAmounts = (invoice) => {
      const paidAmount = (invoice.payments || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const totalAmount = invoice.finalAmount != null
        ? Number(invoice.finalAmount)
        : Number(invoice.totalAmount || 0);
      const remaining = totalAmount - paidAmount;
      return { paidAmount, totalAmount, remaining };
    };

    // Filter to only unpaid/partially paid encounters
    const unpaidEncounters = encounters.filter((enc) => {
      const invoice = enc.invoice;
      if (!invoice) return false;

      const { remaining } = calculateInvoiceAmounts(invoice);
      // Include if there's a positive remaining balance
      return remaining > 0;
    });

    // Format response
    const result = unpaidEncounters.map((enc) => {
      const invoice = enc.invoice;
      const { paidAmount, totalAmount, remaining } = calculateInvoiceAmounts(invoice);

      return {
        encounterId: enc.id,
        visitDate: enc.visitDate,
        doctor: {
          id: enc.doctor.id,
          ovog: enc.doctor.ovog,
          name: enc.doctor.name,
          email: enc.doctor.email,
        },
        invoice: {
          id: invoice.id,
          totalAmount: totalAmount,
          paidAmount: paidAmount,
          remaining: remaining,
        },
      };
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /api/patients/:patientId/unpaid-encounters error:", err);
    return res.status(500).json({ error: "Failed to load unpaid encounters" });
  }
});

export default router;
