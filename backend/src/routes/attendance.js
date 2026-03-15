import express from "express";
import prisma from "../db.js";
import { haversineDistanceM } from "../utils/geo.js";

const router = express.Router();

const MAX_ACCURACY_M = 100;
const DEFAULT_RADIUS_M = 150;
const EARLY_CHECKIN_MINUTES = 120;
const MONGOLIA_OFFSET_MS = 8 * 60 * 60_000; // UTC+8
const MS_PER_MINUTE = 60_000;

/**
 * Validate and parse geo body { lat, lng, accuracyM }.
 * Returns { lat, lng, accuracyM } on success or throws with a message.
 */
function parseGeoBody(body) {
  const { lat, lng, accuracyM } = body || {};

  if (typeof lat !== "number" || typeof lng !== "number" || typeof accuracyM !== "number") {
    const err = new Error("lat, lng, accuracyM тоон утгаар илгээх шаардлагатай.");
    err.status = 400;
    throw err;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const err = new Error("lat/lng утга буруу байна.");
    err.status = 400;
    throw err;
  }
  if (accuracyM <= 0) {
    const err = new Error("accuracyM эерэг тоо байх ёстой.");
    err.status = 400;
    throw err;
  }

  return { lat, lng, accuracyM };
}

/** Returns today's date string (YYYY-MM-DD) in Mongolia timezone (UTC+8). */
function mongoliaDateString(now) {
  const shifted = new Date(now.getTime() + MONGOLIA_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Parse a "HH:MM" schedule time string on a given YYYY-MM-DD date
 * in Mongolia timezone (UTC+8). Returns a UTC Date.
 */
function parseScheduleTime(ymd, timeStr) {
  return new Date(`${ymd}T${timeStr}:00.000+08:00`);
}

/**
 * Automatically resolve the attendance branchId for the given user and role.
 *
 * - doctor / nurse / receptionist: look up today's schedule in the respective
 *   schedule table and verify that `now` is within the early check-in window
 *   [startTime - EARLY_CHECKIN_MINUTES, endTime].
 *   Throws 403 if no schedule exists for today or the window has not opened/closed.
 * - all other roles: return the user's primary User.branchId.
 */
async function resolveAttendanceBranch(userId, role, now) {
  if (role === "doctor" || role === "nurse" || role === "receptionist") {
    const todayYmd = mongoliaDateString(now);
    const dayStart = new Date(`${todayYmd}T00:00:00.000+08:00`);
    const dayEnd = new Date(`${todayYmd}T23:59:59.999+08:00`);

    let schedule = null;
    if (role === "doctor") {
      schedule = await prisma.doctorSchedule.findFirst({
        where: { doctorId: userId, date: { gte: dayStart, lte: dayEnd } },
        select: { branchId: true, startTime: true, endTime: true },
      });
    } else if (role === "nurse") {
      schedule = await prisma.nurseSchedule.findFirst({
        where: { nurseId: userId, date: { gte: dayStart, lte: dayEnd } },
        select: { branchId: true, startTime: true, endTime: true },
      });
    } else {
      schedule = await prisma.receptionSchedule.findFirst({
        where: { receptionId: userId, date: { gte: dayStart, lte: dayEnd } },
        select: { branchId: true, startTime: true, endTime: true },
      });
    }

    if (!schedule) {
      const err = new Error("Өнөөдрийн ажлын хуваарь олдсонгүй. Администраторт хандана уу.");
      err.status = 403;
      throw err;
    }

    // Enforce early check-in window: [startTime - EARLY_CHECKIN_MINUTES, endTime]
    const startDt = parseScheduleTime(todayYmd, schedule.startTime);
    const endDt = parseScheduleTime(todayYmd, schedule.endTime);
    const earlyStart = new Date(startDt.getTime() - EARLY_CHECKIN_MINUTES * MS_PER_MINUTE);

    if (now < earlyStart || now > endDt) {
      const err = new Error(
        `Ирц бүртгэх цаг болоогүй байна. ` +
          `Таны хуваарийн цаг: ${schedule.startTime}–${schedule.endTime} ` +
          `(${EARLY_CHECKIN_MINUTES} минут эрт бүртгэх боломжтой).`
      );
      err.status = 403;
      throw err;
    }

    return schedule.branchId;
  }

  // Other roles: use the user's primary registered branch
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { branchId: true },
  });
  if (!user?.branchId) {
    const err = new Error(
      "Таны бүртгэлд үндсэн салбар тохируулаагүй байна. Администраторт хандана уу."
    );
    err.status = 403;
    throw err;
  }
  return user.branchId;
}

/**
 * Enforce geofence against a specific branch.
 * Accuracy must be <=MAX_ACCURACY_M and GPS distance <= branch radius.
 * Throws with status 403 on violation.
 */
