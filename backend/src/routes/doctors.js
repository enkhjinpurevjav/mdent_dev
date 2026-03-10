import express from "express";
import prisma from "../db.js";
import { getShiftRank, maybeSwapRankForToday } from "../utils/shiftRank.js";

const router = express.Router();

function toISODateOnly(d) {
  if (!d) return null;
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function ymdToClinicStartEnd(ymd) {
  // Mongolia time UTC+8 boundaries (consistent with existing behavior)
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
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return days;
}

/**
 * GET /api/doctors/scheduled
 * (existing endpoint)
 */
router.get("/scheduled", async (req, res) => {
  try {
    const { date, dateFrom, dateTo, branchId, doctorId } = req.query;

    const hasRange = Boolean(dateFrom || dateTo);
    if (!hasRange && !date) {
      return res.status(400).json({
        error: "date is required (YYYY-MM-DD) or dateFrom/dateTo for range",
      });
    }

    if (hasRange && (!dateFrom || !dateTo)) {
      return res
        .status(400)
        .json({ error: "dateFrom and dateTo are both required for range" });
    }

    // Max range guard (prevents heavy queries)
    if (hasRange) {
      const days = diffDaysInclusive(dateFrom, dateTo);
      if (days == null) {
        return res.status(400).json({ error: "Invalid dateFrom/dateTo format" });
      }
      if (days > 31) {
        return res.status(400).json({ error: "Range too large (max 31 days)" });
      }
      if (days < 1) {
        return res.status(400).json({ error: "dateTo must be >= dateFrom" });
      }
    }

    // Build date range
    let start;
    let end;

    if (hasRange) {
      const r1 = ymdToClinicStartEnd(dateFrom);
      const r2 = ymdToClinicStartEnd(dateTo);
      if (!r1 || !r2) return res.status(400).json({ error: "Invalid date range format" });
      start = r1.start;
      end = r2.end;
    } else {
      const r = ymdToClinicStartEnd(date);
      if (!r) return res.status(400).json({ error: "Invalid date format" });
      start = r.start;
      end = r.end;
    }

    const where = {
      date: {
        gte: start,
        lte: end,
      },
    };

    let parsedBranchId = null;
    if (branchId) {
      const n = Number(branchId);
      if (!Number.isNaN(n)) {
        parsedBranchId = n;
        where.branchId = n;
      }
    }

    let parsedDoctorId = null;
    if (doctorId !== undefined && doctorId !== null && doctorId !== "") {
      const n = Number(doctorId);
      if (Number.isNaN(n)) {
        return res.status(400).json({ error: "doctorId must be a number" });
      }
      parsedDoctorId = n;
      where.doctorId = n;
    }

    const schedules = await prisma.doctorSchedule.findMany({
      where,
      include: {
        doctor: true,
      },
      orderBy: [
        { doctor: { calendarOrder: "asc" } },
        { doctorId: "asc" },
        { startTime: "asc" },
      ],
    });

    // Group by doctor
    const byDoctor = new Map();

    for (const s of schedules) {
      if (!s.doctor) continue;
      const existing =
        byDoctor.get(s.doctorId) || {
          id: s.doctor.id,
          name: s.doctor.name,
          ovog: s.doctor.ovog,
          calendarOrder: s.doctor.calendarOrder ?? 0,
          schedules: [],
        };

      existing.schedules.push({
        id: s.id,
        doctorId: s.doctorId,
        branchId: s.branchId,
        date: toISODateOnly(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      });

      byDoctor.set(s.doctorId, existing);
    }

    // If doctorId is provided, return that doctor even if schedules empty
    if (parsedDoctorId != null && !byDoctor.has(parsedDoctorId)) {
      const doc = await prisma.user.findUnique({
        where: { id: parsedDoctorId },
        select: { id: true, name: true, ovog: true, calendarOrder: true, role: true },
      });

      if (!doc || doc.role !== "doctor") {
        return res.status(404).json({ error: "Doctor not found" });
      }

      return res.json([
        {
          id: doc.id,
          name: doc.name,
          ovog: doc.ovog,
          calendarOrder: doc.calendarOrder ?? 0,
          schedules: [],
        },
      ]);
    }

    const doctors = Array.from(byDoctor.values()).sort((a, b) => {
      // Sort schedules by startTime to ensure deterministic first-schedule selection
      const schA = [...a.schedules].sort((x, y) => (x.startTime || "").localeCompare(y.startTime || ""));
      const schB = [...b.schedules].sort((x, y) => (x.startTime || "").localeCompare(y.startTime || ""));
      const firstA = schA[0];
      const firstB = schB[0];
      const ra = firstA ? maybeSwapRankForToday(firstA.startTime, firstA.date, hasRange ? null : date) : 0;
      const rb = firstB ? maybeSwapRankForToday(firstB.startTime, firstB.date, hasRange ? null : date) : 0;
      if (ra !== rb) return ra - rb;
      const ao = a.calendarOrder ?? 0;
      const bo = b.calendarOrder ?? 0;
      if (ao !== bo) return ao - bo;
      if (a.id !== b.id) return a.id - b.id;
      return (firstA?.startTime || "").localeCompare(firstB?.startTime || "");
    });

    return res.json(doctors);
  } catch (err) {
    console.error("Error fetching scheduled doctors:", err);
    return res.status(500).json({ error: "failed to fetch scheduled doctors" });
  }
});

/**
 * NEW: GET /api/doctors/scheduled-with-appointments
 *
 * Same query params as /scheduled, but returns:
 * [
 *   {
 *     id, name, ovog, calendarOrder,
 *     schedules: [...],
 *     appointments: [...]
 *   }
 * ]
 */
router.get("/scheduled-with-appointments", async (req, res) => {
  try {
    const { date, dateFrom, dateTo, branchId, doctorId } = req.query;

    const hasRange = Boolean(dateFrom || dateTo);
    if (!hasRange && !date) {
      return res.status(400).json({
        error: "date is required (YYYY-MM-DD) or dateFrom/dateTo for range",
      });
    }

    if (hasRange && (!dateFrom || !dateTo)) {
      return res.status(400).json({ error: "dateFrom and dateTo are both required for range" });
    }

    // Max range guard
    if (hasRange) {
      const days = diffDaysInclusive(dateFrom, dateTo);
      if (days == null) return res.status(400).json({ error: "Invalid dateFrom/dateTo format" });
      if (days > 31) return res.status(400).json({ error: "Range too large (max 31 days)" });
      if (days < 1) return res.status(400).json({ error: "dateTo must be >= dateFrom" });
    }

    // Build date range
    let start;
    let end;

    if (hasRange) {
      const r1 = ymdToClinicStartEnd(dateFrom);
      const r2 = ymdToClinicStartEnd(dateTo);
      if (!r1 || !r2) return res.status(400).json({ error: "Invalid date range format" });
      start = r1.start;
      end = r2.end;
    } else {
      const r = ymdToClinicStartEnd(date);
      if (!r) return res.status(400).json({ error: "Invalid date format" });
      start = r.start;
      end = r.end;
    }

    // 1) Fetch schedules (same as /scheduled)
    const scheduleWhere = {
      date: { gte: start, lte: end },
    };

    let parsedBranchId = null;
    if (branchId) {
      const n = Number(branchId);
      if (!Number.isNaN(n)) {
        parsedBranchId = n;
        scheduleWhere.branchId = n;
      }
    }

    let parsedDoctorId = null;
    if (doctorId !== undefined && doctorId !== null && doctorId !== "") {
      const n = Number(doctorId);
      if (Number.isNaN(n)) return res.status(400).json({ error: "doctorId must be a number" });
      parsedDoctorId = n;
      scheduleWhere.doctorId = n;
    }

    const schedules = await prisma.doctorSchedule.findMany({
      where: scheduleWhere,
      include: { doctor: true },
      orderBy: [
        { doctor: { calendarOrder: "asc" } },
        { doctorId: "asc" },
        { startTime: "asc" },
      ],
    });

    // Group schedules by doctor
    const byDoctor = new Map();

    for (const s of schedules) {
      if (!s.doctor) continue;
      const existing =
        byDoctor.get(s.doctorId) || {
          id: s.doctor.id,
          name: s.doctor.name,
          ovog: s.doctor.ovog,
          calendarOrder: s.doctor.calendarOrder ?? 0,
          schedules: [],
          appointments: [],
        };

      existing.schedules.push({
        id: s.id,
        doctorId: s.doctorId,
        branchId: s.branchId,
        date: toISODateOnly(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      });

      byDoctor.set(s.doctorId, existing);
    }

    // If doctorId is provided, ensure doctor appears even if no schedule rows
    if (parsedDoctorId != null && !byDoctor.has(parsedDoctorId)) {
      const doc = await prisma.user.findUnique({
        where: { id: parsedDoctorId },
        select: { id: true, name: true, ovog: true, calendarOrder: true, role: true },
      });

      if (!doc || doc.role !== "doctor") {
        return res.status(404).json({ error: "Doctor not found" });
      }

      byDoctor.set(parsedDoctorId, {
        id: doc.id,
        name: doc.name,
        ovog: doc.ovog,
        calendarOrder: doc.calendarOrder ?? 0,
        schedules: [],
        appointments: [],
      });
    }

    const doctorIds = Array.from(byDoctor.keys());
    if (doctorIds.length === 0) {
      // No doctors to return
      return res.json([]);
    }

    // 2) Fetch appointments for these doctors in the same range
    // IMPORTANT: front desk creates status "booked" by default.
    // Only show "active" statuses on schedule:
    const visibleStatuses = ["booked", "confirmed", "online", "ongoing", "imaging", "ready_to_pay"];

    const apptWhere = {
      doctorId: { in: doctorIds },
      scheduledAt: { gte: start, lte: end },
      status: { in: visibleStatuses },
    };

    if (parsedBranchId != null) {
      apptWhere.branchId = parsedBranchId;
    }

    const appts = await prisma.appointment.findMany({
      where: apptWhere,
      orderBy: { scheduledAt: "asc" },
      include: {
        patient: { select: { id: true, name: true, ovog: true } },
      },
    });

    for (const a of appts) {
      const entry = byDoctor.get(a.doctorId);
      if (!entry) continue;
      entry.appointments.push({
        id: a.id,
        doctorId: a.doctorId,
        branchId: a.branchId,
        patientId: a.patientId,
        patientName: a.patient?.name ?? null,
        patientOvog: a.patient?.ovog ?? null,
        scheduledAt: a.scheduledAt.toISOString(),
        endAt: a.endAt ? a.endAt.toISOString() : null,
        status: a.status,
      });
    }

    const doctors = Array.from(byDoctor.values()).sort((a, b) => {
      // Sort schedules by startTime to ensure deterministic first-schedule selection
      const schA = [...a.schedules].sort((x, y) => (x.startTime || "").localeCompare(y.startTime || ""));
      const schB = [...b.schedules].sort((x, y) => (x.startTime || "").localeCompare(y.startTime || ""));
      const firstA = schA[0];
      const firstB = schB[0];
      const ra = firstA ? maybeSwapRankForToday(firstA.startTime, firstA.date, hasRange ? null : date) : 0;
      const rb = firstB ? maybeSwapRankForToday(firstB.startTime, firstB.date, hasRange ? null : date) : 0;
      if (ra !== rb) return ra - rb;
      const ao = a.calendarOrder ?? 0;
      const bo = b.calendarOrder ?? 0;
      if (ao !== bo) return ao - bo;
      if (a.id !== b.id) return a.id - b.id;
      return (firstA?.startTime || "").localeCompare(firstB?.startTime || "");
    });

    return res.json(doctors);
  } catch (err) {
    console.error("Error fetching scheduled doctors with appointments:", err);
    return res.status(500).json({ error: "failed to fetch scheduled doctors with appointments" });
  }
});

/**
 * GET /api/doctors/:id/appointments
 * 
 * Query params:
 *   - from (required): YYYY-MM-DD
 *   - to (required): YYYY-MM-DD
 * 
 * Returns array of appointments for the doctor in the date range:
 * [
 *   {
 *     id, patientId, branchId, doctorId,
 *     scheduledAt, endAt, status, notes,
 *     patientName, patientOvog, patientBookNumber,
 *     branchName
 *   }
 * ]
 * 
 * Filters:
 * - doctorId = :id
 * - scheduledAt between from/to (Mongolia timezone UTC+8)
 * - Excludes status 'cancelled' and 'no_show'
 * - Max range: 62 days
 */
router.get("/:id/appointments", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!doctorId || Number.isNaN(doctorId)) {
      return res.status(400).json({ error: "Invalid doctor id" });
    }

    // Verify doctor exists and is a doctor
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true, role: true },
    });

    if (!doctor || doctor.role !== "doctor") {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const { from, to } = req.query;

    // Optional params
    const allStatuses = req.query.allStatuses === "true";
    const withEncounterData = req.query.withEncounterData === "true";

    // Validate required params
    if (!from || !to) {
      return res.status(400).json({ error: "from and to date parameters are required (YYYY-MM-DD)" });
    }

    // Validate date format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(from) || !datePattern.test(to)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    // Validate date range
    const days = diffDaysInclusive(from, to);
    if (days == null) {
      return res.status(400).json({ error: "Invalid date range" });
    }
    if (days < 1) {
      return res.status(400).json({ error: "to date must be >= from date" });
    }
    if (days > 62) {
      return res.status(400).json({ error: "Date range too large (max 62 days)" });
    }

    // Get date range boundaries (Mongolia timezone UTC+8)
    const fromRange = ymdToClinicStartEnd(from);
    const toRange = ymdToClinicStartEnd(to);

    if (!fromRange || !toRange) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Build where clause
    const whereClause = {
      doctorId: doctorId,
      scheduledAt: {
        gte: fromRange.start,
        lte: toRange.end,
      },
    };

    // When not fetching all statuses, exclude cancelled and no_show
    if (!allStatuses) {
      whereClause.status = { notIn: ["cancelled", "no_show"] };
    }

    // Build patient select — always include phone; it is omitted from the response
    // mapping unless withEncounterData is set (avoids conditional spread in select object)
    const patientSelect = {
      id: true,
      name: true,
      ovog: true,
      phone: true,
      patientBook: {
        select: {
          bookNumber: true,
        },
      },
    };

    // Build include clause
    const includeClause = {
      patient: { select: patientSelect },
      branch: {
        select: {
          id: true,
          name: true,
        },
      },
    };

    // When encounter data requested, include encounter details for materialsCount
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

    // Fetch appointments — history mode returns newest first, normal mode returns oldest first
    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: includeClause,
      orderBy: {
        scheduledAt: allStatuses ? "desc" : "asc",
      },
    });

    // Map to response format
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
    console.error("Error fetching doctor appointments:", err);
    return res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

