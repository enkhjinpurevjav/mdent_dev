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
import {
  discountPercentEnumToNumber,
  computeServiceNetProportionalDiscount,
  allocatePaymentProportionalByRemaining,
} from "../utils/incomeHelpers.js";

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

/** Convert a Date (or DateTime from DB) to YYYY-MM-DD in Mongolia timezone (UTC+8). */
function toMongoliaDateOnly(d) {
  if (!d) return null;
  try {
    const mongoliaOffset = 8 * 60; // minutes
    const shifted = new Date(new Date(d).getTime() + mongoliaOffset * 60_000);
    return shifted.toISOString().slice(0, 10);
  } catch {
    return null;
  }
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
      createdBy: { select: { id: true, name: true, ovog: true } },
      updatedBy: { select: { id: true, name: true, ovog: true } },
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
        createdAt: a.createdAt ? a.createdAt.toISOString() : null,
        updatedAt: a.updatedAt ? a.updatedAt.toISOString() : null,
        createdByUser: a.createdBy ? { id: a.createdBy.id, name: a.createdBy.name || null, ovog: a.createdBy.ovog || null } : null,
        updatedByUser: a.updatedBy ? { id: a.updatedBy.id, name: a.updatedBy.name || null, ovog: a.updatedBy.ovog || null } : null,
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
// B) GET /api/doctor/schedule
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/doctor/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the authenticated doctor's DoctorSchedule entries for the given date
 * range. Defaults to today → today+31 days (inclusive) in Mongolia timezone.
 *
 * Optional query params:
 *   from  – start date YYYY-MM-DD (defaults to today)
 *   to    – end date YYYY-MM-DD   (defaults to from + 31 days)
 *
 * The inclusive range must not exceed 31 days; requests beyond that are rejected
 * with 400.
 *
 * Response: Array of { id, date (YYYY-MM-DD), branch {id,name}, startTime, endTime, note }
 */
router.get("/schedule", async (req, res) => {
  try {
    const doctorId = req.user.id;

    const today = mongoliaLocalDateString();

    const fromYmd = req.query.from || today;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(fromYmd)) {
      return res.status(400).json({ error: "Invalid from date. Use YYYY-MM-DD" });
    }

    // Default to: from + 30 days (31 days inclusive)
    let toYmd = req.query.to;
    if (!toYmd) {
      const parsed = parseYmd(fromYmd);
      if (!parsed) return res.status(400).json({ error: "Invalid from date" });
      const toDate = new Date(parsed.y, parsed.m - 1, parsed.d);
      toDate.setDate(toDate.getDate() + 30);
      toYmd = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;
    }

    if (!datePattern.test(toYmd)) {
      return res.status(400).json({ error: "Invalid to date. Use YYYY-MM-DD" });
    }

    const rangedays = diffDaysInclusive(fromYmd, toYmd);
    if (rangedays === null || rangedays < 1) {
      return res.status(400).json({ error: "to must be >= from" });
    }
    if (rangedays > 31) {
      return res.status(400).json({ error: "Date range must not exceed 31 days" });
    }

    const fromRange = ymdToClinicStartEnd(fromYmd);
    const toRange = ymdToClinicStartEnd(toYmd);
    if (!fromRange || !toRange) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        doctorId,
        date: { gte: fromRange.start, lte: toRange.end },
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return res.json(
      schedules.map((s) => ({
        id: s.id,
        date: toMongoliaDateOnly(s.date) ?? s.date.toISOString().slice(0, 10),
        branch: s.branch,
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note ?? null,
      }))
    );
  } catch (err) {
    console.error("GET /api/doctor/schedule error:", err);
    return res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// C) GET /api/doctor/sales-summary
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

// ═════════════════════════════════════════════════════════════════════════════
// D) GET /api/doctor/sales-details   (category-level breakdown)
// ═════════════════════════════════════════════════════════════════════════════

const INCLUDED_METHODS = new Set(["CASH", "POS", "TRANSFER", "QPAY", "WALLET", "VOUCHER", "OTHER"]);
const EXCLUDED_METHODS = new Set(["EMPLOYEE_BENEFIT"]);
const OVERRIDE_METHODS = new Set(["INSURANCE", "APPLICATION"]);
const HOME_BLEACHING_SERVICE_CODE = 151;

const INCOME_LABELS = {
  IMAGING: "Зураг авах",
  ORTHODONTIC_TREATMENT: "Гажиг заслын эмчилгээ",
  DEFECT_CORRECTION: "Согог засал",
  SURGERY: "Мэс засал",
  GENERAL: "Ерөнхий",
  BARTER_EXCESS: "Бартер (800,000₮-с дээш)",
};

const METHOD_LABELS = {
  CASH: "Бэлэн",
  POS: "POS",
  TRANSFER: "Шилжүүлэг",
  QPAY: "QPay",
  WALLET: "Хэтэвч",
  VOUCHER: "Купон",
  OTHER: "Бусад",
  BARTER: "Бартер",
  INSURANCE: "Даатгал",
  APPLICATION: "Апп",
};

function inIncomeRange(ts, start, endExclusive) {
  return ts >= start && ts < endExclusive;
}

function bucketKeyForService(service) {
  if (!service) return "GENERAL";
  if (service.category === "IMAGING") return "IMAGING";
  if (service.category === "ORTHODONTIC_TREATMENT") return "ORTHODONTIC_TREATMENT";
  if (service.category === "DEFECT_CORRECTION") return "DEFECT_CORRECTION";
  if (service.category === "SURGERY") return "SURGERY";
  return "GENERAL";
}

function initBuckets(cfg) {
  return {
    IMAGING: { key: "IMAGING", label: INCOME_LABELS.IMAGING, salesMnt: 0, incomeMnt: 0, pctUsed: Number(cfg?.imagingPct || 0) },
    ORTHODONTIC_TREATMENT: { key: "ORTHODONTIC_TREATMENT", label: INCOME_LABELS.ORTHODONTIC_TREATMENT, salesMnt: 0, incomeMnt: 0, pctUsed: Number(cfg?.orthoPct || 0) },
    DEFECT_CORRECTION: { key: "DEFECT_CORRECTION", label: INCOME_LABELS.DEFECT_CORRECTION, salesMnt: 0, incomeMnt: 0, pctUsed: Number(cfg?.defectPct || 0) },
    SURGERY: { key: "SURGERY", label: INCOME_LABELS.SURGERY, salesMnt: 0, incomeMnt: 0, pctUsed: Number(cfg?.surgeryPct || 0) },
    GENERAL: { key: "GENERAL", label: INCOME_LABELS.GENERAL, salesMnt: 0, incomeMnt: 0, pctUsed: Number(cfg?.generalPct || 0) },
    BARTER_EXCESS: { key: "BARTER_EXCESS", label: INCOME_LABELS.BARTER_EXCESS, salesMnt: 0, incomeMnt: 0, pctUsed: Number(cfg?.generalPct || 0) },
  };
}

/**
 * GET /api/doctor/sales-details?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Doctor-only endpoint. Returns the same category-level income breakdown as
 * the admin endpoint but restricted to the authenticated doctor (req.user.id).
 */
router.get("/sales-details", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required." });
  }

  const DOCTOR_ID = req.user.id;
  const start = new Date(`${String(startDate)}T00:00:00.000Z`);
  const endExclusive = new Date(`${String(endDate)}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  try {
    const doctorUser = await prisma.user.findUnique({
      where: { id: DOCTOR_ID },
      select: { id: true, name: true, ovog: true },
    });

    const homeBleachingDeductSetting = await prisma.settings.findUnique({
      where: { key: "finance.homeBleachingDeductAmountMnt" },
    });
    const homeBleachingDeductAmountMnt = Number(homeBleachingDeductSetting?.value || 0) || 0;

    const invoices = await prisma.invoice.findMany({
      where: {
        encounter: { doctorId: DOCTOR_ID },
        OR: [
          { createdAt: { gte: start, lt: endExclusive } },
          { payments: { some: { timestamp: { gte: start, lt: endExclusive } } } },
        ],
      },
      include: {
        encounter: {
          include: {
            doctor: { include: { commissionConfig: true } },
          },
        },
        items: { include: { service: true } },
        payments: {
          include: { allocations: { select: { invoiceItemId: true, amount: true } } },
        },
      },
    });

    const cfg = invoices?.[0]?.encounter?.doctor?.commissionConfig || null;
    const buckets = initBuckets(cfg);
    let totalSalesMnt = 0;
    let totalIncomeMnt = 0;

    for (const inv of invoices) {
      const payments = inv.payments || [];
      const hasOverride = payments.some((p) => OVERRIDE_METHODS.has(String(p.method).toUpperCase()));
      const status = String(inv.statusLegacy || "").toLowerCase();
      const isPaid = status === "paid";

      const discountPct = discountPercentEnumToNumber(inv.discountPercent);
      const serviceItems = (inv.items || []).filter(
        (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
      );
      if (!serviceItems.length) continue;

      const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);
      const nonImagingServiceItems = serviceItems.filter((it) => it.service?.category !== "IMAGING");
      const totalAllServiceNet = serviceItems.reduce((sum, it) => sum + (lineNets.get(it.id) || 0), 0);
      const totalNonImagingNet = nonImagingServiceItems.reduce((sum, it) => sum + (lineNets.get(it.id) || 0), 0);
      const nonImagingRatio = totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;

      const itemById = new Map(serviceItems.map((it) => [it.id, it]));
      const serviceLineIds = serviceItems.map((it) => it.id);
      const remainingDue = new Map(serviceItems.map((it) => [it.id, lineNets.get(it.id) || 0]));
      const itemAllocationBase = new Map(serviceItems.map((it) => [it.id, 0]));
      let barterSum = 0;

      const sortedPayments = [...payments].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      for (const p of sortedPayments) {
        const method = String(p.method || "").toUpperCase();
        const ts = new Date(p.timestamp);
        if (!inIncomeRange(ts, start, endExclusive)) continue;
        if (EXCLUDED_METHODS.has(method)) continue;
        if (method === "BARTER") { barterSum += Number(p.amount || 0); continue; }
        if (!INCLUDED_METHODS.has(method) && !OVERRIDE_METHODS.has(method)) continue;

        const payAmt = Number(p.amount || 0);
        const payAllocs = p.allocations || [];
        if (payAllocs.length > 0) {
          for (const alloc of payAllocs) {
            const item = itemById.get(alloc.invoiceItemId);
            if (!item) continue;
            const allocAmt = Number(alloc.amount || 0);
            itemAllocationBase.set(item.id, (itemAllocationBase.get(item.id) || 0) + allocAmt);
            remainingDue.set(item.id, Math.max(0, (remainingDue.get(item.id) || 0) - allocAmt));
          }
        } else {
          const allocs = allocatePaymentProportionalByRemaining(payAmt, serviceLineIds, remainingDue);
          for (const [id, amt] of allocs) {
            itemAllocationBase.set(id, (itemAllocationBase.get(id) || 0) + amt);
          }
        }
      }

      if (hasOverride) {
        if (isPaid && inv.createdAt >= start && inv.createdAt < endExclusive) {
          for (const it of nonImagingServiceItems) {
            const lineNet = lineNets.get(it.id) || 0;
            if (lineNet <= 0) continue;
            const amt = lineNet * 0.9;
            const k = bucketKeyForService(it.service);
            buckets[k].salesMnt += amt;
            totalSalesMnt += amt;
          }
        }
      } else {
        for (const it of nonImagingServiceItems) {
          const amt = itemAllocationBase.get(it.id) || 0;
          if (amt <= 0) continue;
          const k = bucketKeyForService(it.service);
          buckets[k].salesMnt += amt;
          totalSalesMnt += amt;
        }
        const barterExcess = Math.max(0, barterSum - 800000);
        if (barterExcess > 0) {
          const allocatedBarterExcess = barterExcess * nonImagingRatio;
          buckets.BARTER_EXCESS.salesMnt += allocatedBarterExcess;
          totalSalesMnt += allocatedBarterExcess;
          const generalPct = Number(cfg?.generalPct || 0);
          const barterIncome = allocatedBarterExcess * (generalPct / 100);
          buckets.BARTER_EXCESS.incomeMnt += barterIncome;
          totalIncomeMnt += barterIncome;
        }
      }

      {
        const orthoPct = Number(cfg?.orthoPct || 0);
        const defectPct = Number(cfg?.defectPct || 0);
        const surgeryPct = Number(cfg?.surgeryPct || 0);
        const generalPct = Number(cfg?.generalPct || 0);
        const imagingPct = Number(cfg?.imagingPct || 0);
        const feeMultiplier = hasOverride ? 0.9 : 1;

        for (const it of serviceItems) {
          const service = it.service;
          const lineNet = (itemAllocationBase.get(it.id) || 0) * feeMultiplier;
          if (lineNet <= 0) continue;

          if (service?.category === "IMAGING") {
            if (it.meta?.assignedTo === "DOCTOR") {
              const income = lineNet * (imagingPct / 100);
              buckets.IMAGING.incomeMnt += income;
              totalIncomeMnt += income;
            }
            continue;
          }

          if (Number(it.service?.code) === HOME_BLEACHING_SERVICE_CODE) {
            const base = Math.max(0, lineNet - homeBleachingDeductAmountMnt);
            const income = base * (generalPct / 100);
            buckets.GENERAL.incomeMnt += income;
            totalIncomeMnt += income;
            continue;
          }

          const k = bucketKeyForService(service);
          let pct = generalPct;
          if (k === "ORTHODONTIC_TREATMENT") pct = orthoPct;
          else if (k === "DEFECT_CORRECTION") pct = defectPct;
          else if (k === "SURGERY") pct = surgeryPct;

          const income = lineNet * (pct / 100);
          buckets[k].incomeMnt += income;
          totalIncomeMnt += income;
        }
      }
    }

    const categories = [
      buckets.IMAGING,
      buckets.ORTHODONTIC_TREATMENT,
      buckets.DEFECT_CORRECTION,
      buckets.SURGERY,
      buckets.GENERAL,
      buckets.BARTER_EXCESS,
    ].map((r) => ({
      ...r,
      salesMnt: Math.round(r.salesMnt),
      incomeMnt: Math.round(r.incomeMnt),
      pctUsed: Number(r.pctUsed || 0),
    }));

    return res.json({
      doctorId: DOCTOR_ID,
      doctorName: doctorUser?.name ?? null,
      doctorOvog: doctorUser?.ovog ?? null,
      startDate: String(startDate),
      endDate: String(endDate),
      categories,
      totals: {
        totalSalesMnt: Math.round(totalSalesMnt),
        totalIncomeMnt: Math.round(totalIncomeMnt),
      },
    });
  } catch (err) {
    console.error("GET /api/doctor/sales-details error:", err);
    return res.status(500).json({ error: "Failed to fetch sales details." });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// E) GET /api/doctor/sales-details/lines   (drill-down line items)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/doctor/sales-details/lines?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&category=...
 *
 * Doctor-only endpoint. Returns line-item drill-down for a specific sales category,
 * restricted to the authenticated doctor (req.user.id).
 */
router.get("/sales-details/lines", async (req, res) => {
  const { startDate, endDate, category } = req.query;
  if (!startDate || !endDate || !category) {
    return res.status(400).json({ error: "startDate, endDate, and category are required." });
  }

  const DOCTOR_ID = req.user.id;
  const start = new Date(`${String(startDate)}T00:00:00.000Z`);
  const endExclusive = new Date(`${String(endDate)}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const categoryKey = String(category).toUpperCase();
  const VALID_CATEGORIES = ["IMAGING", "ORTHODONTIC_TREATMENT", "DEFECT_CORRECTION", "SURGERY", "GENERAL", "BARTER_EXCESS"];
  if (!VALID_CATEGORIES.includes(categoryKey)) {
    return res.status(400).json({ error: "Invalid category." });
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        encounter: { doctorId: DOCTOR_ID },
        OR: [
          { createdAt: { gte: start, lt: endExclusive } },
          { payments: { some: { timestamp: { gte: start, lt: endExclusive } } } },
        ],
      },
      include: {
        encounter: {
          include: {
            doctor: { include: { commissionConfig: true } },
            appointment: { select: { id: true, scheduledAt: true } },
            patientBook: {
              include: {
                patient: { select: { id: true, ovog: true, name: true } },
              },
            },
          },
        },
        items: { include: { service: true } },
        payments: {
          include: { allocations: { select: { invoiceItemId: true, amount: true } } },
        },
      },
    });

    const lines = [];

    for (const inv of invoices) {
      const encounter = inv.encounter;
      const payments = inv.payments || [];
      const hasOverride = payments.some((p) => OVERRIDE_METHODS.has(String(p.method).toUpperCase()));
      const feeMultiplier = hasOverride ? 0.9 : 1;

      const discountPct = discountPercentEnumToNumber(inv.discountPercent);
      const serviceItems = (inv.items || []).filter(
        (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
      );
      if (!serviceItems.length) continue;

      const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);
      const serviceLineIds = serviceItems.map((it) => it.id);
      const itemById = new Map(serviceItems.map((it) => [it.id, it]));
      const remainingDue = new Map(serviceItems.map((it) => [it.id, lineNets.get(it.id) || 0]));
      const itemAllocationBase = new Map(serviceItems.map((it) => [it.id, 0]));
      let barterSum = 0;
      const methodsInRange = new Set();

      const sortedPayments = [...payments].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      for (const p of sortedPayments) {
        const method = String(p.method || "").toUpperCase();
        const ts = new Date(p.timestamp);
        if (!inIncomeRange(ts, start, endExclusive)) continue;
        if (EXCLUDED_METHODS.has(method)) continue;
        if (method === "BARTER") { barterSum += Number(p.amount || 0); continue; }
        if (!INCLUDED_METHODS.has(method) && !OVERRIDE_METHODS.has(method)) continue;

        methodsInRange.add(method);
        const payAmt = Number(p.amount || 0);
        const payAllocs = p.allocations || [];
        if (payAllocs.length > 0) {
          for (const alloc of payAllocs) {
            const item = itemById.get(alloc.invoiceItemId);
            if (!item) continue;
            const allocAmt = Number(alloc.amount || 0);
            itemAllocationBase.set(item.id, (itemAllocationBase.get(item.id) || 0) + allocAmt);
            remainingDue.set(item.id, Math.max(0, (remainingDue.get(item.id) || 0) - allocAmt));
          }
        } else {
          const allocs = allocatePaymentProportionalByRemaining(payAmt, serviceLineIds, remainingDue);
          for (const [id, amt] of allocs) {
            itemAllocationBase.set(id, (itemAllocationBase.get(id) || 0) + amt);
          }
        }
      }

      const methodArr = [...methodsInRange];
      let paymentMethodLabel;
      if (methodArr.length === 0) paymentMethodLabel = null;
      else if (methodArr.length === 1) paymentMethodLabel = METHOD_LABELS[methodArr[0]] || methodArr[0];
      else paymentMethodLabel = "Mixed";

      const appointment = encounter?.appointment;
      const patient = encounter?.patientBook?.patient;
      const encounterId = inv.encounterId ?? null;
      const appointmentId = encounter?.appointmentId ?? null;
      const visitDateStr = encounter?.visitDate ? encounter.visitDate.toISOString() : null;
      const appointmentScheduledAtStr = appointment?.scheduledAt ? appointment.scheduledAt.toISOString() : null;

      const rowBase = {
        invoiceId: inv.id,
        encounterId,
        appointmentId,
        appointmentScheduledAt: appointmentScheduledAtStr,
        visitDate: visitDateStr,
        patientId: patient?.id ?? null,
        patientOvog: patient?.ovog ?? null,
        patientName: patient?.name ?? null,
      };

      if (categoryKey === "BARTER_EXCESS") {
        const nonImagingServiceItems = serviceItems.filter((it) => it.service?.category !== "IMAGING");
        const totalAllServiceNet = serviceItems.reduce((sum, it) => sum + (lineNets.get(it.id) || 0), 0);
        const totalNonImagingNet = nonImagingServiceItems.reduce((sum, it) => sum + (lineNets.get(it.id) || 0), 0);
        const nonImagingRatio = totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;
        const barterExcess = Math.max(0, barterSum - 800000);
        if (barterExcess <= 0) continue;

        const allocatedBarterExcess = barterExcess * nonImagingRatio;
        lines.push({
          ...rowBase,
          serviceName: "Бартер илүүдэл",
          serviceCategory: "BARTER_EXCESS",
          priceMnt: Math.round(barterSum),
          discountMnt: 0,
          netAfterDiscountMnt: Math.round(allocatedBarterExcess),
          allocatedPaidMnt: Math.round(allocatedBarterExcess),
          paymentMethodLabel: "Бартер",
        });
        continue;
      }

      for (const it of serviceItems) {
        let itemBucketKey;
        if (it.service?.category === "IMAGING") {
          if (categoryKey !== "IMAGING") continue;
          if (it.meta?.assignedTo !== "DOCTOR") continue;
          itemBucketKey = "IMAGING";
        } else {
          itemBucketKey = bucketKeyForService(it.service);
          if (itemBucketKey !== categoryKey) continue;
        }

        const allocBase = itemAllocationBase.get(it.id) || 0;
        const allocatedPaid = Math.round(allocBase * feeMultiplier);
        if (allocatedPaid <= 0) continue;

        const grossAmount = Number(it.lineTotal || 0);
        const netAfterDiscount = lineNets.get(it.id) || 0;
        const discountAmount = Math.max(0, grossAmount - netAfterDiscount);

        lines.push({
          ...rowBase,
          serviceName: it.service?.name || it.name,
          serviceCategory: it.service?.category || "GENERAL",
          priceMnt: Math.round(grossAmount),
          discountMnt: Math.round(discountAmount),
          netAfterDiscountMnt: Math.round(netAfterDiscount),
          allocatedPaidMnt: allocatedPaid,
          paymentMethodLabel,
        });
      }
    }

    lines.sort((a, b) => {
      const dateA = a.appointmentScheduledAt || a.visitDate;
      const dateB = b.appointmentScheduledAt || b.visitDate;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return res.json(lines);
  } catch (err) {
    console.error("GET /api/doctor/sales-details/lines error:", err);
    return res.status(500).json({ error: "Failed to fetch sales detail lines." });
  }
});

export default router;
