import express from "express";
import prisma from "../db.js";
import { copyXrayMediaToCanonical } from "../utils/imagingMediaCopy.js";


const router = express.Router();

// ---------------------------------------------------------------------------
// SSE subscriber store
// Key: `${date}:${branchId}` where branchId is "" for "all branches" mode.
// Value: Set of response objects for active SSE connections.
// ---------------------------------------------------------------------------
/** @type {Map<string, Set<import('express').Response>>} */
const sseSubscribers = new Map();

function sseKey(date, branchId) {
  return `${date}:${branchId ?? ""}`;
}

/**
 * Register an SSE response object for a given date + branchId scope.
 * Returns a cleanup function to call on disconnect.
 */
function sseSubscribe(date, branchId, res) {
  const key = sseKey(date, branchId);
  if (!sseSubscribers.has(key)) {
    sseSubscribers.set(key, new Set());
  }
  sseSubscribers.get(key).add(res);
  return () => {
    const set = sseSubscribers.get(key);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseSubscribers.delete(key);
    }
  };
}

/**
 * Broadcast an SSE event to all subscribers watching the given appointment.
 * Delivers to:
 *  1. Subscribers watching the exact (date, branchId) pair.
 *  2. Subscribers watching all branches for the date (branchId === "").
 *
 * @param {"appointment_created"|"appointment_updated"|"appointment_deleted"} event
 * @param {object} payload  - The appointment object (or minimal delete info).
 * @param {string} date     - YYYY-MM-DD
 * @param {string|number} branchId
 */
function sseBroadcast(event, payload, date, branchId) {
  const data = JSON.stringify(payload);
  const message = `event: ${event}\ndata: ${data}\n\n`;

  const keysToNotify = new Set([
    sseKey(date, String(branchId)),  // exact branch match
    sseKey(date, ""),                // all-branches subscribers for this date
  ]);

  for (const key of keysToNotify) {
    const subscribers = sseSubscribers.get(key);
    if (!subscribers) continue;
    for (const res of subscribers) {
      try {
        res.write(message);
        if (typeof res.flush === "function") res.flush();
      } catch {
        // ignore write errors; connection cleanup is handled by the 'close' event
      }
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/appointments/stream  — SSE endpoint
// Query params:
//   date=YYYY-MM-DD  (required)
//   branchId=<id>    (optional; omit or empty = all branches)
// ---------------------------------------------------------------------------
router.get("/stream", (req, res) => {
  const { date, branchId } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
  }

  const normalizedBranchId = branchId ? String(branchId) : "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/caddy response buffering
  res.flushHeaders();

  // Send an initial comment to establish the connection and confirm the client
  res.write(`: connected date=${date} branchId=${normalizedBranchId || "all"}\n\n`);
  if (typeof res.flush === "function") res.flush();

  const unsubscribe = sseSubscribe(date, normalizedBranchId, res);

  // Keep-alive ping every 25 seconds to prevent proxy timeouts
  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
      if (typeof res.flush === "function") res.flush();
    } catch {
      clearInterval(keepAlive);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

/** Format a Prisma user relation object into the { id, name, ovog } shape used by the frontend. */
function formatAuditUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name || null, ovog: user.ovog || null };
}

/**
 * Allowed appointment statuses (must match frontend + DB values)
 *
 * NOTE:
 * - These are the actual lowercase strings stored in Appointment.status.
 * - Frontend uses uppercase enums (BOOKED, ONGOING, etc.) which are normalized
 *   to these values via normalizeStatusForDb().
 */
const ALLOWED_STATUSES = [
  "booked",
  "confirmed",
  "online",
  "ongoing",
  "imaging", // Зураг авах (XRAY workflow)
  "ready_to_pay", // Төлбөр төлөхөд бэлэн
  "partial_paid", // Үлдэгдэлтэй
  "completed",
  "cancelled",
  "no_show",
  "other",
];

// AFTER (add online + no_show + other)
function normalizeStatusForDb(raw) {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase();

  switch (v) {
    case "booked":
    case "pending":
      return "booked";

    case "confirmed":
      return "confirmed";

    case "online":
      return "online";

    case "ongoing":
      return "ongoing";

    case "imaging":
      return "imaging";

    case "ready_to_pay":
    case "readytopay":
    case "ready-to-pay":
      return "ready_to_pay";

    case "partial_paid":
    case "partialpaid":
    case "partial-paid":
      return "partial_paid";

    case "completed":
      return "completed";

    case "cancelled":
    case "canceled":
      return "cancelled";

    case "no_show":
    case "noshow":
    case "no-show":
    case "no show":
      return "no_show";

    case "other":
    case "others":
      return "other";

    default:
      return undefined;
  }
}

/**
 * Parse a clinic-local date string (YYYY-MM-DD) into [startOfDay, endOfDay].
 * We rely on server local timezone (Ubuntu VPS, Asia/Ulaanbaatar).
 */
function parseClinicDay(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return null;
  const localStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { localStart, localEnd };
}

/**
 * Parse a naive timestamp string ("YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss")
 * into a JavaScript Date using **server local time** (Asia/Ulaanbaatar).
 *
 * This is intentionally deterministic: it never relies on Date's string parser
 * to avoid UTC vs. local-time ambiguity. The resulting Date object represents
 * the given wall-clock moment in the server's local timezone.
 *
 * Returns null if the string cannot be parsed.
 */
function parseNaiveTs(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    String(str ?? "")
  );
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
    0
  );
}

/**
 * Format a JavaScript Date as a naive timestamp string "YYYY-MM-DD HH:mm:ss"
 * in the server's local timezone (Asia/Ulaanbaatar).
 *
 * Use this instead of .toISOString() for appointment times so the value
 * returned to clients is a timezone-independent wall-clock string.
 */
function toNaiveTs(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * Extract the YYYY-MM-DD date portion from a naive timestamp string or a Date.
 * Used for SSE broadcast keying.
 */
function naiveTsToYmd(value) {
  if (value instanceof Date) return toNaiveTs(value)?.slice(0, 10) ?? null;
  if (typeof value === "string") return String(value).slice(0, 10);
  return null;
}


/**
 * Helper: Ensure an Encounter exists for an appointment.
 * Given appointment id, load appointment including patient and patientBook, 
 * doctorId, scheduledAt. Ensure PatientBook exists using upsert 
 * (avoid unique constraint errors). Find latest Encounter by appointmentId 
 * (order desc). If missing, create Encounter with patientBookId, doctorId, 
 * visitDate=appointment.scheduledAt, appointmentId. Return encounter.
 */
async function ensureEncounterForAppointment(appointmentId) {
  // Load appointment with patient + patientBook
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        include: {
          patientBook: true,
        },
      },
    },
  });

  if (!appt) {
    throw new Error("Appointment not found");
  }

  if (!appt.patient) {
    throw new Error("Appointment has no patient linked");
  }

  if (!appt.doctorId) {
    throw new Error("Appointment has no doctor assigned");
  }

  // Ensure PatientBook exists using upsert
  const book = await prisma.patientBook.upsert({
    where: { patientId: appt.patient.id },
    update: {},
    create: {
      patientId: appt.patient.id,
      bookNumber: String(appt.patient.id),
    },
  });

  // Find latest Encounter by appointmentId
  let encounter = await prisma.encounter.findFirst({
    where: { appointmentId },
    orderBy: { id: "desc" },
  });

  // If missing, create Encounter
  if (!encounter) {
    encounter = await prisma.encounter.create({
      data: {
        patientBookId: book.id,
        doctorId: appt.doctorId,
        visitDate: appt.scheduledAt,
        appointmentId,
      },
    });
  }

  return encounter;
}

