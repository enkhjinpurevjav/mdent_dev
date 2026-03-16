/**
 * backend/src/routes/check-in.js
 *
 * Public endpoints for the patient self-check-in tablet page.
 * No authentication required — accessible by patients at the clinic door.
 *
 * Mounted at /api/check-in (see index.js)
 */
import express from "express";
import prisma from "../db.js";
import { sseBroadcast } from "./appointments.js";

const router = express.Router();

/**
 * Parse a clinic-local date string (YYYY-MM-DD) into [startOfDay, endOfDay].
 * Relies on server local timezone (Asia/Ulaanbaatar).
 */
function parseClinicDay(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return null;
  const localStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { localStart, localEnd };
}

/**
 * Mask a patient's name for privacy on the tablet display.
 * Format: {first letter of ovog}.{first 3 letters of name}***
 * Example: "Энхжин" with ovog "Пүрэв" → "П.Энх***"
 */
function maskPatientName(ovog, name) {
  const namePart = name || "";
  const ovogPart = ovog || "";

  const maskedOvog = ovogPart.length > 0 ? ovogPart.charAt(0) + "." : "";
  const nameFirst3 = [...namePart].slice(0, 3).join("");
  const remaining = Math.max(0, [...namePart].length - 3);
  const stars = remaining > 0 ? "*".repeat(remaining) : "***";

  return `${maskedOvog}${nameFirst3}${stars}`;
}

/**
 * Given a list of today's appointments for a patient (sorted by scheduledAt asc),
 * pick the one to check in to:
 *   1. Earliest with scheduledAt >= now - 2 hours
 *   2. If none, earliest overall today
 */
function pickAppointment(appointments) {
  if (!appointments || appointments.length === 0) return null;
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const upcoming = appointments.filter((a) => a.scheduledAt >= twoHoursAgo);
  if (upcoming.length > 0) {
    return upcoming.reduce((a, b) => (a.scheduledAt <= b.scheduledAt ? a : b));
  }
  return appointments.reduce((a, b) => (a.scheduledAt <= b.scheduledAt ? a : b));
}

/**
 * GET /api/check-in/search
 * Query params:
 *   branchId  (required)
 *   phone     (required, partial match)
 *   date      (required, YYYY-MM-DD — must be today)
 *
 * Returns a list of candidate patients (each with masked name + chosen appointment).
 */
