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
 * Validate and parse branchId from request body.
 * Returns branchId (integer) on success or throws with status 400.
 */
function parseBranchId(body) {
  const { branchId } = body || {};
  if (typeof branchId !== "number" || !Number.isFinite(branchId)) {
    const err = new Error("branchId тоон утгаар илгээх шаардлагатай.");
    err.status = 400;
    throw err;
  }
  return branchId;
}

/**
 * Returns the list of branch objects the user is allowed to check in/out at,
 * based on their role:
 *   doctor       → DoctorBranch join table
 *   nurse        → NurseBranch join table
 *   receptionist → ReceptionBranch join table
 *   other roles  → primary user.branchId
 */
async function getAllowedBranches(userId, role) {
  if (role === "doctor") {
    const rows = await prisma.doctorBranch.findMany({
      where: { doctorId: userId },
      include: { branch: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.branch);
  }
  if (role === "nurse") {
    const rows = await prisma.nurseBranch.findMany({
      where: { nurseId: userId },
      include: { branch: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.branch);
  }
  if (role === "receptionist") {
    const rows = await prisma.receptionBranch.findMany({
      where: { receptionId: userId },
      include: { branch: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.branch);
  }
  // All other roles: use the single primary branch
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { branch: { select: { id: true, name: true } } },
  });
  return user?.branch ? [user.branch] : [];
}

/**
 * Assert that the authenticated user is authorized to record attendance for
 * the given branchId. Throws 403 if not allowed.
 */
async function assertBranchAllowed(userId, role, branchId) {
  const branches = await getAllowedBranches(userId, role);
  if (!branches.some((b) => b.id === branchId)) {
    const err = new Error(
      "Та энэ салбарт ирц бүртгэх эрхгүй байна. Администраторт хандана уу."
    );
    err.status = 403;
    throw err;
  }
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
 * Returns today's attendance status: open session (if any), recent history,
 * and the list of branches this user is allowed to check in/out at.
 */
router.get("/me", async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

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

    const allowedBranches = await getAllowedBranches(userId, role);

    res.json({
      checkedIn: !!openSession,
      openSession: openSession ?? null,
      recent,
      allowedBranches,
    });
  } catch (err) {
    console.error("GET /api/attendance/me error:", err);
    res.status(500).json({ error: "Серверийн алдаа гарлаа." });
  }
});

/**
 * POST /api/attendance/check-in
 * Body: { lat: number, lng: number, accuracyM: number, branchId: number }
 */
router.post("/check-in", async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { lat, lng, accuracyM } = parseGeoBody(req.body);
    const branchId = parseBranchId(req.body);

    // Verify the user is authorized to check in at this branch
    await assertBranchAllowed(userId, role, branchId);

    // Enforce geofence against the requested branch
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