/**
 * GET /api/appointments
 *
 * Used by:
 *  - Appointment calendar
 *  - Үзлэг pages (Цаг захиалсан, Үзлэг хийж буй, Дууссан)
 *
 * Query parameters:
 *  - status=BOOKED|ONGOING|COMPLETED|CANCELLED|READY_TO_PAY|CONFIRMED|ALL
 *  - date=YYYY-MM-DD           (legacy: single day)
 *  - dateFrom=YYYY-MM-DD       (start of range)
 *  - dateTo=YYYY-MM-DD         (end of range)
 *  - includeCancelled=true     (for booked list: booked + cancelled)
 *  - branchId=number
 *  - doctorId=number
 *  - patientId=number
 *  - search=string             (patient name / regNo / phone)
 *
 * Response:
 *  Array of rows shaped for frontend AppointmentRow:
 *  - id, patientName, regNo, branchName, doctorName, status, startTime, endTime
 */
router.get("/", async (req, res) => {
  try {
    const {
      date,
      dateFrom,
      dateTo,
      branchId,
      doctorId,
      patientId,
      status,
      includeCancelled,
      search,
    } = req.query || {};

    const where = {};

    // ----------------- Branch / doctor / patient filters -----------------
    if (branchId) {
      const parsed = Number(branchId);
      if (!Number.isNaN(parsed)) where.branchId = parsed;
    }

    if (doctorId) {
      const parsed = Number(doctorId);
      if (!Number.isNaN(parsed)) where.doctorId = parsed;
    }

    if (patientId) {
      const parsed = Number(patientId);
      if (!Number.isNaN(parsed)) where.patientId = parsed;
    }

    // ----------------- Date / date range filter -----------------
    if (dateFrom || dateTo) {
      const range = {};

      if (dateFrom) {
        const parsed = parseClinicDay(dateFrom);
        if (!parsed) {
          return res.status(400).json({ error: "Invalid dateFrom format" });
        }
        range.gte = parsed.localStart;
      }

      if (dateTo) {
        const parsed = parseClinicDay(dateTo);
        if (!parsed) {
          return res.status(400).json({ error: "Invalid dateTo format" });
        }
        range.lte = parsed.localEnd;
      }

      where.scheduledAt = range;
    } else if (date) {
      // Legacy single-day mode
      const parsed = parseClinicDay(date);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      where.scheduledAt = {
        gte: parsed.localStart,
        lte: parsed.localEnd,
      };
    }

    // ----------------- Status + includeCancelled logic -----------------
    const normalized = normalizeStatusForDb(status);

    if (status && String(status).toUpperCase() !== "ALL") {
      if (normalized === "booked" && includeCancelled === "true") {
        // Цаг захиалсан list: booked + cancelled
        where.status = { in: ["booked", "cancelled"] };
      } else if (normalized && ALLOWED_STATUSES.includes(normalized)) {
        where.status = normalized;
      } else {
        return res.status(400).json({ error: "Invalid status value" });
      }
    }
    // If status missing or "ALL", we don't filter by status.

    // ----------------- Text search on patient -----------------
    if (search && search.trim() !== "") {
      const s = search.trim();
      // Prisma relation filter: appointment where patient matches OR conditions
      where.patient = {
        OR: [
          {
            name: {
              contains: s,
              mode: "insensitive",
            },
          },
          {
            regNo: {
              contains: s,
              mode: "insensitive",
            },
          },
          {
            phone: {
              contains: s,
              mode: "insensitive",
            },
          },
        ],
      };
    }

    // ----------------- Query DB -----------------
        const appointments = await prisma.appointment.findMany({
  where,
  orderBy: { scheduledAt: "asc" },
  include: {
    patient: {
      select: {
        id: true,
        name: true,
        ovog: true,      // ← ADD THIS
        regNo: true,
        phone: true,
        patientBook: true,
      },
    },
    doctor: true,
    branch: true,
    createdBy: { select: { id: true, name: true, ovog: true } },
    updatedBy: { select: { id: true, name: true, ovog: true } },
    encounters: {
      orderBy: { id: "desc" },
      take: 1,
      select: { id: true },
    },
  },
});

// ---------------------------------------------------------------------------
// formatApptForResponse: shapes a Prisma appointment record into the
// API response object. Uses naive timestamps for scheduledAt/endAt and
// ISO strings for audit timestamps (createdAt/updatedAt/checkedInAt).
// ---------------------------------------------------------------------------
function formatApptForResponse(a) {
  const patient = a.patient;
  const doctor = a.doctor;
  const branch = a.branch;

  return {
    id: a.id,
    branchId: a.branchId,
    doctorId: a.doctorId,
    patientId: a.patientId,

    patientName: patient ? patient.name : null,
    patientOvog: patient ? patient.ovog || null : null,
    patientRegNo: patient ? patient.regNo || null : null,
    patientPhone: patient ? patient.phone || null : null,

    doctorName: doctor ? doctor.name || null : null,
    doctorOvog: doctor ? doctor.ovog || null : null,

    // Naive wall-clock timestamps — no timezone offset
    scheduledAt: a.scheduledAt ? toNaiveTs(a.scheduledAt) : null,
    endAt: a.endAt ? toNaiveTs(a.endAt) : null,

    status: a.status,
    notes: a.notes || null,

    createdByUserId: a.createdByUserId || null,
    source: a.source || null,
    sourceEncounterId: a.sourceEncounterId || null,

    // Audit timestamps remain as ISO (not appointment scheduling times)
    checkedInAt: a.checkedInAt ? a.checkedInAt.toISOString() : null,
    createdAt: a.createdAt ? a.createdAt.toISOString() : null,
    updatedAt: a.updatedAt ? a.updatedAt.toISOString() : null,
    updatedByUserId: a.updatedByUserId || null,

    createdByUser: a.createdBy
      ? { id: a.createdBy.id, name: a.createdBy.name || null, ovog: a.createdBy.ovog || null }
      : (a.createdByUser ?? null),
    updatedByUser: a.updatedBy
      ? { id: a.updatedBy.id, name: a.updatedBy.name || null, ovog: a.updatedBy.ovog || null }
      : (a.updatedByUser ?? null),

    patient: patient
      ? {
          id: patient.id,
          name: patient.name,
          ovog: patient.ovog || null,
          regNo: patient.regNo || null,
          phone: patient.phone || null,
          patientBook: patient.patientBook || null,
        }
      : null,

    branch: branch
      ? { id: branch.id, name: branch.name }
      : null,

    encounterId: Array.isArray(a.encounters) && a.encounters.length > 0
      ? a.encounters[0].id
      : (a.encounterId ?? null),
  };
}

    // ----------------- Shape for new frontend Appointment type -----------------
    const rows = appointments.map((a) => {
  const formatted = formatApptForResponse(a);
  const patient = a.patient;
  const branch = a.branch;
  const patientRegNo = patient ? patient.regNo || null : null;
  const branchName = branch ? branch.name : null;

  return {
    ...formatted,

    // ✅ LEGACY aliases (so visits pages keep working)
    startTime: formatted.scheduledAt,
    endTime: formatted.endAt,
    regNo: patientRegNo,
    branchName,
  };
});

    res.json(rows);
  } catch (err) {
    console.error("Error fetching appointments:", err);
    res.status(500).json({ error: "failed to fetch appointments" });
  }
});

