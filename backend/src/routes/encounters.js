import express from "express";
import prisma from "../db.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticateJWT, optionalAuthenticateJWT } from "../middleware/auth.js";
import { finalizeSterilizationForEncounter } from "../services/sterilizationFinalize.js";
import { sseBroadcast } from "./appointments.js";

const router = express.Router();

/**
 * Authorization middleware for encounter write endpoints.
 *
 * Rules:
 * - admin / super_admin: always allowed.
 * - doctor: allowed only when
 *     1) encounter.doctorId === req.user.id  (ownership)
 *     2) the linked appointment.status === 'ongoing'  (not finished)
 * - Any other role (or unauthenticated): 403.
 *
 * Usage: add as a route-level middleware before the handler, e.g.
 *   router.put("/:id/prescription", requireEncounterWriteAccess, async (req, res) => { ... })
 *
 * The middleware extracts the encounter id from req.params.id or
 * req.params.encounterId (whichever is present).
 */
async function requireEncounterWriteAccess(req, res, next) {
  // Skip auth when DISABLE_AUTH is set (development bypass)
  if (process.env.DISABLE_AUTH === "true") return next();

  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const { role, id: userId } = req.user;

  // Admins are always allowed
  if (role === "admin" || role === "super_admin") return next();

  // Doctors must own the encounter AND the appointment must be ongoing
  if (role === "doctor") {
    const rawId = req.params.encounterId ?? req.params.id;
    const encounterId = Number(rawId);
    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: {
        doctorId: true,
        appointment: { select: { status: true } },
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    if (encounter.doctorId !== userId) {
      return res.status(403).json({ error: "Forbidden. This encounter does not belong to you." });
    }

    const apptStatus = encounter.appointment?.status;
    if (apptStatus !== "ongoing") {
      return res.status(403).json({
        error: `Encounters can only be edited while the appointment is 'ongoing'. Current status: '${apptStatus ?? "unknown"}'.`,
      });
    }

    return next();
  }

  // All other roles are forbidden
  return res.status(403).json({ error: "Forbidden. Insufficient role." });
}

// --- Media upload config ---
const uploadDir = process.env.MEDIA_UPLOAD_DIR || "/data/media";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\-]/g, "");
    const ts = Date.now();
    cb(null, `${base}_${ts}${ext}`);
  },
});

const upload = multer({ storage });

/**
 * GET /api/encounters/:id
 * Returns full encounter details including all nested relations.
 * 
 * Diagnosis data returned includes:
 * - All EncounterDiagnosis rows (with toothCode, note, selectedProblemIds)
 * - Nested diagnosis with active problems (diagnosis.problems)
 * - Nested sterilizationIndicators for each diagnosis row
 * 
 * This ensures the UI has all data needed to display diagnosis cards after page refresh.
 * The response aliases 'diagnoses' to 'encounterDiagnoses' to match frontend expectations.
 */
router.get("/:id", async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patientBook: {
          include: {
            patient: {
              include: {
                branch: true,
              },
            },
          },
        },
        doctor: true,
        nurse: true,
        diagnoses: {
  include: {
    diagnosis: {
      include: {
        problems: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: { id: true, label: true, order: true, active: true, diagnosisId: true },
        },
      },
    },
    sterilizationIndicators: {
      include: {
        indicator: {
          select: {
            id: true,
            packageName: true,
            code: true,
            branchId: true,
          },
        },
      },
    },
    draftAttachments: {
      include: {
        cycle: { select: { id: true, code: true } },
        tool: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    },
    problemTexts: {
      orderBy: { order: "asc" },
    },
  },
  orderBy: { createdAt: "asc" },
},
        encounterServices: {
          include: {
            service: true,
            texts: {
              orderBy: { order: "asc" },
            },
          },
          orderBy: { id: "asc" },
        },
        invoice: {
          include: {
            items: { orderBy: { id: "asc" } },
            payments: true,
            eBarimtReceipt: true,
            branch: true,
            encounter: true,
            patient: true,
            ledgerEntries: true,
          },
        },
        prescription: {
          include: {
            items: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    const result = { ...encounter, encounterDiagnoses: encounter.diagnoses };
    return res.json(result);
  } catch (err) {
    console.error("GET /api/encounters/:id error:", err);
    return res.status(500).json({ error: "Failed to load encounter" });
  }
});

/**
 * ============================
 * CONSENT FORMS (multi-type)
 * ============================
 *
 * DB constraint: UNIQUE(encounterId, type)
 *
 * New API:
 *  - GET  /api/encounters/:id/consents
 *  - PUT  /api/encounters/:id/consents/:type
 *  - POST /api/encounters/:id/consents/:type/patient-signature   (multipart file=<png>)
 *  - POST /api/encounters/:id/consents/:type/doctor-signature    (attach from encounter doctor profile)
 *
 * Legacy API (kept for backward compatibility):
 *  - GET /api/encounters/:id/consent   (latest)
 *  - PUT /api/encounters/:id/consent   (delete all when type null, else upsert by encounterId_type)
 */

/**
 * NEW: GET /api/encounters/:id/consents
 * Returns ALL consent forms for this encounter (0..N).
 */
router.get("/:id/consents", async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const consents = await prisma.encounterConsent.findMany({
      where: { encounterId },
      orderBy: { updatedAt: "desc" },
    });

    return res.json(consents);
  } catch (err) {
    console.error("GET /api/encounters/:id/consents error:", err);
    return res.status(500).json({ error: "Failed to load encounter consents" });
  }
});

/**
 * NEW: PUT /api/encounters/:id/consents/:type
 * Body: { answers?: object | null }
 *
 * - answers === null -> delete consent of that type
 * - else -> upsert consent of that type
 */
router.put("/:id/consents/:type", requireEncounterWriteAccess, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    const type = String(req.params.type || "").trim();

    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }
    if (!type) {
      return res.status(400).json({ error: "Invalid consent type" });
    }

    const { answers } = req.body || {};

    // Ensure encounter exists
    const existingEncounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true },
    });
    if (!existingEncounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    if (answers === null) {
      await prisma.encounterConsent.deleteMany({
        where: { encounterId, type },
      });
      return res.json(null);
    }

    const consent = await prisma.encounterConsent.upsert({
      where: { encounterId_type: { encounterId, type } },
      create: { encounterId, type, answers: answers ?? {} },
      update: { answers: answers ?? {} },
    });

    return res.json(consent);
  } catch (err) {
    console.error("PUT /api/encounters/:id/consents/:type error:", err);
    return res.status(500).json({ error: "Failed to save encounter consent" });
  }
});

/**
 * POST /api/encounters/:id/patient-signature
 * multipart/form-data: file=<png>
 *
 * Saves patient/guardian drawn signature for this encounter.
 * Shared across all consent forms.
 */