router.get("/search", async (req, res) => {
  try {
    const { branchId, phone, date } = req.query;

    if (!branchId || !phone || !date) {
      return res
        .status(400)
        .json({ error: "branchId, phone, and date are required" });
    }

    const parsedBranchId = Number(branchId);
    if (Number.isNaN(parsedBranchId) || parsedBranchId <= 0) {
      return res.status(400).json({ error: "branchId must be a positive number" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const phoneStr = String(phone).trim();
    if (phoneStr.length < 4) {
      // Require at least 4 digits before searching to avoid returning huge lists
      return res.json([]);
    }

    const parsed = parseClinicDay(date);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid date" });
    }
    const { localStart, localEnd } = parsed;

    // Find appointments today in this branch where patient phone matches
    const appointments = await prisma.appointment.findMany({
      where: {
        branchId: parsedBranchId,
        scheduledAt: { gte: localStart, lte: localEnd },
        patient: {
          phone: { contains: phoneStr },
          isActive: true,
        },
        // Only include statuses that make sense to check in
        status: { notIn: ["cancelled", "no_show", "completed"] },
      },
      orderBy: { scheduledAt: "asc" },
      include: {
        patient: {
          select: { id: true, name: true, ovog: true, phone: true },
        },
        doctor: {
          select: { id: true, name: true, ovog: true },
        },
        branch: {
          select: { id: true, name: true },
        },
      },
    });

    // Group by patient (one result row per patient, picking the correct appointment)
    const byPatient = new Map();
    for (const appt of appointments) {
      const pid = appt.patientId;
      if (!byPatient.has(pid)) {
        byPatient.set(pid, []);
      }
      byPatient.get(pid).push(appt);
    }

    const results = [];
    for (const [, patientAppts] of byPatient) {
      const chosen = pickAppointment(patientAppts);
      if (!chosen) continue;

      const p = chosen.patient;
      const doc = chosen.doctor;
      const doctorDisplay = (() => {
  if (!doc) return null;

  const ovogInitial = doc.ovog?.trim()?.[0] ? `${doc.ovog.trim()[0]}.` : "";

  const rawName = (doc.name || "").trim();
  if (!rawName) return null;

  // If doc.name is stored as "Шинэ Туршилтэмч", keep only the last part ("Туршилтэмч")
  const parts = rawName.split(/\s+/).filter(Boolean);
  const givenName = parts.length > 1 ? parts[parts.length - 1] : rawName;

  return `${ovogInitial}${givenName}`;
})();

      results.push({
        patientId: p.id,
        appointmentId: chosen.id,
        maskedName: maskPatientName(p.ovog, p.name),
        scheduledAt: chosen.scheduledAt.toISOString(),
        doctorDisplay,
        branchId: chosen.branchId,
        checkedInAt: chosen.checkedInAt ? chosen.checkedInAt.toISOString() : null,
      });
    }

    return res.json(results);
  } catch (err) {
    console.error("Error in check-in search:", err);
    return res.status(500).json({ error: "search failed" });
  }
});

/**
 * POST /api/check-in/confirm
 * Body: { appointmentId }
 *
 * Sets checkedInAt = now on the appointment (if not already set).
 * Broadcasts appointment_updated SSE so reception sees it immediately.
 */
router.post("/confirm", async (req, res) => {
  try {
    const { appointmentId } = req.body || {};

    if (!appointmentId) {
      return res.status(400).json({ error: "appointmentId is required" });
    }

    const id = Number(appointmentId);
    if (Number.isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "appointmentId must be a positive number" });
    }

    const appt = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, name: true, ovog: true, phone: true, patientBook: true },
        },
        doctor: { select: { id: true, name: true, ovog: true } },
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, ovog: true } },
      },
    });

    if (!appt) {
      return res.status(404).json({ error: "Цаг захиалга олдсонгүй" });
    }

    // Guard: don't check in already-checked-in patients
    if (appt.checkedInAt) {
      return res.status(409).json({
        alreadyCheckedIn: true,
        message: "Та аль хэдийн баталгаажсан байна",
      });
    }

    // Guard: don't check in cancelled/completed appointments
    if (["cancelled", "no_show", "completed"].includes(appt.status)) {
      return res.status(400).json({ error: "Цаг захиалга баталгаажуулах боломжгүй төлөвтэй байна" });
    }

    // Set checkedInAt
    const now = new Date();
    const updated = await prisma.appointment.update({
      where: { id },
      data: { checkedInAt: now },
      include: {
        patient: {
          select: { id: true, name: true, ovog: true, phone: true, patientBook: true },
        },
        doctor: { select: { id: true, name: true, ovog: true } },
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, ovog: true } },
      },
    });

    // Build the broadcast payload (matches the shape from appointments.js)
    const patient = updated.patient;
    const doctor = updated.doctor;
    const branch = updated.branch;
    const doctorName =
      doctor && (doctor.name || doctor.ovog)
        ? [doctor.ovog, doctor.name].filter(Boolean).join(" ")
        : null;

    const broadcastPayload = {
      id: updated.id,
      branchId: updated.branchId,
      doctorId: updated.doctorId,
      patientId: updated.patientId,
      patientName: patient ? patient.name : null,
      patientOvog: patient ? patient.ovog || null : null,
      patientRegNo: null,
      patientPhone: patient ? patient.phone || null : null,
      doctorName,
      doctorOvog: doctor ? doctor.ovog || null : null,
      scheduledAt: updated.scheduledAt ? updated.scheduledAt.toISOString() : null,
      endAt: updated.endAt ? updated.endAt.toISOString() : null,
      status: updated.status,
      notes: updated.notes || null,
      checkedInAt: updated.checkedInAt ? updated.checkedInAt.toISOString() : null,
      createdByUserId: updated.createdByUserId || null,
      source: updated.source || null,
      sourceEncounterId: updated.sourceEncounterId || null,
      createdAt: updated.createdAt ? updated.createdAt.toISOString() : null,
      updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
      updatedByUserId: updated.updatedByUserId || null,
      createdByUser: updated.createdBy
        ? { id: updated.createdBy.id, name: updated.createdBy.name || null, ovog: updated.createdBy.ovog || null }
        : null,
      updatedByUser: null,
      patient: patient
        ? {
            id: patient.id,
            name: patient.name,
            ovog: patient.ovog || null,
            regNo: null,
            phone: patient.phone || null,
            patientBook: patient.patientBook || null,
          }
        : null,
      branch: branch ? { id: branch.id, name: branch.name } : null,
      startTime: updated.scheduledAt ? updated.scheduledAt.toISOString() : null,
      endTime: updated.endAt ? updated.endAt.toISOString() : null,
      regNo: null,
      branchName: branch ? branch.name : null,
    };

    // Broadcast SSE so reception sees the update immediately
    if (updated.scheduledAt) {
      const apptDate = updated.scheduledAt.toISOString().slice(0, 10);
      sseBroadcast("appointment_updated", broadcastPayload, apptDate, updated.branchId);
    }

    return res.json({
      success: true,
      message: "Амжилттай баталгаажууллаа. Таныг тун удахгүй дуудах болно. Баярлалаа",
      checkedInAt: updated.checkedInAt.toISOString(),
    });
  } catch (err) {
    console.error("Error in check-in confirm:", err);
    return res.status(500).json({ error: "confirm failed" });
  }
});

export default router;
