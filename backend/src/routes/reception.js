import express from "express";
import prisma from "../db.js";
import { authenticateJWT, requireRole } from "../middleware/auth.js";

const router = express.Router();

// ─── GET /api/reception/me ────────────────────────────────────────────────────
// Returns the authenticated receptionist's own user record.
// Allowed roles: receptionist, admin, super_admin.
// Must be registered BEFORE any router-level requireRole middleware.
router.get(
  "/me",
  authenticateJWT,
  requireRole("receptionist", "admin", "super_admin"),
  async (req, res) => {
    try {
      const id = req.user?.id;
      if (!id) {
        return res.status(401).json({ error: "Authentication required." });
      }

      const user = await prisma.user.findUnique({ where: { id } });

      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      return res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        ovog: user.ovog,
        regNo: user.regNo,
        branchId: user.branchId,
        phone: user.phone,
        idPhotoPath: user.idPhotoPath,
        role: user.role,
      });
    } catch (err) {
      console.error("GET /api/reception/me error:", err);
      return res.status(500).json({ error: "Failed to fetch receptionist profile." });
    }
  }
);

// ─── GET /api/reception/schedule ─────────────────────────────────────────────
// Returns authenticated receptionist's schedule.
// Default: upcoming entries (today and future, next 31 days).
// Optional query params: from=YYYY-MM-DD, to=YYYY-MM-DD (for history).
router.get(
  "/schedule",
  authenticateJWT,
  requireRole("receptionist", "admin", "super_admin"),
  async (req, res) => {
    const receptionistId = req.user?.id;
    if (!receptionistId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const { from, to } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fromDate = from ? new Date(from) : today;
    if (Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: "Invalid from date" });
    }

    let toDate;
    if (to) {
      toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        return res.status(400).json({ error: "Invalid to date" });
      }
    } else {
      toDate = new Date(fromDate);
      toDate.setDate(fromDate.getDate() + 31);
    }

    try {
      const schedules = await prisma.receptionSchedule.findMany({
        where: {
          receptionId: receptionistId,
          date: {
            gte: fromDate,
            lte: toDate,
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: {
          branch: { select: { id: true, name: true } },
        },
      });

      return res.json(
        schedules.map((s) => ({
          id: s.id,
          date: s.date.toISOString().slice(0, 10),
          branch: s.branch,
          startTime: s.startTime,
          endTime: s.endTime,
          note: s.note,
        }))
      );
    } catch (err) {
      console.error("GET /api/reception/schedule error:", err);
      return res.status(500).json({ error: "Failed to fetch receptionist schedule." });
    }
  }
);

/**
 * GET /api/reception/scheduled
 *
 * Query parameters:
 *  - date=YYYY-MM-DD      (required)
 *  - branchId=number      (optional)
 *
 * Returns: list of receptionists (User with role=receptionist)
 * who have a ReceptionSchedule entry on that date + their schedules.
 */
router.get("/scheduled", async (req, res) => {
  try {
    const { date, branchId } = req.query;

    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

  // AFTER (UTC+8)
const start = new Date(`${date}T00:00:00.000+08:00`);
const end = new Date(`${date}T23:59:59.999+08:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const where = {
      date: {
        gte: start,
        lte: end,
      },
    };

    if (branchId) {
      const parsedBranchId = Number(branchId);
      if (!Number.isNaN(parsedBranchId)) {
        where.branchId = parsedBranchId;
      }
    }

    const schedules = await prisma.receptionSchedule.findMany({
      where,
      include: {
        reception: true,
      },
      orderBy: [
        { receptionId: "asc" },
        { startTime: "asc" },
      ],
    });

    const byReception = new Map();

    for (const s of schedules) {
      if (!s.reception) continue;
      const existing =
        byReception.get(s.receptionId) || {
          id: s.reception.id,
          name: s.reception.name,
          ovog: s.reception.ovog,
          role: s.reception.role,
          schedules: [],
        };
      existing.schedules.push({
        id: s.id,
        branchId: s.branchId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      });
      byReception.set(s.receptionId, existing);
    }

    const receptionists = Array.from(byReception.values());

    res.json(receptionists);
  } catch (err) {
    console.error("Error fetching scheduled reception:", err);
    res.status(500).json({ error: "failed to fetch scheduled reception" });
  }
});

export default router;