router.post(
  "/:id/patient-signature",
  requireEncounterWriteAccess,
  upload.single("file"),
  async (req, res) => {
    try {
      const encounterId = Number(req.params.id);

      if (!encounterId || Number.isNaN(encounterId)) {
        return res.status(400).json({ error: "Invalid encounter id" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "file is required" });
      }

      const publicPath = `/media/${path.basename(req.file.path)}`;

      const encounter = await prisma.encounter.update({
        where: { id: encounterId },
        data: {
          patientSignaturePath: publicPath,
          patientSignedAt: new Date(),
        },
        select: {
          patientSignaturePath: true,
          patientSignedAt: true,
        },
      });

      return res.json({
        patientSignaturePath: encounter.patientSignaturePath,
        patientSignedAt: encounter.patientSignedAt,
      });
    } catch (err) {
      console.error(
        "POST /api/encounters/:id/patient-signature error:",
        err
      );
      return res.status(500).json({ error: "Failed to save patient signature" });
    }
  }
);

/**
 * POST /api/encounters/:id/doctor-signature
 * multipart/form-data (optional): file=<png>
 *
 * Saves doctor signature for this encounter (shared across all consent forms).
 * - If file is provided: upload and store
 * - If no file: attach from doctor's profile signatureImagePath
 */
router.post(
  "/:id/doctor-signature",
  requireEncounterWriteAccess,
  upload.single("file"),
  async (req, res) => {
    try {
      const encounterId = Number(req.params.id);

      if (!encounterId || Number.isNaN(encounterId)) {
        return res.status(400).json({ error: "Invalid encounter id" });
      }

      let signaturePath = null;

      if (req.file) {
        // File uploaded - use it
        signaturePath = `/media/${path.basename(req.file.path)}`;
      } else {
        // No file - attach from doctor profile
        const enc = await prisma.encounter.findUnique({
          where: { id: encounterId },
          select: {
            id: true,
            doctor: { select: { signatureImagePath: true } },
          },
        });

        if (!enc) return res.status(404).json({ error: "Encounter not found" });

        signaturePath = enc.doctor?.signatureImagePath || null;
        if (!signaturePath) {
          return res.status(400).json({
            error: "Doctor signature not found. Upload signature on doctor profile first.",
          });
        }
      }

      const encounter = await prisma.encounter.update({
        where: { id: encounterId },
        data: {
          doctorSignaturePath: signaturePath,
          doctorSignedAt: new Date(),
        },
        select: {
          doctorSignaturePath: true,
          doctorSignedAt: true,
        },
      });

      return res.json({
        doctorSignaturePath: encounter.doctorSignaturePath,
        doctorSignedAt: encounter.doctorSignedAt,
      });
    } catch (err) {
      console.error(
        "POST /api/encounters/:id/doctor-signature error:",
        err
      );
      return res.status(500).json({ error: "Failed to attach doctor signature" });
    }
  }
);

/**
 * LEGACY: GET /api/encounters/:id/consent
 * Returns latest consent (or null).
 */
router.get("/:id/consent", async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const consent = await prisma.encounterConsent.findFirst({
      where: { encounterId },
      orderBy: { updatedAt: "desc" },
    });

    return res.json(consent || null);
  } catch (err) {
    console.error("GET /api/encounters/:id/consent error:", err);
    return res.status(500).json({ error: "Failed to load encounter consent" });
  }
});

/**
 * LEGACY: PUT /api/encounters/:id/consent
 * Body: { type: string | null, answers?: object }
 *
 * - If type is null -> delete ALL consents for encounter
 * - Otherwise upsert consent for that type (by encounterId_type)
 */
router.put("/:id/consent", requireEncounterWriteAccess, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const { type, answers } = req.body || {};

    // Ensure encounter exists
    const existingEncounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true },
    });
    if (!existingEncounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    // No type => remove ALL consents
    if (type === null || type === undefined || String(type).trim() === "") {
      await prisma.encounterConsent.deleteMany({
        where: { encounterId },
      });
      return res.json(null);
    }

    const typeStr = String(type).trim();

    const consent = await prisma.encounterConsent.upsert({
      where: { encounterId_type: { encounterId, type: typeStr } },
      create: {
        encounterId,
        type: typeStr,
        answers: answers ?? {},
      },
      update: {
        answers: answers ?? {},
      },
    });

    return res.json(consent);
  } catch (err) {
    console.error("PUT /api/encounters/:id/consent error:", err);
    return res.status(500).json({ error: "Failed to save encounter consent" });
  }
});

/**
 * GET /api/encounters/:id/nurses
 * Returns nurses scheduled on the encounter's visitDate and branch.
 */