// ---------------------------------------------------------------------------
// Shared capacity helper: asserts that adding/moving an appointment would not
// cause more than 2 overlapping appointments for the same doctor.
//
// @param {object} opts
//   doctorId         {number}  – doctor to check (required)
//   start            {Date}    – appointment start (inclusive)
//   end              {Date}    – appointment end (exclusive); must be > start
//   excludeId        {number|null} – appointment id to exclude (for PATCH)
//   tx               {object}  – Prisma client or transaction client
//
// Returns true when capacity would be exceeded (caller should return 409).
// ---------------------------------------------------------------------------
async function isDoctorCapacityExceeded({ doctorId, start, end, excludeId = null, tx }) {
  const where = {
    doctorId,
    status: { in: ["booked", "confirmed", "ongoing", "online", "other"] },
    scheduledAt: { lt: end },
    OR: [{ endAt: { gt: start } }, { endAt: null }],
  };
  if (excludeId !== null) {
    where.id = { not: excludeId };
  }

  const existing = await tx.appointment.findMany({
    where,
    select: { id: true, scheduledAt: true, endAt: true },
  });

  const events = [];
  for (const apt of existing) {
    const aptStart = new Date(apt.scheduledAt);
    const aptEnd = apt.endAt
      ? new Date(apt.endAt)
      : new Date(aptStart.getTime() + 30 * 60_000);
    events.push({ time: aptStart.getTime(), type: "start" });
    events.push({ time: aptEnd.getTime(), type: "end" });
  }
  events.push({ time: start.getTime(), type: "start" });
  events.push({ time: end.getTime(), type: "end" });

  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.type === "end" ? -1 : 1;
  });

  let currentCount = 0;
  let maxCount = 0;
  for (const ev of events) {
    if (ev.type === "start") {
      currentCount++;
      maxCount = Math.max(maxCount, currentCount);
    } else {
      currentCount--;
    }
  }

  return maxCount > 2;
}

/**
 * POST /api/appointments
 *
 * Body:
 *  - patientId (number, required)
 *  - doctorId (number, optional)
 *  - branchId (number, required)
 *  - scheduledAt (ISO string or YYYY-MM-DDTHH:mm, required)
 *  - endAt (ISO string or YYYY-MM-DDTHH:mm, optional; must be > scheduledAt)
 *  - status (string, optional, defaults to "booked")
 *  - notes (string, optional)
 *  - source (string, optional, e.g., 'FOLLOW_UP_ENCOUNTER')
 *  - sourceEncounterId (number, optional)
 */
router.post("/", async (req, res) => {
  try {
    const {
      patientId,
      doctorId,
      branchId,
      scheduledAt,
      endAt,
      status,
      notes,
      source,
      sourceEncounterId,
    } = req.body || {};

    if (!patientId || !branchId || !scheduledAt) {
      return res.status(400).json({
        error: "patientId, branchId, scheduledAt are required",
      });
    }

    const parsedPatientId = Number(patientId);
    const parsedBranchId = Number(branchId);
    const parsedDoctorId =
      doctorId !== undefined && doctorId !== null && doctorId !== ""
        ? Number(doctorId)
        : null;

    if (Number.isNaN(parsedPatientId) || Number.isNaN(parsedBranchId)) {
      return res
        .status(400)
        .json({ error: "patientId and branchId must be numbers" });
    }

    if (parsedDoctorId !== null && Number.isNaN(parsedDoctorId)) {
      return res.status(400).json({ error: "doctorId must be a number" });
    }

    // Parse scheduledAt: accept naive "YYYY-MM-DD HH:mm:ss" or ISO strings.
    // parseNaiveTs uses server local timezone (Mongolia) for wall-clock accuracy.
    const scheduledDate = parseNaiveTs(scheduledAt);
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: "scheduledAt is invalid date" });
    }

    // Optional endAt (default to 30 minutes if not provided)
    let endDate = null;
    if (endAt !== undefined && endAt !== null && endAt !== "") {
      const tmp = parseNaiveTs(endAt);
      if (!tmp || Number.isNaN(tmp.getTime())) {
        return res.status(400).json({ error: "endAt is invalid date" });
      }
      if (tmp <= scheduledDate) {
        return res
          .status(400)
          .json({ error: "endAt must be later than scheduledAt" });
      }
      endDate = tmp;
    } else {
      // Default to 30 minutes if endAt not provided
      endDate = new Date(scheduledDate.getTime() + 30 * 60_000);
    }

    // Normalize and validate status
    let normalizedStatus = "booked";
    if (typeof status === "string" && status.trim()) {
      const maybe = normalizeStatusForDb(status);
      if (!maybe) {
        return res.status(400).json({ error: "invalid status" });
      }
      normalizedStatus = maybe;
    }

   // Receptionist cross-branch rule: can only create with status "booked" in other branches
if (req.user?.role === "receptionist" && req.user.branchId !== parsedBranchId) {
  // If client explicitly provided a status, it must be "booked"
  if (typeof status === "string" && status.trim()) {
    if (normalizedStatus !== "booked") {
      return res.status(403).json({
        error: 'Receptionist can only create cross-branch appointments with status "booked".',
      });
    }
  } else {
    // If status was omitted, default to booked (already default, but keep explicit)
    normalizedStatus = "booked";
  }
}

    // Extract provenance fields
    const createdByUserId = req.user?.id || null;
    const parsedSourceEncounterId = sourceEncounterId ? Number(sourceEncounterId) : null;

    // ===== CAPACITY ENFORCEMENT: Max 2 overlapping appointments (in a transaction) =====
    const appt = await prisma.$transaction(async (tx) => {
      if (parsedDoctorId !== null) {
        const exceeded = await isDoctorCapacityExceeded({
          doctorId: parsedDoctorId,
          start: scheduledDate,
          end: endDate,
          tx,
        });
        if (exceeded) {
          const err = new Error("capacity_exceeded");
          err.isCapacityExceeded = true;
          throw err;
        }
      }

      return tx.appointment.create({
        data: {
          patientId: parsedPatientId,
          doctorId: parsedDoctorId,
          branchId: parsedBranchId,
          scheduledAt: scheduledDate,
          endAt: endDate,
          status: normalizedStatus,
          notes: notes || null,
          // Provenance fields for deletion permission tracking
          createdByUserId: createdByUserId,
          source: source || null,
          sourceEncounterId: parsedSourceEncounterId,
        },
        include: {
          patient: {
            include: {
              patientBook: true,
            },
          },
          doctor: true,
          branch: true,
          createdBy: { select: { id: true, name: true, ovog: true } },
        },
      });
    });

    const responsePayload = formatApptForResponse({
      ...appt,
      createdByUser: formatAuditUser(appt.createdBy),
      updatedByUser: null,
    });
    res.status(201).json(responsePayload);

    // Broadcast SSE event to subscribers watching this date+branch
    if (appt.scheduledAt) {
      const apptDate = naiveTsToYmd(appt.scheduledAt);
      sseBroadcast("appointment_created", responsePayload, apptDate, appt.branchId);
    }
  } catch (err) {
    if (err.isCapacityExceeded) {
      return res.status(409).json({ error: "Энэ цагт 2 захиалга бүртгэгдсэн байна" });
    }
    console.error("Error creating appointment:", err);
    res.status(500).json({ error: "failed to create appointment" });
  }
});