/**
 * GET /api/doctors/:id/sales-summary
 * 
 * Query params:
 *   - date (optional): YYYY-MM-DD (defaults to today in clinic timezone)
 * 
 * Returns:
 * {
 *   doctorId: number,
 *   date: "YYYY-MM-DD",
 *   todayTotal: number,
 *   monthFrom: "YYYY-MM-DD",
 *   monthTo: "YYYY-MM-DD",
 *   monthTotal: number
 * }
 */
router.get("/:id/sales-summary", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!doctorId || Number.isNaN(doctorId)) {
      return res.status(400).json({ error: "Invalid doctor id" });
    }

    // Verify doctor exists and is a doctor
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true, role: true },
    });

    if (!doctor || doctor.role !== "doctor") {
      return res.status(404).json({ error: "Doctor not found" });
    }

    // Parse date parameter (defaults to today in Mongolia time)
    let targetDate = req.query.date;
    if (!targetDate) {
      // Get current date in Mongolia time (UTC+8)
      const now = new Date();
      const mongoliaOffset = 8 * 60; // +8 hours in minutes
      const localTime = new Date(now.getTime() + mongoliaOffset * 60000);
      targetDate = localTime.toISOString().slice(0, 10);
    }

    // Validate date format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(targetDate)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    // Get day boundaries for target date
    const dayRange = ymdToClinicStartEnd(targetDate);
    if (!dayRange) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Calculate month boundaries
    const [year, month] = targetDate.split("-").map(Number);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    
    // Get last day of month
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const monthStartRange = ymdToClinicStartEnd(monthStart);
    const monthEndRange = ymdToClinicStartEnd(monthEnd);

    if (!monthStartRange || !monthEndRange) {
      return res.status(400).json({ error: "Failed to calculate month boundaries" });
    }

    // Query today's payments
    const todayPayments = await prisma.payment.findMany({
      where: {
        timestamp: {
          gte: dayRange.start,
          lte: dayRange.end,
        },
        invoice: {
          encounter: {
            doctorId: doctorId,
          },
        },
      },
      select: {
        amount: true,
      },
    });

    const todayTotal = todayPayments.reduce((sum, p) => sum + p.amount, 0);

    // Query month's payments
    const monthPayments = await prisma.payment.findMany({
      where: {
        timestamp: {
          gte: monthStartRange.start,
          lte: monthEndRange.end,
        },
        invoice: {
          encounter: {
            doctorId: doctorId,
          },
        },
      },
      select: {
        amount: true,
      },
    });

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
    console.error("Error fetching doctor sales summary:", err);
    return res.status(500).json({ error: "Failed to fetch sales summary" });
  }
});

export default router;