router.get("/:id/nurses", async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    // Load encounter with patient & branch to infer branchId + date
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patientBook: {
          include: {
            patient: {
              include: { branch: true },
            },
          },
        },
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    const visitDate = new Date(encounter.visitDate);
    if (Number.isNaN(visitDate.getTime())) {
      return res.status(400).json({ error: "Invalid encounter date" });
    }

    // Normalize date to day range [start, end)
    visitDate.setHours(0, 0, 0, 0);
    const start = new Date(visitDate);
    const end = new Date(visitDate);
    end.setDate(end.getDate() + 1);

    const branchId = encounter.patientBook.patient.branchId;

    const whereSchedule = {
      date: {
        gte: start,
        lt: end,
      },
    };

    if (branchId) {
      whereSchedule.branchId = branchId;
    }

    const schedules = await prisma.nurseSchedule.findMany({
      where: whereSchedule,
      include: {
        nurse: {
          select: {
            id: true,
            email: true,
            name: true,
            ovog: true,
            phone: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    if (!schedules.length) {
      return res.json({ count: 0, items: [] });
    }

    // Group by nurseId so each nurse appears once with their schedules
    const map = new Map();
    for (const s of schedules) {
      if (!map.has(s.nurseId)) {
        map.set(s.nurseId, {
          nurseId: s.nurseId,
          name: s.nurse.name,
          ovog: s.nurse.ovog,
          email: s.nurse.email,
          phone: s.nurse.phone || null,
          schedules: [],
        });
      }
      const entry = map.get(s.nurseId);
      entry.schedules.push({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        branch: s.branch,
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      });
    }

    const items = Array.from(map.values());
    return res.json({ count: items.length, items });
  } catch (err) {
    console.error("GET /api/encounters/:id/nurses error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load nurses for encounter" });
  }
});



/**
 * PUT /api/encounters/:id/services
 * Body: { items: Array<{ serviceId, quantity?, assignedTo?, diagnosisId? }> }
 *
 * NOTE: Frontend sends partial updates (only services for edited diagnosis rows).
 * This endpoint uses SAFE PARTIAL-UPDATE semantics:
 * - Empty array: returns current services, does not delete anything
 * - Non-empty array: only deletes/recreates services for diagnosis IDs present in payload
 * - Services for other diagnosis rows remain unchanged
 */
router.put("/:id/services", requireEncounterWriteAccess, async (req, res) => {
  const encounterId = Number(req.params.id);
  if (!encounterId || Number.isNaN(encounterId)) {
    return res.status(400).json({ error: "Invalid encounter id" });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "items must be an array" });
  }

  try {
    // SAFETY: empty payload must not wipe everything
    if (items.length === 0) {
      const current = await prisma.encounterService.findMany({
        where: { encounterId },
        include: { service: true },
        orderBy: { id: "asc" },
      });
      return res.json(current);
    }

    // Load encounter with appointment to check imaging status
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        appointment: {
          select: { status: true },
        },
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    const isImagingEncounter = encounter.appointment?.status === "imaging";

    await prisma.$transaction(async (trx) => {
      const diagnosisRowIds = Array.from(
        new Set(
          items
            .map((x) => Number(x.diagnosisId))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );

      // Delete only services for the diagnosis row(s) in payload
      if (diagnosisRowIds.length > 0) {
        await trx.encounterService.deleteMany({
          where: {
            encounterId,
            OR: diagnosisRowIds.map((did) => ({
              meta: { path: ["diagnosisId"], equals: did },
            })),
          },
        });
      } else {
        // If no diagnosisId in payload, don't delete anything (avoid mass wipe)
      }

      for (const item of items) {
        const serviceId = Number(item.serviceId);
        if (!Number.isFinite(serviceId) || serviceId <= 0) continue;

        const svc = await trx.service.findUnique({
          where: { id: serviceId },
          select: { price: true, category: true },
        });
        if (!svc) continue;

        // Build meta object, preserving keys and adding toothScope for imaging
        const meta = {
          assignedTo: item.assignedTo ?? "DOCTOR",
          diagnosisId: item.diagnosisId ?? null,
        };

        // Add nurseId for IMAGING services assigned to NURSE
        if (meta.assignedTo === "NURSE" && item.nurseId != null) {
          meta.nurseId = Number(item.nurseId);
        }

        // Add toothScope for imaging encounters
        if (isImagingEncounter) {
          meta.toothScope = "ALL";
        }

        await trx.encounterService.create({
          data: {
            encounterId,
            serviceId,
            quantity: item.quantity ?? 1,
            price: svc.category === "PREVIOUS" ? 0 : svc.price,
            meta,
          },
        });
      }
    });

    const updated = await prisma.encounterService.findMany({
      where: { encounterId },
      include: { service: true },
      orderBy: { id: "asc" },
    });

    return res.json(updated);
  } catch (err) {
    console.error("PUT /api/encounters/:id/services error:", err);
    return res.status(500).json({ error: "Failed to save services" });
  }
});

/**
 * PUT /api/encounters/:id/nurse
 * Body: { nurseId: number | null }
 */
router.put("/:id/nurse", requireEncounterWriteAccess, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const { nurseId } = req.body || {};

    let nurseIdValue = null;

    if (nurseId !== null && nurseId !== undefined) {
      const nid = Number(nurseId);
      if (!nid || Number.isNaN(nid)) {
        return res.status(400).json({ error: "Invalid nurse id" });
      }

      const nurse = await prisma.user.findUnique({
        where: { id: nid },
        select: { id: true, role: true },
      });

      if (!nurse || nurse.role !== "nurse") {
        return res.status(404).json({ error: "Nurse not found" });
      }

      nurseIdValue = nid;
    }

    const updated = await prisma.encounter.update({
      where: { id: encounterId },
      data: { nurseId: nurseIdValue },
      include: { nurse: true },
    });

    return res.json({ nurse: updated.nurse });
  } catch (err) {
    console.error("PUT /api/encounters/:id/nurse error:", err);
    return res.status(500).json({ error: "Failed to update nurse" });
  }
});

/**
 * PUT /api/encounters/:id/prescription
 */
router.put("/:id/prescription", requireEncounterWriteAccess, async (req, res) => {
  const encounterId = Number(req.params.id);
  if (!encounterId || Number.isNaN(encounterId)) {
    return res.status(400).json({ error: "Invalid encounter id" });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "items must be an array" });
  }

  try {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patientBook: { include: { patient: true } },
        doctor: true,
        prescription: { include: { items: true } },
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    // Normalize + filter items (max 3, non-empty drugName)
    const normalized = items
      .map((raw) => ({
        drugName: typeof raw.drugName === "string" ? raw.drugName.trim() : "",
        durationDays: Number(raw.durationDays) || 1,
        quantityPerTake: Number(raw.quantityPerTake) || 1,
        frequencyPerDay: Number(raw.frequencyPerDay) || 1,
        note:
          typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null,
      }))
      .filter((it) => it.drugName.length > 0)
      .slice(0, 3);

    // If no valid items -> delete existing prescription (if any) and return null
    if (normalized.length === 0) {
      if (encounter.prescription) {
        await prisma.prescriptionItem.deleteMany({
          where: { prescriptionId: encounter.prescription.id },
        });
        await prisma.prescription.delete({
          where: { id: encounter.prescription.id },
        });
      }
      return res.json({ prescription: null });
    }

    const patient = encounter.patientBook?.patient;
    const doctor = encounter.doctor;

    const doctorNameSnapshot = doctor
      ? (doctor.name && doctor.name.trim()) || (doctor.email || "").split("@")[0]
      : null;

    const patientNameSnapshot = patient
      ? `${patient.ovog ? patient.ovog.charAt(0) + ". " : ""}${patient.name || ""}`.trim()
      : null;

    const diagnosisSummary = "";

    // Upsert prescription + items in a transaction
    const updatedPrescription = await prisma.$transaction(async (trx) => {
      let prescription = encounter.prescription;

      if (!prescription) {
        prescription = await trx.prescription.create({
          data: {
            encounterId,
            doctorNameSnapshot,
            patientNameSnapshot,
            diagnosisSummary,
            clinicNameSnapshot: patient?.branch?.name || null,
          },
        });
      } else {
        prescription = await trx.prescription.update({
          where: { id: prescription.id },
          data: {
            doctorNameSnapshot,
            patientNameSnapshot,
            diagnosisSummary,
            clinicNameSnapshot: patient?.branch?.name || null,
          },
        });

        await trx.prescriptionItem.deleteMany({
          where: { prescriptionId: prescription.id },
        });
      }

      for (let i = 0; i < normalized.length; i++) {
        const it = normalized[i];
        await trx.prescriptionItem.create({
          data: {
            prescriptionId: prescription.id,
            order: i + 1,
            drugName: it.drugName,
            durationDays: it.durationDays > 0 ? it.durationDays : 1,
            quantityPerTake: it.quantityPerTake > 0 ? it.quantityPerTake : 1,
            frequencyPerDay: it.frequencyPerDay > 0 ? it.frequencyPerDay : 1,
            note: it.note,
          },
        });
      }

      return trx.prescription.findUnique({
        where: { id: prescription.id },
        include: {
          items: {
            orderBy: { order: "asc" },
          },
        },
      });
    });

    return res.json({ prescription: updatedPrescription });
  } catch (err) {
    console.error("PUT /api/encounters/:id/prescription error:", err);
    return res.status(500).json({ error: "Failed to save prescription" });
  }
});