// PATCH /api/appointments/:id  (status/notes + optional time/doctor edits)
router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    const {
      status,
      notes,
      scheduledAt,
      endAt,
      doctorId,

      // explicitly forbid these in this endpoint for safety
      patientId,
      branchId,
    } = req.body || {};

    // ✅ hard block changes you don't want reception to do via "Засварлах"
    if (patientId !== undefined) {
      return res.status(400).json({
        error:
          "patientId cannot be updated here. Create a new appointment if patient must change.",
      });
    }
    if (branchId !== undefined) {
      return res.status(400).json({
        error:
          "branchId cannot be updated here. Create a new appointment if branch must change.",
      });
    }

    // Guard: completed appointments cannot be modified except by super_admin
    const existing = await prisma.appointment.findUnique({
      where: { id },
      select: { status: true, branchId: true, doctorId: true, scheduledAt: true, endAt: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "appointment not found" });
    }
    if (existing.status === "completed" && req.user?.role !== "super_admin") {
      return res.status(403).json({ error: "Дууссан цагийн захиалгыг засах эрхгүй." });
    }

    // Receptionist cross-branch guard: cannot edit appointments in other branches
    if (req.user?.role === "receptionist" && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ error: "Receptionist cannot edit appointments in other branches." });
    }

    const data = {};

    // ---------------- status (optional) ----------------
    if (status !== undefined) {
      if (typeof status !== "string" || !status.trim()) {
        return res.status(400).json({ error: "status must be a non-empty string" });
      }
      const normalizedStatus = normalizeStatusForDb(status);
      if (!normalizedStatus) {
        return res.status(400).json({ error: "invalid status" });
      }
      // Receptionist-specific status transition rule:
      // - Receptionist CAN set status to "ongoing" (patient check-in).
      // - Receptionist CANNOT change status away from "ongoing" once an encounter
      //   has been created for this appointment (doctor has started the visit).
      if (req.user?.role === "receptionist" && existing.status === "ongoing" && normalizedStatus !== "ongoing") {
        const encounterCount = await prisma.encounter.count({
          where: { appointmentId: id },
        });
        if (encounterCount > 0) {
          return res.status(403).json({ error: "Үзлэг эхэлсэн байна" });
        }
      }
      data.status = normalizedStatus;
    }

    // ---------------- notes (optional) ----------------
    if (notes !== undefined) {
      if (notes === null) data.notes = null;
      else if (typeof notes === "string") data.notes = notes.trim() || null;
      else {
        return res
          .status(400)
          .json({ error: "notes must be a string or null" });
      }
    }

    // ---------------- doctorId (optional) ----------------
    if (doctorId !== undefined) {
      if (doctorId === null || doctorId === "") {
        data.doctorId = null;
      } else {
        const parsed = Number(doctorId);
        if (Number.isNaN(parsed)) {
          return res.status(400).json({ error: "doctorId must be a number or null" });
        }
        data.doctorId = parsed;
      }
    }

    // ---------------- scheduledAt / endAt (optional) ----------------
    // Allow updating time range. If one provided, validate with the other (existing or provided).
    let nextScheduledAt;
    let nextEndAt;

    if (scheduledAt !== undefined) {
      const d = parseNaiveTs(scheduledAt);
      if (!d || Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "scheduledAt is invalid date" });
      }
      nextScheduledAt = d;
      data.scheduledAt = d;
    }

    if (endAt !== undefined) {
      if (endAt === null || endAt === "") {
        nextEndAt = null;
        data.endAt = null;
      } else {
        const d = parseNaiveTs(endAt);
        if (!d || Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: "endAt is invalid date" });
        }
        nextEndAt = d;
        data.endAt = d;
      }
    }

    // If either time value changed, validate end > start (when end exists)
    if (scheduledAt !== undefined || endAt !== undefined) {
      const start = nextScheduledAt ?? existing.scheduledAt;
      const end = endAt !== undefined ? nextEndAt : existing.endAt;

      if (end && end <= start) {
        return res
          .status(400)
          .json({ error: "endAt must be later than scheduledAt" });
      }
    }

    // Nothing to update
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    // Track who last updated this appointment
    data.updatedByUserId = req.user?.id || null;

    // ===== CAPACITY ENFORCEMENT on edit =====
    // Check capacity whenever the effective doctor/time slot may change.
    const appt = await prisma.$transaction(async (tx) => {
      const timeOrDoctorChanged =
        scheduledAt !== undefined || endAt !== undefined || doctorId !== undefined;
      if (timeOrDoctorChanged) {
        const effectiveDoctorId =
          doctorId !== undefined
            ? (doctorId === null || doctorId === "" ? null : Number(doctorId))
            : existing.doctorId;

        if (effectiveDoctorId !== null) {
          const effectiveStart = nextScheduledAt ?? existing.scheduledAt;
          const rawEnd = endAt !== undefined ? nextEndAt : existing.endAt;
          const effectiveEnd = rawEnd
            ? rawEnd
            : new Date(effectiveStart.getTime() + 30 * 60_000);

          const exceeded = await isDoctorCapacityExceeded({
            doctorId: effectiveDoctorId,
            start: effectiveStart,
            end: effectiveEnd,
            excludeId: id,
            tx,
          });
          if (exceeded) {
            const err = new Error("capacity_exceeded");
            err.isCapacityExceeded = true;
            throw err;
          }
        }
      }

      return tx.appointment.update({
        where: { id },
        data,
        include: {
          patient: { include: { patientBook: true } },
          doctor: true,
          branch: true,
          createdBy: { select: { id: true, name: true, ovog: true } },
          updatedBy: { select: { id: true, name: true, ovog: true } },
        },
      });
    });

    // If status changed to "imaging", create encounter immediately (similar to "ongoing")
    if (data.status === "imaging" && appt.doctorId) {
      // Ensure patient has a PatientBook
      let book = appt.patient?.patientBook;
      if (!book) {
        book = await prisma.patientBook.create({
          data: {
            patientId: appt.patientId,
            bookNumber: String(appt.patientId),
          },
        });
      }

      // Check if encounter already exists for this appointment
      const existingEncounter = await prisma.encounter.findFirst({
        where: { appointmentId: appt.id },
        orderBy: { id: "desc" },
      });

      // Create encounter if it doesn't exist
      if (!existingEncounter) {
        await prisma.encounter.create({
          data: {
            patientBookId: book.id,
            doctorId: appt.doctorId,
            visitDate: appt.scheduledAt,
            notes: null,
            appointmentId: appt.id,
          },
        });
      }
    }

    const updateResponsePayload = formatApptForResponse({
      ...appt,
      createdByUser: formatAuditUser(appt.createdBy),
      updatedByUser: formatAuditUser(appt.updatedBy),
    });

    // Broadcast SSE event to subscribers watching this date+branch
    if (appt.scheduledAt) {
      const apptDate = naiveTsToYmd(appt.scheduledAt);
      sseBroadcast("appointment_updated", updateResponsePayload, apptDate, appt.branchId);
    }

    return res.json(updateResponsePayload);
  } catch (err) {
    if (err.isCapacityExceeded) {
      return res.status(409).json({ error: "Энэ цагт 2 захиалга бүртгэгдсэн байна" });
    }
    console.error("Error updating appointment:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "appointment not found" });
    }
    return res.status(500).json({ error: "failed to update appointment" });
  }
});