async function enforceGeofenceForBranch(branchId, lat, lng, accuracyM) {
  if (accuracyM > MAX_ACCURACY_M) {
    const err = new Error(
      `Таны байршлын нарийвчлал ${accuracyM}м байна (хязгаар: ${MAX_ACCURACY_M}м). ` +
        "GPS дохио сайжрах хүртэл хүлээнэ үү."
    );
    err.status = 403;
    throw err;
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, geoLat: true, geoLng: true, geoRadiusM: true },
  });

  if (!branch?.geoLat || !branch?.geoLng) {
    const err = new Error(
      "Таны салбарын байршил тохируулаагүй байна. Администраторт хандана уу."
    );
    err.status = 400;
    throw err;
  }

  const radiusM = branch.geoRadiusM ?? DEFAULT_RADIUS_M;
  const distM = haversineDistanceM(lat, lng, branch.geoLat, branch.geoLng);

  if (distM > radiusM) {
    const err = new Error(
      `Та салбараас ${Math.round(distM)}м зайтай байна (зөвшөөрөгдөх хязгаар: ${radiusM}м). ` +
        "Салбарын ойролцоо орж ирнэ үү."
    );
    err.status = 403;
    throw err;
  }
}

/**
 * GET /api/attendance/me
 * Returns today's attendance status: open session (if any) and recent history.
 */
router.get("/me", async (req, res) => {
  try {
    const userId = req.user.id;

    // Find open session (checked in but not yet checked out)
    const openSession = await prisma.attendanceSession.findFirst({
      where: { userId, checkOutAt: null },
      orderBy: { checkInAt: "desc" },
    });

    // Last 10 sessions for history
    const recent = await prisma.attendanceSession.findMany({
      where: {
        userId,
        checkInAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { checkInAt: "desc" },
      take: 10,
    });

    res.json({
      checkedIn: !!openSession,
      openSession: openSession ?? null,
      recent,
    });
  } catch (err) {
    console.error("GET /api/attendance/me error:", err);
    res.status(500).json({ error: "Серверийн алдаа гарлаа." });
  }
});

/**
 * POST /api/attendance/check-in
 * Body: { lat: number, lng: number, accuracyM: number }
 * The attendance branch is automatically determined from today's schedule
 * (for doctor/nurse/receptionist) or the user's primary branch (other roles).
 */
router.post("/check-in", async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { lat, lng, accuracyM } = parseGeoBody(req.body);

    // Automatically resolve which branch this worker is attending today
    const branchId = await resolveAttendanceBranch(userId, role, new Date());

    // Enforce geofence against the resolved branch
    await enforceGeofenceForBranch(branchId, lat, lng, accuracyM);

    // Check for existing open session
    const existing = await prisma.attendanceSession.findFirst({
      where: { userId, checkOutAt: null },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Та аль хэдийн ирц бүртгэсэн байна. Эхлээд гарах бүртгэл хийнэ үү." });
    }

    const session = await prisma.attendanceSession.create({
      data: {
        userId,
        branchId,
        checkInAt: new Date(),
        checkInLat: lat,
        checkInLng: lng,
        checkInAccuracyM: Math.round(accuracyM),
      },
    });

    res.status(201).json({ session });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("POST /api/attendance/check-in error:", err);
    res.status(500).json({ error: "Серверийн алдаа гарлаа." });
  }
});

/**
 * POST /api/attendance/check-out
 * Body: { lat: number, lng: number, accuracyM: number }
 * Geofence is enforced against the branch recorded at check-in time to
 * prevent switching branches between check-in and check-out.
 */
router.post("/check-out", async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lng, accuracyM } = parseGeoBody(req.body);

    // Must have open session first
    const openSession = await prisma.attendanceSession.findFirst({
      where: { userId, checkOutAt: null },
      orderBy: { checkInAt: "desc" },
    });
    if (!openSession) {
      return res
        .status(409)
        .json({ error: "Ирц бүртгэл олдсонгүй. Эхлээд ирц бүртгэнэ үү." });
    }

    // Use the session's branchId to prevent branch-switching on check-out
    await enforceGeofenceForBranch(openSession.branchId, lat, lng, accuracyM);

    const updated = await prisma.attendanceSession.update({
      where: { id: openSession.id },
      data: {
        checkOutAt: new Date(),
        checkOutLat: lat,
        checkOutLng: lng,
        checkOutAccuracyM: Math.round(accuracyM),
      },
    });

    res.json({ session: updated });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("POST /api/attendance/check-out error:", err);
    res.status(500).json({ error: "Серверийн алдаа гарлаа." });
  }
});

export default router;