/**
 * GET /api/encounters/:id/chart-teeth
 */
router.get("/:id/chart-teeth", async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const chartTeeth = await prisma.chartTooth.findMany({
      where: { encounterId },
      orderBy: { id: "asc" },
      include: {
        chartNotes: true,
      },
    });

    return res.json(chartTeeth);
  } catch (err) {
    console.error("GET /api/encounters/:id/chart-teeth error:", err);
    return res.status(500).json({ error: "Failed to load tooth chart" });
  }
});

/**
 * PUT /api/encounters/:id/chart-teeth
 */
router.put("/:id/chart-teeth", requireEncounterWriteAccess, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const { teeth } = req.body || {};
    if (!Array.isArray(teeth)) {
      return res.status(400).json({ error: "teeth must be an array" });
    }

    await prisma.$transaction(async (trx) => {
      await trx.chartTooth.deleteMany({ where: { encounterId } });

      for (const t of teeth) {
        if (!t || typeof t.toothCode !== "string" || !t.toothCode.trim()) {
          continue;
        }

        const toothGroup =
          typeof t.toothGroup === "string" && t.toothGroup.trim()
            ? t.toothGroup.trim()
            : null;

        await trx.chartTooth.create({
          data: {
            encounterId,
            toothCode: t.toothCode.trim(),
            toothGroup,
            status: t.status || null,
            notes: t.notes || null,
          },
        });
      }
    });

    const updated = await prisma.chartTooth.findMany({
      where: { encounterId },
      orderBy: { id: "asc" },
      include: { chartNotes: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error("PUT /api/encounters/:id/chart-teeth error", err);
    return res.status(500).json({ error: "Failed to save tooth chart" });
  }
});

/**
 * PUT /api/encounters/:id/finish
 *
 * Doctor finishes encounter → mark related appointment as ready_to_pay
 * NEW: Also finalizes sterilization draft attachments
 */
router.put("/:id/finish", requireEncounterWriteAccess, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { appointment: true },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    // NEW: Finalize sterilization draft attachments
    let sterilizationResult = null;
    try {
      sterilizationResult = await finalizeSterilizationForEncounter(encounterId);
    } catch (sterilizationErr) {
      console.error("Sterilization finalization error:", sterilizationErr);
      // Log error but don't block encounter finish
      sterilizationResult = { error: sterilizationErr.message };
    }

    // Update appointment status if linked
    let updatedAppointment = null;
    if (encounter.appointmentId && encounter.appointment) {
      updatedAppointment = await prisma.appointment.update({
        where: { id: encounter.appointmentId },
        data: {
          // NOTE: make sure this matches your AppointmentStatus enum value
          status: "ready_to_pay",
        },
        include: {
          patient: { select: { id: true, name: true, ovog: true, phone: true, patientBook: true } },
          doctor: { select: { id: true, name: true, ovog: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // Broadcast SSE so Appointments page reflects "ready_to_pay" immediately
      if (updatedAppointment.scheduledAt) {
        const apptDate = updatedAppointment.scheduledAt.toISOString().slice(0, 10);
        sseBroadcast("appointment_updated", updatedAppointment, apptDate, updatedAppointment.branchId);
      }
    }

    return res.json({ 
      ok: true, 
      updatedAppointment,
      sterilization: sterilizationResult,
    });
  } catch (err) {
    console.error("PUT /api/encounters/:id/finish error:", err);
    return res.status(500).json({
      error: "Үзлэг дууссаны төлөв шинэчлэх үед алдаа гарлаа.",
    });
  }
});

/**
 * GET /api/encounters/:id/media
 */
router.get("/:id/media", async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const { type } = req.query;
    const where = { encounterId };
    if (typeof type === "string" && type.trim()) {
      where.type = type.trim();
    }

    const media = await prisma.media.findMany({
      where,
      orderBy: { id: "asc" },
    });

    return res.json(media);
  } catch (err) {
    console.error("GET /api/encounters/:id/media error:", err);
    return res.status(500).json({ error: "Failed to load media" });
  }
});

/**
 * POST /api/encounters/:id/media
 * 
 * Note: XRAY users should only be able to upload when appointment.status === "imaging"
 * After ready_to_pay (and later statuses), XRAY becomes read-only.
 */
router.post("/:id/media", requireEncounterWriteAccess, upload.single("file"), async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    // Check if XRAY is allowed to upload (only during imaging status)
    // Note: Full enforcement requires authentication to check user role
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        appointment: true,
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    // TODO: When authentication is fully implemented, add role-based check to block XRAY users
    // from uploading media after appointment moves to ready_to_pay/partial_paid/completed status:
    // if (req.user?.role === 'xray' && 
    //     ["ready_to_pay", "partial_paid", "completed"].includes(encounter.appointment?.status)) {
    //   return res.status(403).json({ 
    //     error: "XRAY users cannot modify media after appointment moves to payment status" 
    //   });
    // }

    const { toothCode, type } = req.body || {};
    const mediaType = typeof type === "string" && type.trim() ? type.trim() : "XRAY";

    const publicPath = `/media/${path.basename(req.file.path)}`;

    const media = await prisma.media.create({
      data: {
        encounterId,
        filePath: publicPath,
        toothCode:
          typeof toothCode === "string" && toothCode.trim() ? toothCode.trim() : null,
        type: mediaType,
      },
    });

    return res.status(201).json(media);
  } catch (err) {
    console.error("POST /api/encounters/:id/media error:", err);
    return res.status(500).json({ error: "Failed to upload media" });
  }
});

/**
 * DELETE /api/encounters/:encounterId/media/:mediaId
 * Deletes a media item from an encounter.
 * - Validates that the media belongs to the encounter
 * - Deletes the DB record
 * - Attempts to delete the file from disk (best effort)
 */