/**
 * POST /api/appointments/:id/start-encounter
 *
 * Starts (or re-opens) an Encounter for this appointment.
 * Only allowed when appointment.status === "ongoing".
 */
router.post("/:id/start-encounter", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    // Receptionist cannot start encounters
    if (req.user?.role === "receptionist") {
      return res.status(403).json({ error: "Receptionist cannot start encounters." });
    }

    // 1) Load appointment with patient + patientBook
    const appt = await prisma.appointment.findUnique({
      where: { id: apptId },
      include: {
        patient: {
          include: {
            patientBook: true,
          },
        },
        branch: true,
        doctor: true,
      },
    });

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // 2) Only allow when status is "ongoing" or "imaging"
    if (appt.status !== "ongoing" && appt.status !== "imaging") {
      return res.status(400).json({
        error:
          'Зөвхөн "Явагдаж байна" (ongoing) эсвэл "Зураг авах" (imaging) төлөвтэй цаг дээр үзлэг эхлүүлэх боломжтой.',
      });
    }

    if (!appt.patient) {
      return res
        .status(400)
        .json({ error: "Appointment has no patient linked" });
    }

    if (!appt.doctorId) {
      return res.status(400).json({
        error: "Энэ цаг дээр эмч сонгоогүй тул үзлэг эхлүүлэх боломжгүй.",
      });
    }

    const patient = appt.patient;

    // 3) Ensure patient has a PatientBook
    let book = patient.patientBook;
    if (!book) {
      // TODO: replace bookNumber logic with proper generator if needed
      book = await prisma.patientBook.create({
        data: {
          patientId: patient.id,
          bookNumber: String(patient.id),
        },
      });
    }

    // 4) Find latest Encounter for this appointment, if any
    let encounter = await prisma.encounter.findFirst({
      where: { appointmentId: appt.id },
      orderBy: { id: "desc" },
    });

    // 5) If none, create new Encounter
    if (!encounter) {
      encounter = await prisma.encounter.create({
        data: {
          patientBookId: book.id,
          doctorId: appt.doctorId,
          visitDate: appt.scheduledAt,
          notes: null,
          appointmentId: appt.id,
        },
      });
    }

    return res.json({ encounterId: encounter.id });
  } catch (err) {
    console.error("Error in POST /api/appointments/:id/start-encounter:", err);
    return res
      .status(500)
      .json({ error: "Failed to start or open encounter for appointment" });
  }
});

/**
 * POST /api/appointments/:id/ensure-encounter
 *
 * XRAY/general endpoint: Ensure an encounter exists for this appointment.
 * Works for both "ongoing" and "imaging" statuses.
 * Returns encounterId. If encounter already exists, returns the latest one.
 * If not, creates a new encounter using ensureEncounterForAppointment helper.
 */
router.post("/:id/ensure-encounter", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    // Receptionist cannot create/ensure encounters
    if (req.user?.role === "receptionist") {
      return res.status(403).json({ error: "Receptionist cannot start encounters." });
    }

    const encounter = await ensureEncounterForAppointment(apptId);
    return res.json({ encounterId: encounter.id });
  } catch (err) {
    console.error("Error in POST /api/appointments/:id/ensure-encounter:", err);
    return res.status(500).json({ 
      error: err.message || "Failed to ensure encounter for appointment" 
    });
  }
});

// ... keep existing code above

/**
 * GET /api/appointments/:id/encounter
 *
 * Used by reception when appointment.status === "ready_to_pay"
 * Returns the encounterId linked to this appointment.
 */
router.get("/:id/encounter", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    // Find latest encounter for this appointment (in case of multiple)
    const encounter = await prisma.encounter.findFirst({
      where: { appointmentId: apptId },
      orderBy: { id: "desc" },
      select: { id: true },
    });

    if (!encounter) {
      return res
        .status(404)
        .json({ error: "Encounter not found for this appointment" });
    }

    return res.json({ encounterId: encounter.id });
  } catch (err) {
    console.error("GET /api/appointments/:id/encounter error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load encounter for appointment" });
  }
});

/**
 * GET /api/appointments/:id/report
 *
 * Returns consolidated encounter report data for a completed appointment.
 * Used by the Encounter Report modal.
 *
 * Response includes:
 * - encounter (visitDate, id)
 * - doctor (name, ovog, email, signatureImagePath)
 * - patient/patientBook
 * - appointment (scheduledAt)
 * - branch
 * - diagnoses (EncounterDiagnosis with diagnosis + sterilization indicators)
 * - invoice (items, payments, eBarimtReceipt)
 * - prescription (items)
 * - media
 */
router.get("/:id/report", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    // 1) Find appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: apptId },
      include: {
        patient: {
          include: {
            patientBook: true,
          },
        },
        branch: true,
        doctor: true,
      },
    });

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // 2) Find encounter linked to this appointment (latest if multiple)
    const encounter = await prisma.encounter.findFirst({
      where: { appointmentId: apptId },
      orderBy: { visitDate: "desc" },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            ovog: true,
            email: true,
            signatureImagePath: true,
          },
        },
        diagnoses: {
          orderBy: { createdAt: "asc" },
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
                    code: true,
                  },
                },
              },
            },
          },
        },
        invoice: {
          include: {
            items: {
              orderBy: { id: "asc" },
              include: {
                service: true,
                product: true,
              },
            },
            payments: {
                include: {
                  createdBy: { select: { id: true, name: true, ovog: true } },
                },
              },
            eBarimtReceipt: true,
          },
        },
        prescription: {
          include: {
            items: {
              orderBy: { order: "asc" },
            },
          },
        },
        media: true,
      },
    });

    if (!encounter) {
      return res.status(404).json({
        error: "No encounter found for this appointment",
      });
    }

    // 3) Return normalized report data
    return res.json({
      appointment: {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
        status: appointment.status,
      },
      patient: appointment.patient,
      patientBook: appointment.patient?.patientBook || null,
      branch: appointment.branch,
      doctor: encounter.doctor,
      encounter: {
        id: encounter.id,
        visitDate: encounter.visitDate,
        notes: encounter.notes,
      },
      diagnoses: encounter.diagnoses,
      invoice: encounter.invoice
        ? {
            ...encounter.invoice,
            payments: (encounter.invoice.payments || []).map((p) => ({
              id: p.id,
              amount: p.amount,
              method: p.method,
              timestamp: p.timestamp,
              qpayTxnId: p.qpayTxnId ?? null,
              createdByUser: formatAuditUser(p.createdBy),
            })),
          }
        : null,
      prescription: encounter.prescription,
      media: encounter.media,
    });
  } catch (err) {
    console.error("GET /api/appointments/:id/report error:", err);
    return res.status(500).json({ error: "Failed to load encounter report" });
  }
});

/**
 * DELETE /api/appointments/:id?encounterId=123
 * 
 * Deletes a follow-up appointment in open mode (no authentication required for Phase 1).
 * 
 * Authorization (encounter-scoped):
 * - Can only delete appointments with source === 'FOLLOW_UP_ENCOUNTER'
 * - Must provide encounterId query parameter that matches sourceEncounterId
 * - Can only delete future appointments (scheduledAt > now)
 * 
 * Query params:
 * - encounterId (number, required): The encounter ID to verify against sourceEncounterId
 */
