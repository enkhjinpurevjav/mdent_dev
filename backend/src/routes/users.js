
import { Router } from "express";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const router = Router();

/**
 * Helper: ensure a user exists and is a doctor, or send 404.
 */
async function ensureDoctorOr404(id, res) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user || user.role !== UserRole.doctor) {
    res.status(404).json({ error: "Doctor not found" });
    return null;
  }
  return user;
}

async function ensureReceptionOr404(id, res) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user || user.role !== UserRole.receptionist) {
    res.status(404).json({ error: "Receptionist not found" });
    return null;
  }
  return user;
}

async function ensureNurseOr404(id, res) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user || user.role !== UserRole.nurse) {
    res.status(404).json({ error: "Nurse not found" });
    return null;
  }
  return user;
}
/**
 * GET /api/users?role=doctor&branchId=1
 * Supports:
 * - optional role filter
 * - optional branchId filter (legacy, on user.branchId)
 * - returns branches[] (many-to-many DoctorBranch) for all users
 */
router.get("/", async (req, res) => {
  const { role, branchId } = req.query;
  console.log("GET /api/users query:", req.query);

  try {
    const where = {};

    if (role) {
      // role is string at runtime, must match UserRole enum value
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ error: "Invalid role filter" });
      }
      where.role = role;
    }

    if (branchId) {
      const bidNum = Number(branchId);
      if (Number.isNaN(bidNum)) {
        return res.status(400).json({ error: "Invalid branchId filter" });
      }
      where.branchId = bidNum;
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        branch: true,
        doctorBranches: {
          include: { branch: true },
        },
      },
      orderBy: { id: "asc" },
    });

    const result = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      ovog: u.ovog,
      role: u.role,
      branchId: u.branchId,
      branch: u.branch ? { id: u.branch.id, name: u.branch.name } : null,
      branches:
        u.doctorBranches?.map((db) => ({
          id: db.branch.id,
          name: db.branch.name,
        })) ?? [],
      regNo: u.regNo,
      phone: u.phone || null,
      licenseNumber: u.licenseNumber,
      licenseExpiryDate: u.licenseExpiryDate
        ? u.licenseExpiryDate.toISOString()
        : null,
      calendarOrder: u.calendarOrder ?? null,
      createdAt: u.createdAt.toISOString(),
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error("GET /api/users error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/users
 * Creates any type of user; still uses legacy single branchId.
 * For doctors, you can later call PUT /api/users/:id/branches
 * to assign multiple branches.
 */
router.post("/", async (req, res) => {
  try {
    const { email, password, name, ovog, role, branchId, regNo, phone } =
      req.body || {};

    if (!email || !password || !role) {
      return res
        .status(400)
        .json({ error: "email, password, role are required" });
    }

    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: name || null,
        ovog: ovog || null,
        role,
        branchId: branchId ? Number(branchId) : null,
        regNo: regNo || null,
        phone: phone || null,
      },
      include: {
        branch: true,
        doctorBranches: {
          include: { branch: true },
        },
      },
    });

    return res.status(201).json({
      id: created.id,
      email: created.email,
      name: created.name,
      ovog: created.ovog,
      role: created.role,
      branchId: created.branchId,
      branch: created.branch
        ? { id: created.branch.id, name: created.branch.name }
        : null,
      regNo: created.regNo,
      phone: created.phone || null,
      createdAt: created.createdAt.toISOString(),
      branches:
        created.doctorBranches?.map((db) => ({
          id: db.branch.id,
          name: db.branch.name,
        })) ?? [],
    });
  } catch (err) {
    console.error("POST /api/users error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/users/:id/reception-schedule
 * Query params:
 *   from=YYYY-MM-DD (optional, defaults to today)
 *   to=YYYY-MM-DD   (optional, defaults to from + 31 days)
 *   branchId=number (optional)
 *
 * Returns the receptionist's schedule entries in the given range.
 */
router.get("/:id/reception-schedule", async (req, res) => {
  const receptionId = Number(req.params.id);
  if (!receptionId || Number.isNaN(receptionId)) {
    return res.status(400).json({ error: "Invalid receptionist id" });
  }

  try {
    const reception = await ensureReceptionOr404(receptionId, res);
    if (!reception) return;

    const { from, to, branchId } = req.query;

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

    const where = {
      receptionId,
      date: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (branchId) {
      const bid = Number(branchId);
      if (Number.isNaN(bid)) {
        return res.status(400).json({ error: "Invalid branchId" });
      }
      where.branchId = bid;
    }

    const schedules = await prisma.receptionSchedule.findMany({
      where,
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
    console.error("GET /api/users/:id/reception-schedule error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch reception schedule" });
  }
});

/**
 * POST /api/users/:id/reception-schedule
 * Body:
 * {
 *   date: "YYYY-MM-DD",
 *   branchId: number,
 *   startTime: "HH:MM",
 *   endTime: "HH:MM",
 *   note?: string
 * }
 *
 * Creates or updates a schedule entry for the given receptionist/branch/date.
 */
router.post("/:id/reception-schedule", async (req, res) => {
  const receptionId = Number(req.params.id);
  if (!receptionId || Number.isNaN(receptionId)) {
    return res.status(400).json({ error: "Invalid receptionist id" });
  }

  const { date, branchId, startTime, endTime, note } = req.body || {};

  if (!date || !branchId || !startTime || !endTime) {
    return res.status(400).json({
      error: "date, branchId, startTime, endTime are required",
    });
  }

  const day = new Date(date);
  if (Number.isNaN(day.getTime())) {
    return res.status(400).json({ error: "Invalid date" });
  }
  day.setHours(0, 0, 0, 0);

  const bid = Number(branchId);
  if (Number.isNaN(bid)) {
    return res.status(400).json({ error: "Invalid branchId" });
  }

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return res
      .status(400)
      .json({ error: "startTime and endTime must be HH:MM (24h)" });
  }

  if (startTime >= endTime) {
    return res
      .status(400)
      .json({ error: "startTime must be before endTime" });
  }

  try {
    const reception = await ensureReceptionOr404(receptionId, res);
    if (!reception) return;

    const branch = await prisma.branch.findUnique({
      where: { id: bid },
      select: { id: true, name: true },
    });
    if (!branch) {
      return res.status(400).json({ error: "Branch not found" });
    }

    // Optional: if you later add ReceptionBranch (many-to-many) you can check it here

    const weekday = day.getDay(); // 0=Sun .. 6=Sat
    const isWeekend = weekday === 0 || weekday === 6;
    const clinicOpen = isWeekend ? "10:00" : "09:00";
    const clinicClose = isWeekend ? "19:00" : "21:00";

    if (startTime < clinicOpen || endTime > clinicClose) {
      return res.status(400).json({
        error: "Schedule outside clinic hours",
        clinicOpen,
        clinicClose,
      });
    }

    const existing = await prisma.receptionSchedule.findFirst({
      where: { receptionId, branchId: bid, date: day },
    });

    let schedule;
    if (existing) {
      schedule = await prisma.receptionSchedule.update({
        where: { id: existing.id },
        data: {
          startTime,
          endTime,
          note: note || null,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
    } else {
      schedule = await prisma.receptionSchedule.create({
        data: {
          receptionId,
          branchId: bid,
          date: day,
          startTime,
          endTime,
          note: note || null,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
    }

    return res.status(existing ? 200 : 201).json({
      id: schedule.id,
      date: schedule.date.toISOString().slice(0, 10),
      branch: schedule.branch,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      note: schedule.note,
    });
  } catch (err) {
    console.error("POST /api/users/:id/reception-schedule error:", err);
    return res
      .status(500)
      .json({ error: "Failed to save reception schedule" });
  }
});

/**
 * DELETE /api/users/:id/reception-schedule/:scheduleId
 */
router.delete("/:id/reception-schedule/:scheduleId", async (req, res) => {
  const receptionId = Number(req.params.id);
  const scheduleId = Number(req.params.scheduleId);

  if (!receptionId || Number.isNaN(receptionId)) {
    return res.status(400).json({ error: "Invalid receptionist id" });
  }
  if (!scheduleId || Number.isNaN(scheduleId)) {
    return res.status(400).json({ error: "Invalid schedule id" });
  }

  try {
    const reception = await ensureReceptionOr404(receptionId, res);
    if (!reception) return;

    const existing = await prisma.receptionSchedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, receptionId: true },
    });

    if (!existing || existing.receptionId !== receptionId) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    await prisma.receptionSchedule.delete({
      where: { id: scheduleId },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(
      "DELETE /api/users/:id/reception-schedule/:scheduleId error:",
      err
    );
    return res
      .status(500)
      .json({ error: "Failed to delete reception schedule" });
  }
});

/**
 * GET /api/users/:id/nurse-schedule
 */
router.get("/:id/nurse-schedule", async (req, res) => {
  const nurseId = Number(req.params.id);
  if (!nurseId || Number.isNaN(nurseId)) {
    return res.status(400).json({ error: "Invalid nurse id" });
  }

  try {
    const nurse = await ensureNurseOr404(nurseId, res);
    if (!nurse) return;

    const { from, to, branchId } = req.query;

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

    const where = {
      nurseId,
      date: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (branchId) {
      const bid = Number(branchId);
      if (Number.isNaN(bid)) {
        return res.status(400).json({ error: "Invalid branchId" });
      }
      where.branchId = bid;
    }

    const schedules = await prisma.nurseSchedule.findMany({
      where,
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
    console.error("GET /api/users/:id/nurse-schedule error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch nurse schedule" });
  }
});

/**
 * POST /api/users/:id/nurse-schedule
 */
router.post("/:id/nurse-schedule", async (req, res) => {
  const nurseId = Number(req.params.id);
  if (!nurseId || Number.isNaN(nurseId)) {
    return res.status(400).json({ error: "Invalid nurse id" });
  }

  const { date, branchId, startTime, endTime, note } = req.body || {};

  if (!date || !branchId || !startTime || !endTime) {
    return res.status(400).json({
      error: "date, branchId, startTime, endTime are required",
    });
  }

  const day = new Date(date);
  if (Number.isNaN(day.getTime())) {
    return res.status(400).json({ error: "Invalid date" });
  }
  day.setHours(0, 0, 0, 0);

  const bid = Number(branchId);
  if (Number.isNaN(bid)) {
    return res.status(400).json({ error: "Invalid branchId" });
  }

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return res
      .status(400)
      .json({ error: "startTime and endTime must be HH:MM (24h)" });
  }

  if (startTime >= endTime) {
    return res
      .status(400)
      .json({ error: "startTime must be before endTime" });
  }

  try {
    const nurse = await ensureNurseOr404(nurseId, res);
    if (!nurse) return;

    const branch = await prisma.branch.findUnique({
      where: { id: bid },
      select: { id: true, name: true },
    });
    if (!branch) {
      return res.status(400).json({ error: "Branch not found" });
    }

    const weekday = day.getDay(); // 0=Sun .. 6=Sat
    const isWeekend = weekday === 0 || weekday === 6;
    const clinicOpen = isWeekend ? "10:00" : "09:00";
    const clinicClose = isWeekend ? "19:00" : "21:00";

    if (startTime < clinicOpen || endTime > clinicClose) {
      return res.status(400).json({
        error: "Schedule outside clinic hours",
        clinicOpen,
        clinicClose,
      });
    }

    const existing = await prisma.nurseSchedule.findFirst({
      where: { nurseId, branchId: bid, date: day },
    });

    let schedule;
    if (existing) {
      schedule = await prisma.nurseSchedule.update({
        where: { id: existing.id },
        data: {
          startTime,
          endTime,
          note: note || null,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
    } else {
      schedule = await prisma.nurseSchedule.create({
        data: {
          nurseId,
          branchId: bid,
          date: day,
          startTime,
          endTime,
          note: note || null,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
    }

    return res.status(existing ? 200 : 201).json({
      id: schedule.id,
      date: schedule.date.toISOString().slice(0, 10),
      branch: schedule.branch,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      note: schedule.note,
    });
  } catch (err) {
    console.error("POST /api/users/:id/nurse-schedule error:", err);
    return res.status(500).json({ error: "Failed to save nurse schedule" });
  }
});

/**
 * DELETE /api/users/:id/nurse-schedule/:scheduleId
 */
router.delete("/:id/nurse-schedule/:scheduleId", async (req, res) => {
  const nurseId = Number(req.params.id);
  const scheduleId = Number(req.params.scheduleId);

  if (!nurseId || Number.isNaN(nurseId)) {
    return res.status(400).json({ error: "Invalid nurse id" });
  }
  if (!scheduleId || Number.isNaN(scheduleId)) {
    return res.status(400).json({ error: "Invalid schedule id" });
  }

  try {
    const nurse = await ensureNurseOr404(nurseId, res);
    if (!nurse) return;

    const existing = await prisma.nurseSchedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, nurseId: true },
    });

    if (!existing || existing.nurseId !== nurseId) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    await prisma.nurseSchedule.delete({
      where: { id: scheduleId },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(
      "DELETE /api/users/:id/nurse-schedule/:scheduleId error:",
      err
    );
    return res
      .status(500)
      .json({ error: "Failed to delete nurse schedule" });
  }
});

/**
 * GET /api/users/:id
 * Returns a single user with:
 * - legacy branch
 * - branches[] via DoctorBranch
 */
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        branch: true,
        doctorBranches: {
          include: { branch: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.name,
      ovog: user.ovog,
      role: user.role,
      branchId: user.branchId,
      branch: user.branch
        ? { id: user.branch.id, name: user.branch.name }
        : null,
      regNo: user.regNo,
      phone: user.phone || null,
      licenseNumber: user.licenseNumber,
      licenseExpiryDate: user.licenseExpiryDate
        ? user.licenseExpiryDate.toISOString()
        : null,
      signatureImagePath: user.signatureImagePath,
      stampImagePath: user.stampImagePath,
      idPhotoPath: user.idPhotoPath,
      createdAt: user.createdAt.toISOString(),
      branches:
        user.doctorBranches?.map((db) => ({
          id: db.branch.id,
          name: db.branch.name,
        })) ?? [],
    });
  } catch (err) {
    console.error("GET /api/users/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/users/:id
 * Updates basic fields, still including legacy branchId.
 */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const {
      name,
      ovog,
      email,
      branchId,
      regNo,
      licenseNumber,
      licenseExpiryDate,
      phone,
      calendarOrder,
      idPhotoPath,
      signatureImagePath,
      stampImagePath,
    } = req.body || {};

    const data = {};

    if (name !== undefined) data.name = name || null;
    if (ovog !== undefined) data.ovog = ovog || null;
    if (email !== undefined) data.email = email || null;
    if (branchId !== undefined)
      data.branchId = branchId ? Number(branchId) : null;
    if (regNo !== undefined) data.regNo = regNo || null;
    if (phone !== undefined) data.phone = phone || null;
    if (licenseNumber !== undefined) data.licenseNumber = licenseNumber || null;
    if (licenseExpiryDate !== undefined) {
      data.licenseExpiryDate = licenseExpiryDate
        ? new Date(licenseExpiryDate)
        : null;
    }
    if (calendarOrder !== undefined) {
      if (calendarOrder === null || calendarOrder === "") {
        data.calendarOrder = null;
      } else {
        const order = Number(calendarOrder);
        if (Number.isNaN(order)) {
          return res.status(400).json({ error: "Invalid calendarOrder" });
        }
        data.calendarOrder = order;
      }
    }
    const toImagePath = (v) =>
      v === null || String(v).trim() === "" ? null : String(v).trim();
    if (idPhotoPath !== undefined) data.idPhotoPath = toImagePath(idPhotoPath);
    if (signatureImagePath !== undefined)
      data.signatureImagePath = toImagePath(signatureImagePath);
    if (stampImagePath !== undefined)
      data.stampImagePath = toImagePath(stampImagePath);

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: {
        branch: true,
        doctorBranches: {
          include: { branch: true },
        },
      },
    });

    return res.status(200).json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      ovog: updated.ovog,
      role: updated.role,
      branchId: updated.branchId,
      branch: updated.branch
        ? { id: updated.branch.id, name: updated.branch.name }
        : null,
      regNo: updated.regNo,
      phone: updated.phone || null,
      licenseNumber: updated.licenseNumber,
      licenseExpiryDate: updated.licenseExpiryDate
        ? updated.licenseExpiryDate.toISOString()
        : null,
      calendarOrder: updated.calendarOrder ?? null,
      signatureImagePath: updated.signatureImagePath,
      stampImagePath: updated.stampImagePath,
      idPhotoPath: updated.idPhotoPath,
      createdAt: updated.createdAt.toISOString(),
      branches:
        updated.doctorBranches?.map((db) => ({
          id: db.branch.id,
          name: db.branch.name,
        })) ?? [],
    });
  } catch (err) {
    console.error("PUT /api/users/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/users/:id
 * Deletes a user (any role).
 */
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    await prisma.user.delete({ where: { id } });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("DELETE /api/users/:id error:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

/**
 * PUT /api/users/:id/branches
 * Sets all branches for a user via DoctorBranch join table.
 */
router.put("/:id/branches", async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const { branchIds } = req.body || {};

  if (!Array.isArray(branchIds)) {
    return res
      .status(400)
      .json({ error: "branchIds must be an array of numbers" });
  }

  const uniqueBranchIds = [
    ...new Set(
      branchIds
        .map((b) => Number(b))
        .filter((b) => !Number.isNaN(b))
    ),
  ];

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (uniqueBranchIds.length > 0) {
      const existingBranches = await prisma.branch.findMany({
        where: { id: { in: uniqueBranchIds } },
        select: { id: true },
      });
      const existingIds = new Set(existingBranches.map((b) => b.id));
      const invalidIds = uniqueBranchIds.filter((id) => !existingIds.has(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: `Invalid branchIds: ${invalidIds.join(", ")}`,
        });
      }
    }

    await prisma.$transaction([
      prisma.doctorBranch.deleteMany({
        where: { doctorId: userId },
      }),
      ...(uniqueBranchIds.length
        ? [
            prisma.doctorBranch.createMany({
              data: uniqueBranchIds.map((branchId) => ({
                doctorId: userId,
                branchId,
              })),
            }),
          ]
        : []),
    ]);

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        doctorBranches: {
          include: { branch: true },
        },
      },
    });

    return res.json({
      id: updated.id,
      role: updated.role,
      branches:
        updated.doctorBranches?.map((db) => ({
          id: db.branch.id,
          name: db.branch.name,
        })) ?? [],
    });
  } catch (err) {
    console.error("PUT /api/users/:id/branches error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/users/:id/schedule
 * Query params:
 *   from=YYYY-MM-DD (optional, defaults to today)
 *   to=YYYY-MM-DD   (optional, defaults to from + 31 days)
 *   branchId=number (optional)
 *
 * Returns the doctor's schedule entries in the given range.
 */
router.get("/:id/schedule", async (req, res) => {
  const doctorId = Number(req.params.id);
  if (!doctorId || Number.isNaN(doctorId)) {
    return res.status(400).json({ error: "Invalid doctor id" });
  }

  try {
    const doctor = await ensureDoctorOr404(doctorId, res);
    if (!doctor) return;

    const { from, to, branchId } = req.query;

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

    const where = {
      doctorId,
      date: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (branchId) {
      const bid = Number(branchId);
      if (Number.isNaN(bid)) {
        return res.status(400).json({ error: "Invalid branchId" });
      }
      where.branchId = bid;
    }

    const schedules = await prisma.doctorSchedule.findMany({
      where,
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
    console.error("GET /api/users/:id/schedule error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch doctor schedule" });
  }
});

/**
 * POST /api/users/:id/schedule
 * Body:
 * {
 *   date: "YYYY-MM-DD",
 *   branchId: number,
 *   startTime: "HH:MM",
 *   endTime: "HH:MM",
 *   note?: string
 * }
 *
 * Creates or updates a schedule entry for the given doctor/branch/date.
 */
router.post("/:id/schedule", async (req, res) => {
  const doctorId = Number(req.params.id);
  if (!doctorId || Number.isNaN(doctorId)) {
    return res.status(400).json({ error: "Invalid doctor id" });
  }

  const { date, branchId, startTime, endTime, note } = req.body || {};

  if (!date || !branchId || !startTime || !endTime) {
    return res
      .status(400)
      .json({ error: "date, branchId, startTime, endTime are required" });
  }

  const day = new Date(date);
  if (Number.isNaN(day.getTime())) {
    return res.status(400).json({ error: "Invalid date" });
  }
  day.setHours(0, 0, 0, 0);

  const bid = Number(branchId);
  if (Number.isNaN(bid)) {
    return res.status(400).json({ error: "Invalid branchId" });
  }

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return res
      .status(400)
      .json({ error: "startTime and endTime must be HH:MM (24h)" });
  }

  if (startTime >= endTime) {
    return res
      .status(400)
      .json({ error: "startTime must be before endTime" });
  }

  try {
    const doctor = await ensureDoctorOr404(doctorId, res);
    if (!doctor) return;

    const branch = await prisma.branch.findUnique({
      where: { id: bid },
      select: { id: true, name: true },
    });
    if (!branch) {
      return res.status(400).json({ error: "Branch not found" });
    }

    const doctorBranch = await prisma.doctorBranch.findFirst({
      where: { doctorId, branchId: bid },
    });
    if (!doctorBranch) {
      return res.status(400).json({
        error: "Doctor is not assigned to this branch",
      });
    }

    const weekday = day.getDay(); // 0=Sun .. 6=Sat
    const isWeekend = weekday === 0 || weekday === 6;
    const clinicOpen = isWeekend ? "10:00" : "09:00";
    const clinicClose = isWeekend ? "19:00" : "21:00";

    if (startTime < clinicOpen || endTime > clinicClose) {
      return res.status(400).json({
        error: "Schedule outside clinic hours",
        clinicOpen,
        clinicClose,
      });
    }

    const existing = await prisma.doctorSchedule.findFirst({
      where: { doctorId, branchId: bid, date: day },
    });

    let schedule;
    if (existing) {
      schedule = await prisma.doctorSchedule.update({
        where: { id: existing.id },
        data: {
          startTime,
          endTime,
          note: note || null,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
    } else {
      schedule = await prisma.doctorSchedule.create({
        data: {
          doctorId,
          branchId: bid,
          date: day,
          startTime,
          endTime,
          note: note || null,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
    }

    return res.status(existing ? 200 : 201).json({
      id: schedule.id,
      date: schedule.date.toISOString().slice(0, 10),
      branch: schedule.branch,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      note: schedule.note,
    });
  } catch (err) {
    console.error("POST /api/users/:id/schedule error:", err);
    return res.status(500).json({ error: "Failed to save doctor schedule" });
  }
});

/**
 * DELETE /api/users/:id/schedule/:scheduleId
 * Deletes a schedule entry for this doctor.
 */
router.delete("/:id/schedule/:scheduleId", async (req, res) => {
  const doctorId = Number(req.params.id);
  const scheduleId = Number(req.params.scheduleId);

  if (!doctorId || Number.isNaN(doctorId)) {
    return res.status(400).json({ error: "Invalid doctor id" });
  }
  if (!scheduleId || Number.isNaN(scheduleId)) {
    return res.status(400).json({ error: "Invalid schedule id" });
  }

  try {
    const doctor = await ensureDoctorOr404(doctorId, res);
    if (!doctor) return;

    const existing = await prisma.doctorSchedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, doctorId: true },
    });

    if (!existing || existing.doctorId !== doctorId) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    await prisma.doctorSchedule.delete({
      where: { id: scheduleId },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(
      "DELETE /api/users/:id/schedule/:scheduleId error:",
      err
    );
    return res
      .status(500)
      .json({ error: "Failed to delete doctor schedule" });
  }
});

/**
 * GET /api/users/receptions/today
 *
 * Optional query:
 *   branchId=number  → filter by branch
 *
 * Returns:
 * {
 *   count: number,
 *   items: Array<{
 *     receptionId: number,
 *     name: string | null,
 *     ovog: string | null,
 *     email: string,
 *     phone: string | null,
 *     branches: { id: number, name: string }[],
 *     schedules: {
 *       id: number,
 *       branch: { id: number, name: string },
 *       date: string,        // YYYY-MM-DD
 *       startTime: string,   // HH:MM
 *       endTime: string,     // HH:MM
 *       note: string | null
 *     }[]
 *   }>
 * }
 *
 * Used by the Reception list top card: "өнөөдөр ажиллаж буй ресепшн".
 */
router.get("/receptions/today", async (req, res) => {
  try {
    const { branchId } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereSchedule = {
      date: today,
    };

    if (branchId) {
      const bid = Number(branchId);
      if (Number.isNaN(bid)) {
        return res.status(400).json({ error: "Invalid branchId" });
      }
      whereSchedule.branchId = bid;
    }

    // Find today's reception schedules (optionally filtered by branch)
    const schedules = await prisma.receptionSchedule.findMany({
      where: whereSchedule,
      include: {
        branch: { select: { id: true, name: true } },
        reception: {
          select: {
            id: true,
            email: true,
            name: true,
            ovog: true,
            phone: true,
          },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    if (!schedules.length) {
      return res.json({ count: 0, items: [] });
    }

    // Group by receptionId so frontend can show unique staff count
    const map = new Map();
    for (const s of schedules) {
      const key = s.receptionId;
      if (!map.has(key)) {
        map.set(key, {
          receptionId: s.receptionId,
          name: s.reception.name,
          ovog: s.reception.ovog,
          email: s.reception.email,
          phone: s.reception.phone || null,
          schedules: [],
        });
      }
      const entry = map.get(key);
      entry.schedules.push({
        id: s.id,
        branch: s.branch,
        date: s.date.toISOString().slice(0, 10),
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      });
    }

    const items = Array.from(map.values());

    return res.json({
      count: items.length,
      items,
    });
  } catch (err) {
    console.error("GET /api/users/receptions/today error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch today's receptions" });
  }
});

router.get("/nurses/today", async (req, res) => {
  try {
    const { branchId } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    const end = new Date(today);
    end.setDate(end.getDate() + 1);

    const whereSchedule = {
      date: {
        gte: start,
        lt: end,
      },
    };

    if (branchId) {
      const bid = Number(branchId);
      if (Number.isNaN(bid)) {
        return res.status(400).json({ error: "Invalid branchId" });
      }
      // plain JS assignment, no "as any"
      whereSchedule.branchId = bid;
    }

    const schedules = await prisma.nurseSchedule.findMany({
      where: whereSchedule,
      include: {
        branch: { select: { id: true, name: true } },
        nurse: {
          select: {
            id: true,
            email: true,
            name: true,
            ovog: true,
            phone: true,
          },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    if (!schedules.length) {
      return res.json({ count: 0, items: [] });
    }

    const map = new Map();
    for (const s of schedules) {
      if (!map.has(s.nurseId)) {
        map.set(s.nurseId, {
          nurseId: s.nurseId,
          name: s.nurse.name,
          ovog: s.nurse.ovog,
          email: s.nurse.email,
          phone: s.nurse.phone || null,
          schedules: [],
        });
      }
      const entry = map.get(s.nurseId);
      entry.schedules.push({
        id: s.id,
        branch: s.branch,
        date: s.date.toISOString().slice(0, 10),
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      });
    }

    const items = Array.from(map.values());
    return res.json({
      count: items.length,
      items,
    });
  } catch (err) {
    console.error("GET /api/users/nurses/today error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch today's nurses" });
  }
});
export default router;