router.delete("/:encounterId/media/:mediaId", requireEncounterWriteAccess, async (req, res) => {
  try {
    const encounterId = Number(req.params.encounterId);
    const mediaId = Number(req.params.mediaId);
    
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }
    
    if (!mediaId || Number.isNaN(mediaId)) {
      return res.status(400).json({ error: "Invalid media id" });
    }

    // Find the media to ensure it belongs to this encounter
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    if (media.encounterId !== encounterId) {
      return res.status(403).json({ error: "Media does not belong to this encounter" });
    }

    // Delete from database
    await prisma.media.delete({
      where: { id: mediaId },
    });

    // Best effort: attempt to delete file from disk
    try {
      const filePath = media.filePath.startsWith("/")
        ? media.filePath.substring(1)
        : media.filePath;
      const fullPath = path.join(uploadDir, path.basename(filePath));
      
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (fileErr) {
      // Log but don't fail the request if file deletion fails
      console.warn(`Failed to delete file for media ${mediaId}:`, fileErr);
    }

    return res.status(200).json({ success: true, message: "Media deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/encounters/:encounterId/media/:mediaId error:", err);
    return res.status(500).json({ error: "Failed to delete media" });
  }
});

/**
 * PUT /api/encounters/:id/diagnoses
 * Body: { items: Array<{ id?, diagnosisId, selectedProblemIds, note?, toothCode? }> }
 *
 * IMPORTANT: This endpoint is NON-DESTRUCTIVE and preserves all fields.
 * - If item.id exists: updates the existing EncounterDiagnosis row
 * - If item.id is missing: creates a new EncounterDiagnosis row
 * - Rows not in the payload are left unchanged (not deleted)
 * - All fields are preserved: diagnosisId, toothCode, selectedProblemIds, note
 * 
 * This prevents data loss on page refresh. Legacy encounterDiagnosesRouter had a 
 * destructive deleteMany+recreate pattern that would drop toothCode and other fields.
 * That route is now removed.
 *
 * Returns: Array of all encounter diagnosis rows with nested diagnosis.problems and 
 * sterilizationIndicators for UI display after save.
 */
router.put("/:id/diagnoses", requireEncounterWriteAccess, async (req, res) => {
  const encounterId = Number(req.params.id);
  if (!encounterId || Number.isNaN(encounterId)) {
    return res.status(400).json({ error: "Invalid encounter id" });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "items must be an array" });
  }

  try {
    await prisma.$transaction(async (trx) => {
      // PARTIAL UPDATE: only update/create rows in payload, do not delete others
      for (const item of items) {
        // ---- Validate diagnosisId type (to avoid silently dropping selectedProblemIds) ----
        if (
          item.diagnosisId !== null &&
          item.diagnosisId !== undefined &&
          item.diagnosisId !== ""
        ) {
          const n = Number(item.diagnosisId);
          if (!Number.isFinite(n) || n <= 0) {
            const err = new Error("diagnosisId must be a numeric ID, not a code string");
            err.statusCode = 400;
            err.received = item.diagnosisId;
            throw err;
          }
        }

        // normalize diagnosisId
        let diagnosisIdValue = null;
        if (
          item.diagnosisId !== null &&
          item.diagnosisId !== undefined &&
          item.diagnosisId !== ""
        ) {
          const n = Number(item.diagnosisId);
          diagnosisIdValue = Number.isFinite(n) && n > 0 ? n : null;
        }

        const toothCode =
          typeof item.toothCode === "string" && item.toothCode.trim()
            ? item.toothCode.trim()
            : null;

        const selectedProblemIdsRaw = Array.isArray(item.selectedProblemIds)
          ? item.selectedProblemIds
              .map((id) => Number(id))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        // Only allow problems when diagnosisId is present
        const selectedProblemIds = diagnosisIdValue ? selectedProblemIdsRaw : [];

        const data = {
          encounterId,
          diagnosisId: diagnosisIdValue,
          selectedProblemIds,
          note: item.note ?? null,
          toothCode,
        };

        const rowId = Number(item.id);
        if (Number.isFinite(rowId) && rowId > 0) {
          // update existing (stable id)
          await trx.encounterDiagnosis.update({
            where: { id: rowId },
            data,
          });
        } else {
          // create new
          await trx.encounterDiagnosis.create({ data });
        }
      }
    });

    const updated = await prisma.encounterDiagnosis.findMany({
      where: { encounterId },
      include: {
        diagnosis: {
          include: {
            problems: {
              where: { active: true },
              orderBy: [{ order: "asc" }, { id: "asc" }],
              select: { id: true, label: true, order: true, active: true, diagnosisId: true },
            },
          },
        },
        sterilizationIndicators: {
          include: {
            indicator: {
              select: { id: true, packageName: true, code: true, branchId: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return res.json(updated);
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({ error: err.message, received: err.received });
    }
    console.error("PUT /api/encounters/:id/diagnoses failed", err);
    return res.status(500).json({ error: "Failed to save diagnoses" });
  }
});

/**
 * PUT /api/encounters/:id/diagnoses/:diagnosisId/sterilization-indicators
 * Body: { indicatorIds: number[] }
 *
 * Replaces sterilization indicators for a single EncounterDiagnosis row.
 */
router.put("/:id/diagnoses/:diagnosisId/sterilization-indicators", requireEncounterWriteAccess, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    const diagnosisRowId = Number(req.params.diagnosisId);

    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }
    if (!diagnosisRowId || Number.isNaN(diagnosisRowId)) {
      return res.status(400).json({ error: "Invalid diagnosis id" });
    }

    const { indicatorIds } = req.body || {};
    if (!Array.isArray(indicatorIds)) {
      return res.status(400).json({ error: "indicatorIds must be an array" });
    }

    const ids = indicatorIds
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);

    // Safety net: Prevent accidental clearing of indicators
    // If indicatorIds is empty and no explicit replace flag, treat as no-op
    const replace = req.query.replace === "true";
    if (ids.length === 0 && !replace) {
      // Return current state without modification
      const current = await prisma.encounterDiagnosis.findUnique({
        where: { id: diagnosisRowId },
        include: {
          diagnosis: {
            include: {
              problems: {
                where: { active: true },
                orderBy: [{ order: "asc" }, { id: "asc" }],
                select: { id: true, label: true, order: true, active: true, diagnosisId: true },
              },
            },
          },
          sterilizationIndicators: {
            include: {
              indicator: { select: { id: true, packageName: true, code: true, branchId: true } },
            },
          },
        },
      });
      return res.json(current);
    }

    // Ensure this diagnosis row belongs to this encounter
    const row = await prisma.encounterDiagnosis.findFirst({
      where: { id: diagnosisRowId, encounterId },
      select: { id: true },
    });
    if (!row) {
      return res.status(404).json({ error: "EncounterDiagnosis not found for this encounter" });
    }

    await prisma.$transaction(async (trx) => {
      await trx.encounterDiagnosisSterilizationIndicator.deleteMany({
        where: { encounterDiagnosisId: diagnosisRowId },
      });

      if (ids.length) {
        const existing = await trx.sterilizationIndicator.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        });
        const ok = new Set(existing.map((x) => x.id));

        for (const id of ids) {
          if (!ok.has(id)) continue;
          await trx.encounterDiagnosisSterilizationIndicator.create({
            data: { encounterDiagnosisId: diagnosisRowId, indicatorId: id },
          });
        }
      }
    });

    // Return updated diagnosis row with indicators
    const updated = await prisma.encounterDiagnosis.findUnique({
      where: { id: diagnosisRowId },
      include: {
        diagnosis: {
          include: {
            problems: {
              where: { active: true },
              orderBy: [{ order: "asc" }, { id: "asc" }],
              select: { id: true, label: true, order: true, active: true, diagnosisId: true },
            },
          },
        },
        sterilizationIndicators: {
          include: {
            indicator: { select: { id: true, packageName: true, code: true, branchId: true } },
          },
        },
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error(
      "PUT /api/encounters/:id/diagnoses/:diagnosisId/sterilization-indicators error:",
      err
    );
    return res.status(500).json({ error: "Failed to save sterilization indicators" });
  }
});

/**
 * PUT /api/encounters/:encounterId/diagnosis-rows
 * 
 * Unified save/overwrite endpoint for the "Онош хадгалах" button.
 * Handles diagnoses, indicators, and services in a single atomic operation.
 * 
 * REQUEST BODY:
 * {
 *   rows: Array<{
 *     id?: number | null,           // DB id for existing rows
 *     localId: string | number,     // Client-side stable identifier (echoed back)
 *     diagnosisId?: number | null,  // Can be null for general service row
 *     toothCode?: string | null,    // "Бүх шүд" for general service row
 *     note?: string | null,
 *     selectedProblemIds: number[],
 *     indicatorIds: number[],       // Empty array clears indicators
 *     serviceId?: number | null,    // Empty/null removes service
 *     assignedTo?: "DOCTOR" | "NURSE"
 *   }>
 * }
 * 
 * BEHAVIOR:
 * - Processes each row atomically (per-row transaction)
 * - Upserts EncounterDiagnosis (create if no id, update if id exists)
 * - Replaces sterilization indicators to match indicatorIds exactly
 * - Replaces service for that diagnosis row (delete if serviceId is null/missing)
 * - After all row attempts, hard-deletes any EncounterDiagnosis not in payload
 * - Enforces only one "Бүх шүд" row per encounter
 * - Partial save allowed: failed rows don't prevent successful rows from saving
 * 
 * RESPONSE:
 * {
 *   savedRows: Array<{ id, localId, ... }>,
 *   failedRows: Array<{ localId, error }>,
 *   deletedDiagnosisIds: number[]
 * }
 */
router.put("/:encounterId/diagnosis-rows", requireEncounterWriteAccess, async (req, res) => {
  const encounterId = Number(req.params.encounterId);
  if (!encounterId || Number.isNaN(encounterId)) {
    return res.status(400).json({ error: "Invalid encounter id" });
  }

  const { rows } = req.body || {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: "rows must be an array" });
  }

  try {
    // Verify encounter exists and load appointment to check if imaging
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        appointment: {
          select: { status: true },
        },
      },
    });
    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    const isImagingEncounter = encounter.appointment?.status === "imaging";

    // Validate "Бүх шүд" uniqueness in payload
    const generalServiceRows = rows.filter(
      (r) => r.toothCode && r.toothCode.trim() === "Бүх шүд"
    );
    if (generalServiceRows.length > 1) {
      return res.status(400).json({
        error: "Only one general service row (toothCode='Бүх шүд') is allowed per encounter",
      });
    }

    const savedRows = [];
    const failedRows = [];
    const processedIds = new Set();

    // Process each row atomically
    for (const row of rows) {
      const localId = row.localId ?? null;

      try {
        // Validate diagnosisId type
        let diagnosisIdValue = null;
        if (
          row.diagnosisId !== null &&
          row.diagnosisId !== undefined &&
          row.diagnosisId !== ""
        ) {
          const n = Number(row.diagnosisId);
          if (!Number.isFinite(n) || n <= 0) {
            throw new Error("diagnosisId must be a valid positive number");
          }
          diagnosisIdValue = n;
        }

        // Normalize inputs
        const toothCode =
          typeof row.toothCode === "string" && row.toothCode.trim()
            ? row.toothCode.trim()
            : null;

        const selectedProblemIdsRaw = Array.isArray(row.selectedProblemIds)
          ? row.selectedProblemIds
              .map((id) => Number(id))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        // Only allow problems when diagnosisId is present
        const selectedProblemIds = diagnosisIdValue ? selectedProblemIdsRaw : [];

        const indicatorIds = Array.isArray(row.indicatorIds)
          ? row.indicatorIds
              .map((id) => Number(id))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        let serviceIdValue = null;
        if (
          row.serviceId !== null &&
          row.serviceId !== undefined &&
          row.serviceId !== ""
        ) {
          const n = Number(row.serviceId);
          if (Number.isFinite(n) && n > 0) {
            serviceIdValue = n;
          }
        }

        const assignedTo = row.assignedTo === "NURSE" ? "NURSE" : "DOCTOR";

        // Use per-row transaction for atomicity
        const result = await prisma.$transaction(async (trx) => {
          // 1. Upsert EncounterDiagnosis
          const diagnosisData = {
            encounterId,
            diagnosisId: diagnosisIdValue,
            selectedProblemIds,
            note: row.note ?? null,
            toothCode,
          };

          let diagnosisRow;
          const rowId = Number(row.id);
          if (Number.isFinite(rowId) && rowId > 0) {
            // Update existing row
            diagnosisRow = await trx.encounterDiagnosis.update({
              where: { id: rowId },
              data: diagnosisData,
            });
          } else {
            // Create new row
            diagnosisRow = await trx.encounterDiagnosis.create({
              data: diagnosisData,
            });
          }

          const diagnosisRowId = diagnosisRow.id;

          // 2. Replace sterilization indicators
          await trx.encounterDiagnosisSterilizationIndicator.deleteMany({
            where: { encounterDiagnosisId: diagnosisRowId },
          });

          if (indicatorIds.length > 0) {
            // Verify indicators exist
            const existingIndicators = await trx.sterilizationIndicator.findMany({
              where: { id: { in: indicatorIds } },
              select: { id: true },
            });
            const validIds = new Set(existingIndicators.map((x) => x.id));

            for (const indicatorId of indicatorIds) {
              if (validIds.has(indicatorId)) {
                await trx.encounterDiagnosisSterilizationIndicator.create({
                  data: {
                    encounterDiagnosisId: diagnosisRowId,
                    indicatorId,
                  },
                });
              }
            }
          }

          // 2b. Upsert sterilization tool line draft attachments (NEW)
          const toolLineDrafts = Array.isArray(row.toolLineDrafts) ? row.toolLineDrafts : [];
          
          // Delete existing drafts for this diagnosis row first
          await trx.sterilizationDraftAttachment.deleteMany({
            where: { encounterDiagnosisId: diagnosisRowId },
          });
          
          if (toolLineDrafts.length > 0) {
            // Validate tool line drafts
            for (const draft of toolLineDrafts) {
              if (!Number.isInteger(draft.requestedQty) || draft.requestedQty < 1) {
                throw new Error(`Invalid requestedQty for toolLineId ${draft.toolLineId}: must be a positive integer`);
              }
            }
            
            // Get all tool lines to extract cycleId and toolId
            const toolLineIds = toolLineDrafts.map(d => d.toolLineId).filter(Boolean);
            const toolLines = await trx.autoclaveCycleToolLine.findMany({
              where: { id: { in: toolLineIds } },
              select: { id: true, cycleId: true, toolId: true },
            });
            
            const toolLineMap = new Map(toolLines.map(tl => [tl.id, tl]));
            
            // Create new drafts with toolLineId included
            for (const draft of toolLineDrafts) {
              const toolLine = toolLineMap.get(draft.toolLineId);
              if (toolLine) {
                await trx.sterilizationDraftAttachment.create({
                  data: {
                    encounterDiagnosisId: diagnosisRowId,
                    cycleId: toolLine.cycleId,
                    toolId: toolLine.toolId,
                    toolLineId: toolLine.id, // NEW: Store toolLineId for round-trip
                    requestedQty: draft.requestedQty,
                  },
                });
              }
            }
          }

          // 3. Upsert service for this diagnosis row (preserves EncounterServiceText)
          // Find existing service for this diagnosis row
          const existingService = await trx.encounterService.findFirst({
            where: {
              encounterId,
              meta: { path: ["diagnosisId"], equals: diagnosisRowId },
            },
          });

          if (serviceIdValue) {
            // Service ID is provided - create or update
            const service = await trx.service.findUnique({
              where: { id: serviceIdValue },
              select: { price: true, category: true },
            });

            if (service) {
              const effectivePrice = service.category === "PREVIOUS" ? 0 : service.price;
              // Build meta object, preserving keys and adding toothScope for imaging
              const meta = {
                assignedTo,
                diagnosisId: diagnosisRowId,
              };

              // Add toothScope for imaging encounters
              if (isImagingEncounter) {
                meta.toothScope = "ALL";
              }

              if (existingService) {
                // Update existing service (preserves texts)
                await trx.encounterService.update({
                  where: { id: existingService.id },
                  data: {
                    serviceId: serviceIdValue,
                    quantity: 1,
                    price: effectivePrice,
                    meta,
                  },
                });
              } else {
                // Create new service
                await trx.encounterService.create({
                  data: {
                    encounterId,
                    serviceId: serviceIdValue,
                    quantity: 1,
                    price: effectivePrice,
                    meta,
                  },
                });
              }
            }
          } else {
            // Service ID is null/empty - delete existing service if any (intentional removal)
            if (existingService) {
              await trx.encounterService.delete({
                where: { id: existingService.id },
              });
            }
          }

          return diagnosisRowId;
        });

        processedIds.add(result);

        // Fetch the saved row with all relations
        const savedRow = await prisma.encounterDiagnosis.findUnique({
          where: { id: result },
          include: {
            diagnosis: {
              include: {
                problems: {
                  where: { active: true },
                  orderBy: [{ order: "asc" }, { id: "asc" }],
                  select: {
                    id: true,
                    label: true,
                    order: true,
                    active: true,
                    diagnosisId: true,
                  },
                },
              },
            },
            sterilizationIndicators: {
              include: {
                indicator: {
                  select: {
                    id: true,
                    packageName: true,
                    code: true,
                    branchId: true,
                  },
                },
              },
            },
            draftAttachments: {
              include: {
                cycle: {
                  select: {
                    id: true,
                    code: true,
                  },
                },
                tool: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        });

        // Fetch service info for this diagnosis row
        const encounterService = await prisma.encounterService.findFirst({
          where: {
            encounterId,
            meta: { path: ["diagnosisId"], equals: result },
          },
          select: {
            id: true,
            serviceId: true,
            meta: true,
          },
        });

        savedRows.push({
          ...savedRow,
          localId,
          serviceId: encounterService?.serviceId ?? null,
          encounterServiceId: encounterService?.id ?? null,
          assignedTo: encounterService?.meta?.assignedTo ?? "DOCTOR",
          indicatorIds: savedRow.sterilizationIndicators.map((si) => si.indicatorId),
        });
      } catch (rowError) {
        console.error(
          `Failed to process row with localId ${localId}, id ${row.id ?? "none"}:`,
          rowError
        );
        failedRows.push({
          localId,
          id: row.id ?? null,
          error: rowError.message || "Unknown error occurred while saving row",
        });
      }
    }

    // 4. Hard-delete diagnosis rows not in payload
    const deletedDiagnosisIds = [];
    try {
      // Get all existing diagnosis rows for this encounter
      const existingRows = await prisma.encounterDiagnosis.findMany({
        where: { encounterId },
        select: { id: true },
      });

      const toDeleteIds = existingRows
        .map((r) => r.id)
        .filter((id) => !processedIds.has(id));

      if (toDeleteIds.length > 0) {
        // Delete associated services first (avoid orphans)
        await prisma.encounterService.deleteMany({
          where: {
            encounterId,
            OR: toDeleteIds.map((did) => ({
              meta: { path: ["diagnosisId"], equals: did },
            })),
          },
        });

        // Delete diagnosis rows (cascade will handle indicators)
        await prisma.encounterDiagnosis.deleteMany({
          where: {
            id: { in: toDeleteIds },
            encounterId, // Safety: ensure we only delete from this encounter
          },
        });

        deletedDiagnosisIds.push(...toDeleteIds);
      }
    } catch (deleteError) {
      console.error("Failed to delete diagnosis rows:", deleteError);
      // Don't fail the entire request if deletion fails
    }

    return res.json({
      savedRows,
      failedRows,
      deletedDiagnosisIds,
    });
  } catch (err) {
    console.error("PUT /api/encounters/:encounterId/diagnosis-rows failed:", err);
    return res.status(500).json({
      error: "Failed to save diagnosis rows",
      details: err.message,
    });
  }
});