router.delete("/:id", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    // Fetch the appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: apptId },
      select: {
        id: true,
        scheduledAt: true,
        branchId: true,
        source: true,
        sourceEncounterId: true,
      },
    });

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Check 1: Must be from follow-up encounter source
    if (appointment.source !== "FOLLOW_UP_ENCOUNTER") {
      return res.status(403).json({
        error: "Та зөвхөн давтан үзлэгийн цагийг устгах боломжтой",
      });
    }

    // Check 2: Must be scheduled in the future
    const now = new Date();
    if (appointment.scheduledAt <= now) {
      return res.status(403).json({
        error: "Өнгөрсөн цагийг устгах боломжгүй",
      });
    }

    // Check 3: Must match the specified encounterId
    const encounterIdParam = req.query.encounterId;
    if (!encounterIdParam) {
      return res.status(400).json({
        error: "encounterId query parameter is required",
      });
    }

    const parsedEncounterId = Number(encounterIdParam);
    if (Number.isNaN(parsedEncounterId)) {
      return res.status(400).json({
        error: "encounterId must be a valid number",
      });
    }

    if (!appointment.sourceEncounterId) {
      return res.status(403).json({
        error: "Энэ цаг үзлэгтэй холбогдоогүй байна",
      });
    }

    if (appointment.sourceEncounterId !== parsedEncounterId) {
      return res.status(403).json({
        error: "Та зөвхөн одоогийн үзлэгээс үүссэн цагийг устгах боломжтой",
      });
    }

    // Delete the appointment
    await prisma.appointment.delete({
      where: { id: apptId },
    });

    // Broadcast SSE delete event to subscribers watching this date+branch
    if (appointment.scheduledAt) {
      const apptDate = naiveTsToYmd(appointment.scheduledAt);
      sseBroadcast("appointment_deleted", { id: apptId }, apptDate, appointment.branchId);
    }

    return res.json({ success: true, message: "Appointment deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/appointments/:id error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Appointment not found" });
    }
    return res.status(500).json({ error: "Failed to delete appointment" });
  }
});

/**
 * PATCH /api/appointments/:id/cancel
 * 
 * Cancels an appointment with audit trail.
 * - Only reception/admin can cancel
 * - Records cancelledAt and cancelledByUserId
 * - Cancellation is terminal - cannot be reactivated
 * 
 * Note: Full role validation requires authentication (req.user)
 * For now, accepts userId in request body as workaround
 * 
 * Request body:
 * - userId: number (user performing cancellation)
 * - reason: string (optional cancellation reason)
 */
router.patch("/:id/cancel", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    const { userId, reason } = req.body || {};

    // Validate appointment exists
    const appt = await prisma.appointment.findUnique({
      where: { id: apptId },
      select: {
        id: true,
        status: true,
        cancelledAt: true,
        notes: true,
      },
    });

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Check if already cancelled
    if (appt.cancelledAt) {
      return res.status(400).json({
        error: "Appointment is already cancelled and cannot be reactivated",
      });
    }

    // Validate user (temporary workaround until full auth is implemented)
    if (!userId || Number.isNaN(Number(userId))) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const parsedUserId = Number(userId);

    // Validate user exists and has appropriate role
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Only reception and admin can cancel appointments
    if (user.role !== "receptionist" && user.role !== "admin") {
      return res.status(403).json({
        error: "Only reception and admin users can cancel appointments",
      });
    }

    // Update appointment with cancellation audit fields
    const trimmedReason = reason?.trim();
    const updatedAppt = await prisma.appointment.update({
      where: { id: apptId },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledByUserId: parsedUserId,
        notes: trimmedReason 
          ? [appt.notes, `Cancellation reason: ${trimmedReason}`].filter(Boolean).join('\n')
          : appt.notes,
      },
      include: {
        patient: true,
        doctor: true,
        cancelledBy: {
          select: {
            id: true,
            name: true,
            ovog: true,
            role: true,
          },
        },
      },
    });

    const cancelResponsePayload = {
      success: true,
      message: "Appointment cancelled successfully",
      appointment: {
        id: updatedAppt.id,
        status: updatedAppt.status,
        cancelledAt: updatedAppt.cancelledAt,
        cancelledBy: updatedAppt.cancelledBy,
      },
    };

    res.json(cancelResponsePayload);

    // Broadcast SSE update event so calendar clients see the status change
    if (updatedAppt.scheduledAt) {
      const apptDate = naiveTsToYmd(updatedAppt.scheduledAt);
      sseBroadcast("appointment_updated", {
        id: updatedAppt.id,
        branchId: updatedAppt.branchId,
        scheduledAt: toNaiveTs(updatedAppt.scheduledAt),
        status: updatedAppt.status,
        cancelledAt: updatedAppt.cancelledAt,
      }, apptDate, updatedAppt.branchId);
    }
  } catch (err) {
    console.error("PATCH /api/appointments/:id/cancel error:", err);
    return res.status(500).json({ error: "Failed to cancel appointment" });
  }
});

/**
 * POST /api/appointments/:id/imaging/set-performer
 * 
 * XRAY endpoint: Set performer for imaging appointment.
 * - Doctor performer is always appointment.doctorId (no override allowed)
 * - Nurse performer is selectable only from nurses on shift
 * 
 * Request body:
 * - performerType: "DOCTOR" | "NURSE"
 * - nurseId: number (required if performerType === "NURSE")
 */
router.post("/:id/imaging/set-performer", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    const { performerType, nurseId } = req.body || {};

    // Validate appointment exists and is in imaging status
    const appt = await prisma.appointment.findUnique({
      where: { id: apptId },
      include: {
        encounters: {
          orderBy: { id: "desc" },
          take: 1,
        },
      },
    });

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appt.status !== "imaging") {
      return res.status(400).json({
        error: "Performer can only be set when appointment status is 'imaging'",
      });
    }

    // Ensure encounter exists (auto-create if missing)
    let encounter;
    if (!appt.encounters || appt.encounters.length === 0) {
      try {
        encounter = await ensureEncounterForAppointment(apptId);
      } catch (err) {
        console.error("Failed to ensure encounter:", err);
        return res.status(400).json({
          error: "Failed to create encounter for this imaging appointment",
        });
      }
    } else {
      encounter = appt.encounters[0];
    }

    // Validate performerType
    if (performerType !== "DOCTOR" && performerType !== "NURSE") {
      return res.status(400).json({
        error: "performerType must be 'DOCTOR' or 'NURSE'",
      });
    }

    const updateData = {};

    if (performerType === "DOCTOR") {
      // Doctor is always the slot-holder (appointment.doctorId)
      if (!appt.doctorId) {
        return res.status(400).json({
          error: "No doctor assigned to this appointment",
        });
      }
      // Doctor is already set from appointment creation, no need to update
      updateData.nurseId = null; // Clear nurse if switching to doctor
    } else {
      // NURSE - validate nurse is on shift
      if (!nurseId || Number.isNaN(Number(nurseId))) {
        return res.status(400).json({
          error: "nurseId is required when performerType is NURSE",
        });
      }

      const parsedNurseId = Number(nurseId);

      // Check if nurse exists and has nurse role
      const nurse = await prisma.user.findUnique({
        where: { id: parsedNurseId },
      });

      if (!nurse || nurse.role !== "nurse") {
        return res.status(400).json({
          error: "Invalid nurse selection",
        });
      }

      // Check if nurse is currently on shift
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const nurseSchedule = await prisma.nurseSchedule.findFirst({
        where: {
          nurseId: parsedNurseId,
          branchId: appt.branchId,
          date: {
            gte: todayStart,
            lt: todayEnd,
          },
        },
      });

      if (!nurseSchedule) {
        return res.status(400).json({
          error: "Selected nurse is not currently on shift",
        });
      }

      // Parse time and check if current time is within shift window
      // Convert HH:MM strings to minutes for proper comparison
      const timeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') {
          throw new Error('Invalid time format');
        }
        const parts = timeStr.split(':');
        if (parts.length !== 2) {
          throw new Error('Invalid time format - expected HH:MM');
        }
        const [hours, minutes] = parts.map(Number);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          throw new Error('Invalid time values');
        }
        return hours * 60 + minutes;
      };
      
      try {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = timeToMinutes(nurseSchedule.startTime);
        const endMinutes = timeToMinutes(nurseSchedule.endTime);
        
        if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
          return res.status(400).json({
            error: "Selected nurse is not currently on shift (outside shift hours)",
          });
        }
      } catch (err) {
        console.error("Error parsing nurse schedule times:", err);
        return res.status(500).json({
          error: "Invalid nurse schedule time format",
        });
      }

      updateData.nurseId = parsedNurseId;
    }

    // Update encounter with performer
    const updatedEncounter = await prisma.encounter.update({
      where: { id: encounter.id },
      data: updateData,
      include: {
        doctor: true,
        nurse: true,
      },
    });

    return res.json({
      success: true,
      encounter: {
        id: updatedEncounter.id,
        doctorId: updatedEncounter.doctorId,
        doctorName: updatedEncounter.doctor?.name,
        nurseId: updatedEncounter.nurseId,
        nurseName: updatedEncounter.nurse?.name,
      },
    });
  } catch (err) {
    console.error("POST /api/appointments/:id/imaging/set-performer error:", err);
    return res.status(500).json({ error: "Failed to set performer" });
  }
});

