/**
 * Doctor Portal Router – /api/doctor
 *
 * All routes require:
 *   - authenticateJWT  (valid JWT cookie / Authorization header)
 *   - requireRole("doctor")
 *
 * The authenticated doctor's identity is always taken from req.user.id.
 * Client-supplied doctorId values are intentionally ignored for security.
 */
import express from "express";
import multer from "multer";
import path from "path";
import prisma from "../db.js";
import { authenticateJWT, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Apply auth + doctor role to every route in this router
router.use(authenticateJWT, requireRole("doctor"));

// ─── File upload config (reuses MEDIA_UPLOAD_DIR like patients.js) ────────────
const uploadDir = process.env.MEDIA_UPLOAD_DIR || "/data/media";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\-]/g, "");
    const ts = Date.now();
    cb(null, `${base}_doctorportal_${ts}${ext}`);
  },
});

const upload = multer({ storage });

// ─── Date helpers (same logic as doctors.js) ─────────────────────────────────

function parseYmd(ymd) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** Mongolia UTC+8 day boundaries */
function ymdToClinicStartEnd(ymd) {
  const start = new Date(`${ymd}T00:00:00.000+08:00`);
  const end = new Date(`${ymd}T23:59:59.999+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function diffDaysInclusive(fromYmd, toYmd) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return null;
  const start = new Date(a.y, a.m - 1, a.d, 0, 0, 0, 0);
  const end = new Date(b.y, b.m - 1, b.d, 0, 0, 0, 0);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

/** Current date string in Mongolia timezone (UTC+8).
 * Uses getTime() (Unix ms, always UTC-based) + 8h offset, then toISOString()
 * which always outputs UTC — so the resulting date string is correctly shifted
 * to UTC+8 regardless of the server's local timezone setting.
 */
function mongoliaLocalDateString() {
  const now = new Date();
  const mongoliaOffset = 8 * 60; // minutes
  const localTime = new Date(now.getTime() + mongoliaOffset * 60_000);
  return localTime.toISOString().slice(0, 10);
}

// ─── Helper: load appointment and verify ownership ────────────────────────────

/**
 * Loads an appointment by id and verifies doctorId === req.user.id.
 * Returns { appointment } on success, or sends an error response and returns null.
 *
 * @param {object} req
 * @param {object} res
 * @param {string|number} appointmentId
 * @param {{ requireOngoing?: boolean }} [opts]
 */
async function loadAndVerifyAppointment(req, res, appointmentId, opts = {}) {
  const id = Number(appointmentId);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid appointmentId" });
    return null;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: {
        include: { patientBook: { select: { id: true } } },
      },
    },
  });

  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return null;
  }

  if (appointment.doctorId !== req.user.id) {
    res.status(403).json({ error: "Forbidden. This appointment does not belong to you." });
    return null;
  }

  if (opts.requireOngoing && appointment.status !== "ongoing") {
    res.status(403).json({
      error: `This action requires appointment status 'ongoing'. Current status: '${appointment.status}'.`,
    });
    return null;
  }

  return appointment;
}

/**
 * Resolves patientBookId from an appointment that has already been verified.
 * Returns patientBookId or sends 404 and returns null.
 */
function resolvePatientBookId(appointment, res) {
  const patientBookId = appointment.patient?.patientBook?.id;
  if (!patientBookId) {
    res.status(404).json({ error: "Patient does not have a PatientBook yet." });
    return null;
  }
  return patientBookId;
}

// ═════════════════════════════════════════════════════════════════════════════
// A) GET /api/doctor/appointments
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/doctor/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *                              [&allStatuses=true]
 *                              [&withEncounterData=true]
 *
 * Returns the authenticated doctor's own appointments within the date range.
 * - doctorId is always derived from req.user.id (client-supplied value ignored).
 * - Filters out ONLY status === 'cancelled' (no_show is visible).
 * - Max range: 62 days (same as existing /api/doctors/:id/appointments).
 * - Response shape matches /api/doctors/:id/appointments for frontend compatibility.
 */
router.get("/appointments", async (req, res) => {
  try {
    const doctorId = req.user.id;

    const { from, to } = req.query;
    const allStatuses = req.query.allStatuses === "true";
    const withEncounterData = req.query.withEncounterData === "true";

    if (!from || !to) {
      return res.status(400).json({ error: "from and to date parameters are required (YYYY-MM-DD)" });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(from) || !datePattern.test(to)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    const days = diffDaysInclusive(from, to);
    if (days == null) return res.status(400).json({ error: "Invalid date range" });
    if (days < 1) return res.status(400).json({ error: "to date must be >= from date" });
    if (days > 62) return res.status(400).json({ error: "Date range too large (max 62 days)" });

    const fromRange = ymdToClinicStartEnd(from);
    const toRange = ymdToClinicStartEnd(to);
    if (!fromRange || !toRange) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const whereClause = {
      doctorId,
      scheduledAt: {
        gte: fromRange.start,
        lte: toRange.end,
      },
    };

    // Doctor portal rule: hide only 'cancelled' (intentionally inclusive of no_show and
    // all other statuses so doctors can see their full history).
    // Using { not: 'cancelled' } rather than an explicit inclusion list so that
    // newly-added statuses remain visible without requiring a code change.
    if (!allStatuses) {
      whereClause.status = { not: "cancelled" };
    }

    const patientSelect = {
      id: true,
      name: true,
      ovog: true,
      phone: true,
      patientBook: { select: { bookNumber: true } },
    };

    const includeClause = {
      patient: { select: patientSelect },
      branch: { select: { id: true, name: true } },
    };

    if (withEncounterData) {
      includeClause.encounters = {
        orderBy: { id: "desc" },
        take: 1,
        select: {
          id: true,
          _count: {
            select: {
              media: { where: { type: "XRAY" } },
              consents: true,
            },
          },
          prescription: {
            select: {
              id: true,
              _count: { select: { items: true } },
            },
          },
          invoice: {
            select: {
              eBarimtReceipt: { select: { id: true } },
            },
          },
        },
      };
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: includeClause,
      orderBy: { scheduledAt: allStatuses ? "desc" : "asc" },
    });

    const rows = appointments.map((a) => {
      const row = {
        id: a.id,
        patientId: a.patientId,
        branchId: a.branchId,
        doctorId: a.doctorId,
        scheduledAt: a.scheduledAt.toISOString(),
        endAt: a.endAt ? a.endAt.toISOString() : null,
        status: a.status,
        notes: a.notes || null,
        patientName: a.patient?.name || null,
        patientOvog: a.patient?.ovog || null,
        patientBookNumber: a.patient?.patientBook?.bookNumber || null,
        branchName: a.branch?.name || null,
      };

      if (withEncounterData) {
        row.patientPhone = a.patient?.phone || null;
        const enc = a.encounters?.[0] ?? null;
        let encounterId = null;
        let materialsCount = 0;
        if (enc) {
          encounterId = enc.id;
          const xrayCount = enc._count?.media ?? 0;
          const consentCount = enc._count?.consents ?? 0;
          const prescriptionHasItems = (enc.prescription?._count?.items ?? 0) > 0 ? 1 : 0;
          const ebarimtPresent = enc.invoice?.eBarimtReceipt ? 1 : 0;
          materialsCount = xrayCount + consentCount + prescriptionHasItems + ebarimtPresent;
        }
        row.encounterId = encounterId;
        row.materialsCount = materialsCount;
      }

      return row;
    });

    return res.json(rows);
  } catch (err) {
    console.error("GET /api/doctor/appointments error:", err);
    return res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// B) GET /api/doctor/sales-summary
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/doctor/sales-summary?date=YYYY-MM-DD
 *
 * Returns today's and current month's payment totals for the authenticated doctor.
 * date defaults to today in Mongolia timezone if omitted.
 */
router.get("/sales-summary", async (req, res) => {
  try {
    const doctorId = req.user.id;

    let targetDate = req.query.date;
    if (!targetDate) {
      targetDate = mongoliaLocalDateString();
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(targetDate)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    const dayRange = ymdToClinicStartEnd(targetDate);
    if (!dayRange) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const [year, month] = targetDate.split("-").map(Number);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const monthStartRange = ymdToClinicStartEnd(monthStart);
    const monthEndRange = ymdToClinicStartEnd(monthEnd);
    if (!monthStartRange || !monthEndRange) {
      return res.status(400).json({ error: "Failed to calculate month boundaries" });
    }

    const [todayPayments, monthPayments] = await Promise.all([
      prisma.payment.findMany({
        where: {
          timestamp: { gte: dayRange.start, lte: dayRange.end },
          invoice: { encounter: { doctorId } },
        },
        select: { amount: true },
      }),
      prisma.payment.findMany({
        where: {
          timestamp: { gte: monthStartRange.start, lte: monthEndRange.end },
          invoice: { encounter: { doctorId } },
        },
        select: { amount: true },
      }),
    ]);

    const todayTotal = todayPayments.reduce((sum, p) => sum + p.amount, 0);
    const monthTotal = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    return res.json({
      doctorId,
      date: targetDate,
      todayTotal,
      monthFrom: monthStart,
      monthTo: monthEnd,
      monthTotal,
    });
  } catch (err) {
    console.error("GET /api/doctor/sales-summary error:", err);
    return res.status(500).json({ error: "Failed to fetch sales summary" });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// C) POST /api/doctor/appointments/:appointmentId/encounter
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/doctor/appointments/:appointmentId/encounter
 *
 * Creates (or returns existing) encounter for the appointment.
 * Only allowed when appointment.status === 'ongoing'.
 * Returns { encounterId }.
 */
router.post("/appointments/:appointmentId/encounter", async (req, res) => {
  try {
    const appointment = await loadAndVerifyAppointment(
      req, res, req.params.appointmentId, { requireOngoing: true }
    );
    if (!appointment) return;

    // Resolve patientBook for the encounter
    const patientBookId = resolvePatientBookId(appointment, res);
    if (!patientBookId) return;

    // Return existing encounter if one already exists for this appointment
    const existing = await prisma.encounter.findFirst({
      where: { appointmentId: appointment.id },
      select: { id: true },
    });

    if (existing) {
      return res.json({ encounterId: existing.id });
    }

    // Create new encounter
    const encounter = await prisma.encounter.create({
      data: {
        patientBookId,
        doctorId: req.user.id,
        appointmentId: appointment.id,
        visitDate: new Date(),
      },
      select: { id: true },
    });

    return res.status(201).json({ encounterId: encounter.id });
  } catch (err) {
    console.error("POST /api/doctor/appointments/:appointmentId/encounter error:", err);
    return res.status(500).json({ error: "Failed to start encounter" });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// D) Visit card (Үзлэгийн карт) via appointment
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/doctor/appointments/:appointmentId/visit-card
 *
 * Returns visit card data for the patient linked to the appointment.
 * Readable regardless of appointment status (as long as it belongs to the doctor).
 */
router.get("/appointments/:appointmentId/visit-card", async (req, res) => {
  try {
    const appointment = await loadAndVerifyAppointment(req, res, req.params.appointmentId);
    if (!appointment) return;

    const patientBookId = resolvePatientBookId(appointment, res);
    if (!patientBookId) return;

    const pb = await prisma.patientBook.findUnique({
      where: { id: patientBookId },
      include: { visitCards: true },
    });

    if (!pb) {
      return res.status(404).json({ error: "PatientBook not found" });
    }

    // Find the active card (latest savedAt) for backwards compatibility
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
      patientBook: { id: pb.id },
      visitCard: activeCard,
      visitCards: pb.visitCards,
    });
  } catch (err) {
    console.error("GET /api/doctor/appointments/:appointmentId/visit-card error:", err);
    return res.status(500).json({ error: "Failed to load visit card" });
  }
});

/**
 * PUT /api/doctor/appointments/:appointmentId/visit-card
 * Body: { type: "ADULT"|"CHILD", answers: object, signed?: boolean }
 *
 * Editable ONLY when appointment.status === 'ongoing'.
 */
router.put("/appointments/:appointmentId/visit-card", async (req, res) => {
  try {
    const appointment = await loadAndVerifyAppointment(
      req, res, req.params.appointmentId, { requireOngoing: true }
    );
    if (!appointment) return;

    const patientBookId = resolvePatientBookId(appointment, res);
    if (!patientBookId) return;

    const { type, answers, signed } = req.body || {};
    if (type !== "ADULT" && type !== "CHILD") {
      return res.status(400).json({ error: "type must be 'ADULT' or 'CHILD'" });
    }

    const now = new Date();

    const visitCard = await prisma.visitCard.upsert({
      where: { patientBookId_type: { patientBookId, type } },
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
        signedAt: signed ? now : undefined,
      },
    });

    return res.json({ visitCard });
  } catch (err) {
    console.error("PUT /api/doctor/appointments/:appointmentId/visit-card error:", err);
    return res.status(500).json({ error: "Failed to save visit card" });
  }
});

/**
 * POST /api/doctor/appointments/:appointmentId/visit-card/signature
 * multipart/form-data: file, type (ADULT|CHILD)
 *
 * Writable ONLY when appointment.status === 'ongoing'.
 */
router.post(
  "/appointments/:appointmentId/visit-card/signature",
  upload.single("file"),
  async (req, res) => {
    try {
      const appointment = await loadAndVerifyAppointment(
        req, res, req.params.appointmentId, { requireOngoing: true }
      );
      if (!appointment) return;

      const patientBookId = resolvePatientBookId(appointment, res);
      if (!patientBookId) return;

      if (!req.file) {
        return res.status(400).json({ error: "file is required" });
      }

      const { type } = req.body || {};
      if (type !== "ADULT" && type !== "CHILD") {
        return res.status(400).json({ error: "type must be 'ADULT' or 'CHILD'" });
      }

      const publicPath = `/media/${path.basename(req.file.path)}`;

      const existing = await prisma.visitCard.findUnique({
        where: { patientBookId_type: { patientBookId, type } },
      });
      if (!existing) {
        return res.status(404).json({ error: "Visit card not found for this type" });
      }

      const updated = await prisma.visitCard.update({
        where: { patientBookId_type: { patientBookId, type } },
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
      console.error("POST /api/doctor/appointments/:appointmentId/visit-card/signature error:", err);
      return res.status(500).json({ error: "Failed to save signature" });
    }
  }
);

/**
 * POST /api/doctor/appointments/:appointmentId/visit-card/shared-signature
 * multipart/form-data: file
 *
 * Writable ONLY when appointment.status === 'ongoing'.
 */
router.post(
  "/appointments/:appointmentId/visit-card/shared-signature",
  upload.single("file"),
  async (req, res) => {
    try {
      const appointment = await loadAndVerifyAppointment(
        req, res, req.params.appointmentId, { requireOngoing: true }
      );
      if (!appointment) return;

      const patientBookId = resolvePatientBookId(appointment, res);
      if (!patientBookId) return;

      if (!req.file) {
        return res.status(400).json({ error: "file is required" });
      }

      const publicPath = `/media/${path.basename(req.file.path)}`;

      const sharedSignature = await prisma.visitCardSharedSignature.upsert({
        where: { patientBookId },
        update: { filePath: publicPath, signedAt: new Date() },
        create: { patientBookId, filePath: publicPath, signedAt: new Date() },
      });

      return res.status(201).json({
        filePath: sharedSignature.filePath,
        signedAt: sharedSignature.signedAt,
      });
    } catch (err) {
      console.error(
        "POST /api/doctor/appointments/:appointmentId/visit-card/shared-signature error:",
        err
      );
      return res.status(500).json({ error: "Failed to save shared signature" });
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// E) Ortho card (Гажиг заслын карт) via appointment
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/doctor/appointments/:appointmentId/ortho-card
 *
 * Returns the ortho card for the patient linked to the appointment.
 * Readable regardless of appointment status.
 */
router.get("/appointments/:appointmentId/ortho-card", async (req, res) => {
  try {
    const appointment = await loadAndVerifyAppointment(req, res, req.params.appointmentId);
    if (!appointment) return;

    const patientBookId = resolvePatientBookId(appointment, res);
    if (!patientBookId) return;

    const pb = await prisma.patientBook.findUnique({
      where: { id: patientBookId },
      include: { orthoCard: true },
    });

    if (!pb) {
      return res.status(404).json({ error: "PatientBook not found" });
    }

    return res.json({
      patientBook: { id: pb.id },
      orthoCard: pb.orthoCard ?? null,
    });
  } catch (err) {
    console.error("GET /api/doctor/appointments/:appointmentId/ortho-card error:", err);
    return res.status(500).json({ error: "Failed to load ortho card" });
  }
});

/**
 * PUT /api/doctor/appointments/:appointmentId/ortho-card
 * Body: { data: object }
 *
 * Editable ONLY when appointment.status === 'ongoing'.
 */
router.put("/appointments/:appointmentId/ortho-card", async (req, res) => {
  try {
    const appointment = await loadAndVerifyAppointment(
      req, res, req.params.appointmentId, { requireOngoing: true }
    );
    if (!appointment) return;

    const patientBookId = resolvePatientBookId(appointment, res);
    if (!patientBookId) return;

    const { data } = req.body || {};
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "data must be a non-empty object" });
    }

    const existing = await prisma.orthoCard.findUnique({ where: { patientBookId } });

    let orthoCard;
    if (!existing) {
      orthoCard = await prisma.orthoCard.create({ data: { patientBookId, data } });
    } else {
      orthoCard = await prisma.orthoCard.update({ where: { patientBookId }, data: { data } });
    }

    return res.json({ orthoCard });
  } catch (err) {
    console.error("PUT /api/doctor/appointments/:appointmentId/ortho-card error:", err);
    return res.status(500).json({ error: "Failed to save ortho card" });
  }
});

export default router;