/**
 * POST /api/encounters/:id/follow-up-appointments
 * Create a follow-up appointment with correct branch assignment.
 * The branchId is derived from the doctor's schedule for the selected date/time.
 * 
 * Uses optional authentication - if JWT token is provided and valid, createdByUserId
 * will be set. Otherwise, createdByUserId will be null (requires admin/receptionist to delete).
 */
router.post("/:id/follow-up-appointments", optionalAuthenticateJWT, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    if (!encounterId || Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounter id" });
    }

    const { slotStartIso, durationMinutes, note } = req.body || {};

    // Validate required fields
    if (!slotStartIso) {
      return res.status(400).json({ error: "slotStartIso is required" });
    }

    // Parse and validate slot start time
    const slotStart = new Date(slotStartIso);
    if (Number.isNaN(slotStart.getTime())) {
      return res.status(400).json({ error: "slotStartIso is invalid date" });
    }

    // Validate and set duration
    let duration = 30; // default
    if (durationMinutes !== undefined && durationMinutes !== null) {
      if (typeof durationMinutes !== "number" || durationMinutes <= 0) {
        return res.status(400).json({ error: "durationMinutes must be a positive number" });
      }
      duration = durationMinutes;
    }

    // Calculate end time
    const slotEnd = new Date(slotStart.getTime() + duration * 60_000);

    // Load encounter to get patientId and doctorId
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patientBook: {
          include: {
            patient: true,
          },
        },
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    if (!encounter.doctorId) {
      return res.status(400).json({ error: "Encounter has no doctor assigned" });
    }

    // Validate patient data is available
    if (!encounter.patientBook?.patient) {
      return res.status(400).json({ error: "Encounter has no patient assigned" });
    }

    const patientId = encounter.patientBook.patient.id;
    const doctorId = encounter.doctorId;

    // NOTE: Timezone handling - Server operates in local timezone (Asia/Ulaanbaatar)
    // The slotStart date comes from the client as ISO string, but we use local time methods
    // (getHours, getMinutes) for comparison with DoctorSchedule times which are also in local time.
    // This is consistent with the rest of the application's timezone handling.

    // Get the date portion for schedule lookup (in local timezone)
    // --- Timezone-safe local day range for Asia/Ulaanbaatar (UTC+8) ---
const TZ_OFFSET_MINUTES = 8 * 60;

// slotStart is already: const slotStart = new Date(slotStartIso);
const slotUtcMs = slotStart.getTime();

// Convert the UTC instant into "local wall time" ms by adding +8h,
// then read its Y/M/D using UTC getters.
const localMs = slotUtcMs + TZ_OFFSET_MINUTES * 60_000;
const local = new Date(localMs);

const y = local.getUTCFullYear();
const m = local.getUTCMonth();
const d = local.getUTCDate();

// Compute the UTC instant that corresponds to local midnight
const localMidnightUtcMs = Date.UTC(y, m, d) - TZ_OFFSET_MINUTES * 60_000;

const dayStart = new Date(localMidnightUtcMs);
const dayEnd = new Date(localMidnightUtcMs + 24 * 60 * 60_000);

// Also compute slot time in local minutes for schedule window comparison
const slotHourLocal = local.getUTCHours();
const slotMinuteLocal = local.getUTCMinutes();
const slotMinutes = slotHourLocal * 60 + slotMinuteLocal;

const slotTimeString = `${String(slotHourLocal).padStart(2, "0")}:${String(
  slotMinuteLocal
).padStart(2, "0")}`;

    // Find all schedules for this doctor on this date
    const schedules = await prisma.doctorSchedule.findMany({
      where: { doctorId, date: { gte: dayStart, lt: dayEnd } },
    });

    if (schedules.length === 0) {
      return res.status(400).json({
        error: "No schedule found for this doctor on the selected date",
      });
    }



    // Find the schedule that contains this time slot
    // Schedule times are stored as strings like "09:00", "17:00"
    let matchingSchedule = null;
    for (const schedule of schedules) {
      // Parse schedule times - validate format
      const startParts = schedule.startTime.split(":");
      const endParts = schedule.endTime.split(":");
      
      if (startParts.length !== 2 || endParts.length !== 2) {
        console.warn(`Invalid schedule time format: ${schedule.startTime} - ${schedule.endTime}`);
        continue;
      }

      const startHour = Number(startParts[0]);
      const startMin = Number(startParts[1]);
      const endHour = Number(endParts[0]);
      const endMin = Number(endParts[1]);

      if (Number.isNaN(startHour) || Number.isNaN(startMin) || Number.isNaN(endHour) || Number.isNaN(endMin)) {
        console.warn(`Invalid schedule time values: ${schedule.startTime} - ${schedule.endTime}`);
        continue;
      }

      // Convert to comparable time values (minutes from midnight)
      const scheduleStartMinutes = startHour * 60 + startMin;
      const scheduleEndMinutes = endHour * 60 + endMin;
      // const slotMinutes = slotHour * 60 + slotMinute;

      // Check if slot is within schedule window: startTime <= slotTime < endTime
      if (slotMinutes >= scheduleStartMinutes && slotMinutes < scheduleEndMinutes) {
        matchingSchedule = schedule;
        break;
      }
    }

    if (!matchingSchedule) {
      return res.status(400).json({
        error: `Selected time slot ${slotTimeString} is not within any schedule window for this doctor on this date`,
      });
    }

    // Use the branch from the matching schedule
    const branchId = matchingSchedule.branchId;

    // ===== CAPACITY ENFORCEMENT: Max 2 overlapping appointments =====
    // Query existing appointments for this doctor that overlap with the requested interval
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctorId,
        // Only count appointments with blocking statuses
        status: {
          in: ["booked", "confirmed", "ongoing", "online", "other"],
        },
        // Appointments that overlap with [slotStart, slotEnd)
        // Overlap condition: existingStart < slotEnd AND existingEnd > slotStart
        scheduledAt: { lt: slotEnd },
        OR: [
          { endAt: { gt: slotStart } },
          { endAt: null }, // null endAt means use default duration, consider as potential overlap
        ],
      },
      select: {
        id: true,
        scheduledAt: true,
        endAt: true,
      },
    });

    // Calculate maximum concurrent overlaps if this new appointment is added
    // We need to find the moment in time with the highest overlap count
    
    // Collect all time points (start and end times) including the new appointment
    const events = [];
    
    // Add existing appointments
    for (const apt of existingAppointments) {
      const aptStart = new Date(apt.scheduledAt);
      const aptEnd = apt.endAt ? new Date(apt.endAt) : new Date(aptStart.getTime() + 30 * 60_000);
      events.push({ time: aptStart.getTime(), type: 'start' });
      events.push({ time: aptEnd.getTime(), type: 'end' });
    }
    
    // Add the new appointment we're trying to create
    events.push({ time: slotStart.getTime(), type: 'start' });
    events.push({ time: slotEnd.getTime(), type: 'end' });
    
    // Sort events by time, with 'end' events before 'start' events at the same time
    events.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      // At same time: process 'end' before 'start' to get accurate count
      return a.type === 'end' ? -1 : 1;
    });
    
    // Sweep through events to find maximum concurrent appointments
    let currentCount = 0;
    let maxCount = 0;
    
    for (const event of events) {
      if (event.type === 'start') {
        currentCount++;
        maxCount = Math.max(maxCount, currentCount);
      } else {
        currentCount--;
      }
    }
    
    // If max concurrent count would exceed 2, reject the booking
    if (maxCount > 2) {
      return res.status(409).json({
        error: `Энэ цагт эмчийн дүүргэлт хэтэрсэн байна. Хамгийн ихдээ 2 давхцах цаг авах боломжтой. (Одоогийн давхцал: ${maxCount})`,
      });
    }

    // Create the appointment with provenance tracking
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patientId,
        doctorId: doctorId,
        branchId: branchId,
        scheduledAt: slotStart,
        endAt: slotEnd,
        status: "booked",
        notes: note ? `Давтан үзлэг(${encounterId}) — ${note}` : `Давтан үзлэг(${encounterId})`,
        // Provenance fields for deletion permission tracking
        createdByUserId: req.user?.id || null,
        source: "FOLLOW_UP_ENCOUNTER",
        sourceEncounterId: encounterId,
      },
      include: {
        patient: {
          include: {
            patientBook: true,
          },
        },
        doctor: true,
        branch: true,
      },
    });

    res.status(201).json(appointment);
  } catch (err) {
    console.error("Error creating follow-up appointment:", err);
    res.status(500).json({ error: "Failed to create follow-up appointment" });
  }
});

export default router;