/**
 * GET /api/appointments/:id/imaging/config
 *
 * Returns the saved imaging performer + selected service IDs for an imaging appointment.
 * Used by the XRAY page to pre-fill the UI after a reload or on a different computer.
 *
 * Response:
 * - encounterId: number | null
 * - performerType: "DOCTOR" | "NURSE"
 * - nurseId: number | null
 * - selectedServiceIds: number[]
 */
router.get("/:id/imaging/config", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    const appt = await prisma.appointment.findUnique({
      where: { id: apptId },
      include: {
        encounters: {
          orderBy: { id: "desc" },
          take: 1,
          include: {
            encounterServices: {
              include: { service: { select: { id: true, category: true } } },
            },
          },
        },
      },
    });

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const encounter = appt.encounters?.[0] ?? null;
    if (!encounter) {
      return res.json({
        encounterId: null,
        performerType: "DOCTOR",
        nurseId: null,
        selectedServiceIds: [],
      });
    }

    const performerType = encounter.nurseId ? "NURSE" : "DOCTOR";
    const selectedServiceIds = encounter.encounterServices
      .filter((es) => es.service?.category === "IMAGING")
      .map((es) => es.serviceId);

    return res.json({
      encounterId: encounter.id,
      performerType,
      nurseId: encounter.nurseId ?? null,
      selectedServiceIds,
    });
  } catch (err) {
    console.error("GET /api/appointments/:id/imaging/config error:", err);
    return res.status(500).json({ error: "Failed to load imaging config" });
  }
});

/**
 * PATCH /api/appointments/:id/imaging/config
 *
 * Save (draft) imaging performer + selected service IDs for an imaging appointment.
 * Replaces existing IMAGING encounterServices so the selection persists across computers.
 *
 * Request body:
 * - performerType: "DOCTOR" | "NURSE"
 * - nurseId: number (required if performerType === "NURSE")
 * - selectedServiceIds: number[] (IDs of IMAGING services to select)
 */
router.patch("/:id/imaging/config", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    const { performerType, nurseId, selectedServiceIds } = req.body || {};

    // Validate appointment exists and is in imaging status
    const appt = await prisma.appointment.findUnique({
      where: { id: apptId },
      include: {
        encounters: {
          orderBy: { id: "desc" },
          take: 1,
        },
      },
    });

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appt.status !== "imaging") {
      return res.status(400).json({
        error: "Config can only be saved when appointment status is 'imaging'",
      });
    }

    // Ensure encounter exists
    let encounter;
    if (!appt.encounters || appt.encounters.length === 0) {
      try {
        encounter = await ensureEncounterForAppointment(apptId);
      } catch (err) {
        console.error("Failed to ensure encounter:", err);
        return res.status(400).json({
          error: "Failed to create encounter for this imaging appointment",
        });
      }
    } else {
      encounter = appt.encounters[0];
    }

    // Validate performerType
    if (performerType !== "DOCTOR" && performerType !== "NURSE") {
      return res.status(400).json({
        error: "performerType must be 'DOCTOR' or 'NURSE'",
      });
    }

    let nurseIdValue = null;
    if (performerType === "NURSE") {
      if (!nurseId || Number.isNaN(Number(nurseId))) {
        return res.status(400).json({
          error: "nurseId is required when performerType is NURSE",
        });
      }
      const parsedNurseId = Number(nurseId);

      const nurse = await prisma.user.findUnique({ where: { id: parsedNurseId } });
      if (!nurse || nurse.role !== "nurse") {
        return res.status(400).json({ error: "Invalid nurse selection" });
      }

      // Check nurse is currently on shift
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const nurseSchedule = await prisma.nurseSchedule.findFirst({
        where: {
          nurseId: parsedNurseId,
          branchId: appt.branchId,
          date: { gte: todayStart, lt: todayEnd },
        },
      });

      if (!nurseSchedule) {
        return res.status(400).json({
          error: "Selected nurse is not currently on shift",
        });
      }

      nurseIdValue = parsedNurseId;
    }

    // Update encounter performer
    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { nurseId: nurseIdValue },
    });

    // Replace IMAGING encounterServices with the new selection
    const serviceIdsToSet = Array.isArray(selectedServiceIds)
      ? selectedServiceIds.map(Number).filter((n) => !Number.isNaN(n) && n > 0)
      : [];

    // Load existing IMAGING service IDs for this encounter
    const existingImagingServices = await prisma.encounterService.findMany({
      where: { encounterId: encounter.id },
      include: { service: { select: { id: true, category: true } } },
    });
    const existingImagingIds = existingImagingServices
      .filter((es) => es.service?.category === "IMAGING")
      .map((es) => es.id);

    // Delete existing IMAGING services
    if (existingImagingIds.length > 0) {
      await prisma.encounterService.deleteMany({
        where: { id: { in: existingImagingIds } },
      });
    }

    // Create new IMAGING services with single performer meta
    if (serviceIdsToSet.length > 0) {
      const services = await prisma.service.findMany({
        where: { id: { in: serviceIdsToSet }, isActive: true, category: "IMAGING" },
      });

      if (services.length !== serviceIdsToSet.length) {
        return res.status(400).json({
          error: "One or more services not found, inactive, or not IMAGING category",
        });
      }

      for (const service of services) {
        const metaData = {
          toothScope: "ALL",
          assignedTo: performerType,
          nurseId: performerType === "NURSE" ? nurseIdValue : null,
        };
        await prisma.encounterService.create({
          data: {
            encounterId: encounter.id,
            serviceId: service.id,
            quantity: 1,
            price: service.price,
            meta: metaData,
          },
        });
      }
    }

    return res.json({
      success: true,
      encounterId: encounter.id,
      performerType,
      nurseId: nurseIdValue,
      selectedServiceIds: serviceIdsToSet,
    });
  } catch (err) {
    console.error("PATCH /api/appointments/:id/imaging/config error:", err);
    return res.status(500).json({ error: "Failed to save imaging config" });
  }
});

