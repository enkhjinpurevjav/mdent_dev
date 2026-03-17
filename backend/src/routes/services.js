import { Router } from "express";
import prisma from "../db.js";
import { generateNextServiceCode } from "../utils/serviceCode.js";

const router = Router();

/**
 * GET /api/services
 * Query params:
 *  - branchId: number (optional)
 *  - category: string (ServiceCategory enum, optional)
 *  - onlyActive: "true" to filter only active services
 *  - q: string (optional) search by name or code (case-insensitive contains)
 *  - limit: number (optional) max results (default 20, max 50); only applied when q is present
 */
router.get("/", async (req, res) => {
  try {
    const { branchId, category, onlyActive, q, limit } = req.query;

    const where = {};

    if (category && typeof category === "string") {
      // must match enum ServiceCategory in Prisma
      where.category = category;
    }

    if (onlyActive === "true") {
      where.isActive = true;
    }

    if (branchId) {
      where.serviceBranches = {
        some: { branchId: Number(branchId) },
      };
    }

    if (q && typeof q === "string" && q.trim()) {
      const query = q.trim();
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { code: { contains: query, mode: "insensitive" } },
      ];
    }

    // Apply limit only for search queries; full list uses no limit
    const hasQuery = q && typeof q === "string" && q.trim();
    const takeRaw = hasQuery ? Number(limit || 15) : undefined;
    const take =
      takeRaw !== undefined && Number.isFinite(takeRaw)
        ? Math.min(Math.max(takeRaw, 1), 50)
        : undefined;

    const services = await prisma.service.findMany({
      where,
      ...(take !== undefined ? { take } : {}),
      include: {
        serviceBranches: {
          include: { branch: true },
        },
      },
      orderBy: hasQuery ? [{ name: "asc" }] : [{ category: "asc" }, { name: "asc" }],
    });

    res.json(services);
  } catch (err) {
    console.error("GET /api/services error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});

/**
 * POST /api/services
 * Body:
 *  - name (string, required)
 *  - price (number, required)
 *  - category (ServiceCategory, required)
 *  - description (string, optional)
 *  - branchIds (number[], required, at least one)
 *  - code (string, optional; if empty, auto-generated)
 *  - isActive (boolean, optional; default true)
 */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      price,
      category,
      description,
      branchIds,
      code,
      isActive,
    } = req.body || {};

    if (!name || price === undefined || !category) {
      return res
        .status(400)
        .json({ error: "name, price, category are required" });
    }

    if (!Array.isArray(branchIds)) {
      return res
        .status(400)
        .json({ error: "branchIds must be an array of branch ids" });
    }

    if (branchIds.length === 0) {
      return res
        .status(400)
        .json({ error: "at least one branchId is required" });
    }

    let serviceCode = null;
    if (typeof code === "string" && code.trim()) {
      serviceCode = code.trim();
    } else {
      serviceCode = await generateNextServiceCode();
    }

    const created = await prisma.service.create({
      data: {
        name,
        price: Number(price),
        category,
        description: description || null,
        code: serviceCode,
        isActive: typeof isActive === "boolean" ? isActive : true,
        serviceBranches: {
          create: branchIds.map((bid) => ({
            branchId: Number(bid),
          })),
        },
      },
      include: {
        serviceBranches: {
          include: { branch: true },
        },
      },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("POST /api/services error:", err);
    if (err.code === "P2002") {
      // unique constraint, likely on code
      return res.status(400).json({ error: "Service code must be unique" });
    }
    res.status(500).json({ error: "internal server error" });
  }
});

/**
 * PUT /api/services/:id
 * Body (all fields optional; only provided ones will update):
 *  - name (string)
 *  - price (number)
 *  - category (ServiceCategory)
 *  - description (string | null)
 *  - code (string | null)
 *  - isActive (boolean)
 *  - branchIds (number[])  -> replaces all ServiceBranch rows for this service
 */
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid service id" });
    }

    const {
      name,
      price,
      category,
      description,
      code,
      isActive,
      branchIds,
    } = req.body || {};

    const existing = await prisma.service.findUnique({
      where: { id },
      include: { serviceBranches: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Service not found" });
    }

    const data = {};

    if (typeof name === "string") data.name = name;
    if (price !== undefined) data.price = Number(price);
    if (typeof category === "string") data.category = category;
    if (description !== undefined) data.description = description || null;
    if (code !== undefined) data.code = code || null;
    if (typeof isActive === "boolean") data.isActive = isActive;

    if (Array.isArray(branchIds)) {
      // full replace of junction table entries
      data.serviceBranches = {
        deleteMany: {},
        create: branchIds.map((bid) => ({
          branchId: Number(bid),
        })),
      };
    }

    const updated = await prisma.service.update({
      where: { id },
      data,
      include: {
        serviceBranches: {
          include: { branch: true },
        },
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("PUT /api/services/:id error:", err);
    if (err.code === "P2002") {
      // unique constraint, likely on code
      return res.status(400).json({ error: "Service code must be unique" });
    }
    res.status(500).json({ error: "internal server error" });
  }
});

/**
 * DELETE /api/services/:id
 * Deletes the service and its ServiceBranch rows.
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid service id" });
    }

    const existing = await prisma.service.findUnique({
      where: { id },
      include: { serviceBranches: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Service not found" });
    }

    // Delete junction rows first because of composite PK on ServiceBranch
    await prisma.serviceBranch.deleteMany({
      where: { serviceId: id },
    });

    await prisma.service.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/services/:id error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});


export default router;
