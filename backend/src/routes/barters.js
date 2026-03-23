import express from "express";
import prisma from "../db.js";

const router = express.Router();

/**
 * =========================
 * ADMIN: Barter management page
 * =========================
 * Endpoints (mounted at /api/admin):
 * - GET    /barters          -> list all barters
 * - POST   /barters          -> create new barter
 * - PATCH  /barters/:id      -> update barter
 * - DELETE /barters/:id      -> deactivate barter
 *
 * Billing endpoints (mounted at /api/billing):
 * - POST   /barter/verify    -> verify barter code
 */

/**
 * GET /api/admin/barters
 */
router.get("/barters", async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const barters = await prisma.barter.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return res.json({ barters });
  } catch (e) {
    console.error("Failed to load barters", e);
    return res.status(500).json({ error: "Failed to load barters" });
  }
});

/**
 * POST /api/admin/barters
 * Body: { name, code, limitAmount }
 */
router.post("/barters", async (req, res) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const limitAmount = Number(body.limitAmount);

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!code) return res.status(400).json({ error: "code is required" });
    if (!Number.isFinite(limitAmount) || limitAmount <= 0) {
      return res.status(400).json({ error: "limitAmount must be > 0" });
    }

    const existingCode = await prisma.barter.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingCode) {
      return res.status(409).json({ error: "Энэ код аль хэдийн бүртгэгдсэн байна." });
    }

    const created = await prisma.barter.create({
      data: {
        name,
        code,
        limitAmount,
        spentAmount: 0,
        remainingAmount: limitAmount,
        isActive: true,
      },
      select: { id: true },
    });

    return res.json({ ok: true, barterId: created.id });
  } catch (e) {
    console.error("Failed to create barter", e);
    return res.status(500).json({ error: "Failed to create barter" });
  }
});

/**
 * PATCH /api/admin/barters/:id
 * Body: { name, code, limitAmount, spentAmount, remainingAmount, isActive }
 */
router.patch("/barters/:id", async (req, res) => {
  try {
    const barterId = Number(req.params.id);
    if (!barterId || !Number.isFinite(barterId)) {
      return res.status(400).json({ error: "Invalid barterId" });
    }

    const existing = await prisma.barter.findUnique({
      where: { id: barterId },
      include: { usages: { select: { id: true }, take: 1 } },
    });
    if (!existing) {
      return res.status(404).json({ error: "Barter not found" });
    }

    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : existing.name;
    const code = typeof body.code === "string" ? body.code.trim() : existing.code;
    const limitAmount = body.limitAmount !== undefined ? Number(body.limitAmount) : existing.limitAmount;
    const spentAmount = body.spentAmount !== undefined ? Number(body.spentAmount) : existing.spentAmount;
    const remainingAmount = body.remainingAmount !== undefined ? Number(body.remainingAmount) : existing.remainingAmount;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : existing.isActive;

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!code) return res.status(400).json({ error: "code is required" });
    if (!Number.isFinite(limitAmount) || limitAmount <= 0) {
      return res.status(400).json({ error: "limitAmount must be > 0" });
    }
    if (!Number.isFinite(spentAmount) || spentAmount < 0) {
      return res.status(400).json({ error: "spentAmount must be >= 0" });
    }
    if (!Number.isFinite(remainingAmount) || remainingAmount < 0) {
      return res.status(400).json({ error: "remainingAmount must be >= 0" });
    }
    if (remainingAmount > limitAmount) {
      return res.status(400).json({ error: "remainingAmount cannot exceed limitAmount" });
    }

    // Prevent changing code if barter has been used
    const hasUsages = existing.usages.length > 0;
    const codeChanged = code.toLowerCase() !== existing.code.toLowerCase();
    if (hasUsages && codeChanged) {
      return res.status(409).json({
        error: "Ашиглагдсан бартерийн кодыг өөрчлөх боломжгүй.",
      });
    }

    // Ensure code uniqueness (case-insensitive)
    if (codeChanged) {
      const dup = await prisma.barter.findFirst({
        where: { code: { equals: code, mode: "insensitive" }, NOT: { id: barterId } },
        select: { id: true },
      });
      if (dup) {
        return res.status(409).json({ error: "Энэ код өөр бартерт бүртгэгдсэн байна." });
      }
    }

    const updated = await prisma.barter.update({
      where: { id: barterId },
      data: { name, code, limitAmount, spentAmount, remainingAmount, isActive },
      select: { id: true },
    });

    return res.json({ ok: true, barterId: updated.id });
  } catch (e) {
    console.error("Failed to update barter", e);
    return res.status(500).json({ error: "Failed to update barter" });
  }
});

/**
 * DELETE /api/admin/barters/:id
 * Deactivates the barter.
 */
router.delete("/barters/:id", async (req, res) => {
  try {
    const barterId = Number(req.params.id);
    if (!barterId || !Number.isFinite(barterId)) {
      return res.status(400).json({ error: "Invalid barterId" });
    }

    await prisma.barter.update({
      where: { id: barterId },
      data: { isActive: false },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("Failed to deactivate barter", e);
    return res.status(500).json({ error: "Failed to deactivate barter" });
  }
});

/**
 * =========================
 * BILLING: verify barter code
 * =========================
 * POST /api/billing/barter/verify
 * Body: { code }
 * Response: { barterId, name, limitAmount, spentAmount, remainingAmount }
 */
router.post("/barter/verify", async (req, res) => {
  const body = req.body || {};
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!code) {
    return res.status(400).json({ error: "Бартерийн кодыг оруулна уу." });
  }

  try {
    const barter = await prisma.barter.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
    });

    if (!barter) {
      return res.status(404).json({ error: "Бартерийн код олдсонгүй." });
    }

    if (!barter.isActive) {
      return res.status(400).json({ error: "Энэ бартер идэвхгүй байна." });
    }

    if (barter.remainingAmount <= 0) {
      return res.status(400).json({ error: "Бартерийн лимит дууссан байна." });
    }

    return res.json({
      barterId: barter.id,
      name: barter.name,
      limitAmount: barter.limitAmount,
      spentAmount: barter.spentAmount,
      remainingAmount: barter.remainingAmount,
    });
  } catch (e) {
    console.error("Failed to verify barter code", e);
    return res.status(500).json({ error: "Бартер шалгахад алдаа гарлаа." });
  }
});

export default router;
