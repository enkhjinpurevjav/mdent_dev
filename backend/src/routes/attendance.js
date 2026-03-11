import express from "express";
import prisma from "../db.js";
import { haversineDistanceM } from "../utils/geo.js";

const router = express.Router();

const MAX_ACCURACY_M = 100;
const DEFAULT_RADIUS_M = 150;

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

/**
 * Enforce geofence: accuracy must be <=100m and distance <=150m.
 * Throws with status 403 on violation.
 */
async function enforceGeofence(userId, lat, lng, accuracyM) {
  if (accuracyM > MAX_ACCURACY_M) {
    const err = new Error(
      `Таны байршлын нарийвчлал ${accuracyM}м байна (хязгаар: ${MAX_ACCURACY_M}м). ` +
        "GPS дохио сайжрах хүртэл хүлээнэ үү."
    );
    err.status = 403;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { branchId: true },
  });

  if (!user?.branchId) {
    const err = new Error(
      "Таны бүртгэлд салбар холбогдоогүй байна. Администраторт хандана уу."
    );
    err.status = 400;
    throw err;
  }

  const branch = await prisma.branch.findUnique({
    where: { id: user.branchId },
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

  return { branchId: branch.id };
}

/**
 * GET /api/attendance/me
 * Returns today's attendance status: open session (if any) and recent history.
 */
router.get("/me", async (req, res) => {
  try {
    const userId = req.user.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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
 * Body: { lat, lng, accuracyM }
 */
router.post("/check-in", async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lng, accuracyM } = parseGeoBody(req.body);

    // Enforce geofence
    const { branchId } = await enforceGeofence(userId, lat, lng, accuracyM);

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
 * Body: { lat, lng, accuracyM }
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

    // Enforce geofence
    await enforceGeofence(userId, lat, lng, accuracyM);

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
