import { Router } from "express";
import prisma from "../../db.js";

const router = Router();

/**
 * GET /api/admin/attendance
 *
 * Schedule-driven attendance report (includes Absent rows) + Unscheduled attendance.
 *
 * Query params:
 *   fromTs    - ISO timestamp for start of range (required)
 *   toTs      - ISO timestamp for end of range   (required)
 *   branchId  - optional number
 *   userId    - optional number
 *   status    - optional: all | present | open | absent | unscheduled
 *   page      - default 1
 *   pageSize  - default 50
 */
router.get("/attendance", async (req, res) => {
  try {
    const { fromTs, toTs, branchId, userId, status, page, pageSize } =
      req.query;

    if (!fromTs || !toTs) {
      return res.status(400).json({ error: "fromTs and toTs are required" });
    }

    const from = new Date(fromTs);
    const to = new Date(toTs);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res
        .status(400)
        .json({ error: "fromTs and toTs must be valid ISO timestamps" });
    }

    const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);
    const pageSizeNum = Math.max(
      1,
      Math.min(200, parseInt(pageSize || "50", 10) || 50)
    );

    const filterBranchId = branchId ? Number(branchId) : null;
    const filterUserId = userId ? Number(userId) : null;
    const filterStatus =
      status && status !== "all" ? String(status) : null;

    // ------------------------------------------------------------------
    // 1. Load schedules for doctors / nurses / receptionists in range
    // ------------------------------------------------------------------
    const scheduleWhere = {
      date: { gte: from, lte: to },
    };
    if (filterBranchId) scheduleWhere.branchId = filterBranchId;

    const [doctorSchedules, nurseSchedules, receptionSchedules] =
      await Promise.all([
        prisma.doctorSchedule.findMany({
          where: filterUserId
            ? { ...scheduleWhere, doctorId: filterUserId }
            : scheduleWhere,
          include: {
            doctor: {
              select: { id: true, name: true, ovog: true, email: true, role: true },
            },
            branch: { select: { id: true, name: true } },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
        prisma.nurseSchedule.findMany({
          where: filterUserId
            ? { ...scheduleWhere, nurseId: filterUserId }
            : scheduleWhere,
          include: {
            nurse: {
              select: { id: true, name: true, ovog: true, email: true, role: true },
            },
            branch: { select: { id: true, name: true } },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
        prisma.receptionSchedule.findMany({
          where: filterUserId
            ? { ...scheduleWhere, receptionId: filterUserId }
            : scheduleWhere,
          include: {
            reception: {
              select: { id: true, name: true, ovog: true, email: true, role: true },
            },
            branch: { select: { id: true, name: true } },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
      ]);

    // ------------------------------------------------------------------
    // 2. Load all AttendanceSessions in the range
    // ------------------------------------------------------------------
    const sessionWhere = {
      checkInAt: { gte: from, lte: to },
    };
    if (filterBranchId) sessionWhere.branchId = filterBranchId;
    if (filterUserId) sessionWhere.userId = filterUserId;

    const sessions = await prisma.attendanceSession.findMany({
      where: sessionWhere,
      include: {
        user: {
          select: { id: true, name: true, ovog: true, email: true, role: true },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { checkInAt: "asc" },
    });

    // ------------------------------------------------------------------
    // 3. Build a lookup: sessionsByUserAndDate -> earliest check-in per user per date
    //    Key: `${userId}:${dateStr YYYY-MM-DD}`
    // ------------------------------------------------------------------
    const sessionMap = new Map(); // key -> AttendanceSession (earliest)
    for (const s of sessions) {
      const dateStr = s.checkInAt.toISOString().slice(0, 10);
      const key = `${s.userId}:${dateStr}`;
      const existing = sessionMap.get(key);
      if (!existing || s.checkInAt < existing.checkInAt) {
        sessionMap.set(key, s);
      }
    }

    // Track which session keys have been matched to a schedule row
    const matchedSessionKeys = new Set();

    // ------------------------------------------------------------------
    // 4. Build scheduled rows
    // ------------------------------------------------------------------
    const rows = [];

    // Helper: merge schedule + session into a report row
    function buildRow(scheduleEntry) {
      const { user, branch, date, startTime, endTime, note } = scheduleEntry;
      const dateStr = date.toISOString().slice(0, 10);
      const key = `${user.id}:${dateStr}`;
      const session = sessionMap.get(key) || null;

      // Mark this session key as "matched" so we don't include it again as unscheduled
      if (session) {
        matchedSessionKeys.add(key);
      }

      // Compute status + metrics
      let rowStatus = "absent";
      let durationMinutes = null;
      let lateMinutes = null;
      let earlyLeaveMinutes = null;

      if (session) {
        rowStatus = session.checkOutAt ? "present" : "open";

        // Duration
        if (session.checkOutAt) {
          durationMinutes = Math.round(
            (session.checkOutAt.getTime() - session.checkInAt.getTime()) / 60000
          );
        }

        // Late / early calculations using wall-clock HH:MM comparison.
        // Schedule startTime/endTime are "HH:MM" strings (local wall-clock time).
        // We extract wall-clock hours/minutes from checkInAt/checkOutAt using the
        // server's local clock (which should match the clinic's timezone).
        const schedStartMins = parseHHMM(startTime);
        const schedEndMins = parseHHMM(endTime);

        if (schedStartMins !== null) {
          const checkInMins =
            session.checkInAt.getHours() * 60 + session.checkInAt.getMinutes();
          const diff = checkInMins - schedStartMins;
          if (diff >= 1) lateMinutes = diff;
        }

        if (schedEndMins !== null && session.checkOutAt) {
          const checkOutMins =
            session.checkOutAt.getHours() * 60 +
            session.checkOutAt.getMinutes();
          const diff = schedEndMins - checkOutMins;
          if (diff >= 1) earlyLeaveMinutes = diff;
        }
      }

      return {
        rowType: "scheduled",
        userId: user.id,
        userName: user.name,
        userOvog: user.ovog,
        userEmail: user.email,
        userRole: user.role,
        branchId: branch.id,
        branchName: branch.name,
        scheduledDate: dateStr,
        scheduledStart: startTime,
        scheduledEnd: endTime,
        scheduleNote: note || null,
        checkInAt: session?.checkInAt?.toISOString() || null,
        checkOutAt: session?.checkOutAt?.toISOString() || null,
        durationMinutes,
        lateMinutes,
        earlyLeaveMinutes,
        status: rowStatus,
      };
    }

    // Doctor schedules
    for (const s of doctorSchedules) {
      rows.push(buildRow({ ...s, user: s.doctor }));
    }

    // Nurse schedules
    for (const s of nurseSchedules) {
      rows.push(buildRow({ ...s, user: s.nurse }));
    }

    // Reception schedules
    for (const s of receptionSchedules) {
      rows.push(buildRow({ ...s, user: s.reception }));
    }

    // ------------------------------------------------------------------
    // 5. Add unscheduled attendance rows (sessions not matched to any schedule)
    // ------------------------------------------------------------------
    for (const s of sessions) {
      const dateStr = s.checkInAt.toISOString().slice(0, 10);
      const key = `${s.userId}:${dateStr}`;

      // Skip if this user+date was matched to a schedule row
      if (matchedSessionKeys.has(key)) continue;

      // Only include if this session is the "canonical" one for user+date
      const canonical = sessionMap.get(key);
      if (!canonical || canonical.id !== s.id) continue;

      let durationMinutes = null;
      if (s.checkOutAt) {
        durationMinutes = Math.round(
          (s.checkOutAt.getTime() - s.checkInAt.getTime()) / 60000
        );
      }

      rows.push({
        rowType: "unscheduled",
        userId: s.user.id,
        userName: s.user.name,
        userOvog: s.user.ovog,
        userEmail: s.user.email,
        userRole: s.user.role,
        branchId: s.branch.id,
        branchName: s.branch.name,
        scheduledDate: dateStr,
        scheduledStart: null,
        scheduledEnd: null,
        scheduleNote: null,
        checkInAt: s.checkInAt.toISOString(),
        checkOutAt: s.checkOutAt?.toISOString() || null,
        durationMinutes,
        lateMinutes: null,
        earlyLeaveMinutes: null,
        status: "unscheduled",
      });
    }

    // ------------------------------------------------------------------
    // 6. Filter by status
    // ------------------------------------------------------------------
    const filtered = filterStatus
      ? rows.filter((r) => r.status === filterStatus)
      : rows;

    // Sort: by scheduledDate then by userName
    filtered.sort((a, b) => {
      const d = a.scheduledDate.localeCompare(b.scheduledDate);
      if (d !== 0) return d;
      const nameA = `${a.userOvog || ""}${a.userName || ""}`;
      const nameB = `${b.userOvog || ""}${b.userName || ""}`;
      return nameA.localeCompare(nameB);
    });

    // ------------------------------------------------------------------
    // 7. Paginate
    // ------------------------------------------------------------------
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const safePage = Math.min(pageNum, totalPages);
    const items = filtered.slice(
      (safePage - 1) * pageSizeNum,
      safePage * pageSizeNum
    );

    return res.json({
      items,
      page: safePage,
      pageSize: pageSizeNum,
      total,
      totalPages,
    });
  } catch (err) {
    console.error("GET /api/admin/attendance error:", err);
    return res.status(500).json({ error: "Серверийн алдаа гарлаа." });
  }
});

/**
 * Parse a "HH:MM" time string into total minutes since midnight.
 * Returns null if the string is invalid.
 */
function parseHHMM(timeStr) {
  if (!timeStr) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export default router;