/**
 * POST /api/appointments/:id/imaging/transition-to-ready
 *
 * Transition an imaging appointment to ready_to_pay status.
 * The imaging performer and selected services must already be saved via
 * PATCH /imaging/config before calling this endpoint.
 *
 * The request body is optional; if omitted the endpoint uses the services
 * already saved on the encounter.  For backward compatibility, if
 * serviceLines/serviceIds are provided they will replace the existing
 * IMAGING encounterServices before transitioning.
 *
 * Validation:
 * - Appointment must be in "imaging" status.
 * - Encounter must have at least one IMAGING service saved.
 */
router.post("/:id/imaging/transition-to-ready", async (req, res) => {
  try {
    const apptId = Number(req.params.id);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(400).json({ error: "Invalid appointment id" });
    }

    const { serviceIds, serviceLines } = req.body || {};

    // Validate appointment exists and is in imaging status.
    // Fetch ALL encounters (ordered desc) so we can copy XRAY media from
    // any older encounter into the canonical (latest) one.
    const appt = await prisma.appointment.findUnique({
      where: { id: apptId },
      include: {
        encounters: {
          orderBy: { id: "desc" },
          include: {
            encounterServices: {
              include: { service: true },
            },
          },
        },
      },
    });

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appt.status !== "imaging") {
      return res.status(400).json({
        error: "Transition to ready_to_pay is only allowed when status is 'imaging'",
      });
    }

    // Ensure encounter exists
    let encounter;
    if (!appt.encounters || appt.encounters.length === 0) {
      try {
        encounter = await ensureEncounterForAppointment(apptId);
        encounter = await prisma.encounter.findUnique({
          where: { id: encounter.id },
          include: { encounterServices: { include: { service: true } } },
        });
      } catch (err) {
        console.error("Failed to ensure encounter:", err);
        return res.status(400).json({
          error: "Failed to create encounter for this imaging appointment",
        });
      }
    } else {
      encounter = appt.encounters[0];
    }

    // If serviceLines/serviceIds are supplied (backward compat), replace IMAGING services
    const hasBodyLines =
      (Array.isArray(serviceLines) && serviceLines.length > 0) ||
      (Array.isArray(serviceIds) && serviceIds.length > 0);

    if (hasBodyLines) {
      // Build normalized lines
      let normalizedLines = [];
      if (Array.isArray(serviceLines) && serviceLines.length > 0) {
        normalizedLines = serviceLines.map((l) => ({
          serviceId: Number(l.serviceId),
          assignedTo: l.assignedTo === "NURSE" ? "NURSE" : "DOCTOR",
          nurseId: l.assignedTo === "NURSE" && l.nurseId != null ? Number(l.nurseId) : null,
        }));
      } else if (Array.isArray(serviceIds)) {
        normalizedLines = serviceIds.map((id) => ({
          serviceId: Number(id),
          assignedTo: "DOCTOR",
          nurseId: null,
        }));
      }

      const newServiceIds = normalizedLines.map((l) => l.serviceId);
      const services = await prisma.service.findMany({
        where: { id: { in: newServiceIds }, isActive: true },
      });

      if (services.length !== newServiceIds.length) {
        return res.status(400).json({ error: "One or more services not found or inactive" });
      }

      const imagingServices = services.filter((s) => s.category === "IMAGING");
      if (imagingServices.length !== services.length) {
        return res.status(400).json({
          error: "Only IMAGING category services can be added in imaging workflow",
        });
      }

      // Replace existing IMAGING services
      const existingImagingIds = encounter.encounterServices
        .filter((es) => es.service?.category === "IMAGING")
        .map((es) => es.id);
      if (existingImagingIds.length > 0) {
        await prisma.encounterService.deleteMany({ where: { id: { in: existingImagingIds } } });
      }

      const lineByServiceId = new Map(normalizedLines.map((l) => [l.serviceId, l]));
      for (const service of imagingServices) {
        const line = lineByServiceId.get(service.id) || {};
        const assignedTo = line.assignedTo ?? "DOCTOR";
        const metaData = {
          toothScope: "ALL",
          assignedTo,
          nurseId: assignedTo === "NURSE" && line.nurseId != null ? line.nurseId : null,
        };
        await prisma.encounterService.create({
          data: {
            encounterId: encounter.id,
            serviceId: service.id,
            quantity: 1,
            price: service.price,
            meta: metaData,
          },
        });
      }

      // Re-fetch encounter services for validation
      encounter = await prisma.encounter.findUnique({
        where: { id: encounter.id },
        include: { encounterServices: { include: { service: true } } },
      });
    }

    // Validate: encounter must have at least one IMAGING service
    const imagingServiceCount = encounter.encounterServices.filter(
      (es) => es.service?.category === "IMAGING"
    ).length;

    if (imagingServiceCount === 0) {
      return res.status(400).json({
        error:
          "Please select at least one imaging service before transitioning to billing. " +
          "Save the imaging config first.",
      });
    }

    // Update appointment status to ready_to_pay
    await prisma.appointment.update({
      where: { id: apptId },
      data: { status: "ready_to_pay" },
    });

    // Broadcast SSE so Appointments page reflects status change immediately
    if (appt.scheduledAt) {
      try {
        const apptForBroadcast = await prisma.appointment.findUnique({
          where: { id: apptId },
          include: {
            patient: { select: { id: true, name: true, ovog: true, phone: true, patientBook: true } },
            doctor: { select: { id: true, name: true, ovog: true } },
            branch: { select: { id: true, name: true } },
          },
        });
        if (apptForBroadcast?.scheduledAt) {
          const apptDate = naiveTsToYmd(apptForBroadcast.scheduledAt);
          // Include encounterId so the receptionist billing button works without a refresh.
          sseBroadcast(
            "appointment_updated",
            { ...apptForBroadcast, encounterId: encounter.id },
            apptDate,
            apptForBroadcast.branchId
          );
        }
      } catch (sseErr) {
        console.error("SSE broadcast error after imaging transition (non-fatal):", sseErr);
      }
    }

    // Copy XRAY media from any other encounter(s) linked to this appointment
    // into the canonical encounter so Billing can print all images.
    // Only runs when there are multiple encounters (imaging-only workflow).
    const otherEncounterIds = (appt.encounters || [])
      .slice(1)
      .map((e) => e.id);
    if (otherEncounterIds.length > 0) {
      try {
        await copyXrayMediaToCanonical(encounter.id, otherEncounterIds, prisma);
      } catch (copyErr) {
        // Non-fatal: log but do not block the transition
        console.error(
          "copyXrayMediaToCanonical failed (non-fatal):",
          copyErr
        );
      }
    }

    return res.json({
      success: true,
      message: "Appointment transitioned to ready_to_pay",
      appointmentId: apptId,
      encounterId: encounter.id,
    });
  } catch (err) {
    console.error("POST /api/appointments/:id/imaging/transition-to-ready error:", err);
    return res.status(500).json({ error: "Failed to transition appointment" });
  }
});

export default router;
export { sseBroadcast };
