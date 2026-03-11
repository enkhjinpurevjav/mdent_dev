import { Router } from "express";
import prisma from "../db.js";

const router = Router();

const VALID_CATEGORIES = [
  "ORTHODONTIC_TREATMENT",
  "IMAGING",
  "DEFECT_CORRECTION",
  "ADULT_TREATMENT",
  "WHITENING",
  "CHILD_TREATMENT",
  "SURGERY",
  "PREVIOUS",
];

const DEFAULT_DURATION = 30;

/**
 * GET /api/service-category-settings
 * Returns all categories with their durationMinutes.
 * Categories without a DB row default to 30.
 */
router.get("/", async (_req, res) => {
  try {
    const rows = await prisma.serviceCategoryConfig.findMany();

    const byCategory = Object.fromEntries(
      rows.map((r) => [r.category, r.durationMinutes])
    );

    const result = VALID_CATEGORIES.map((category) => ({
      category,
      durationMinutes: byCategory[category] ?? DEFAULT_DURATION,
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /api/service-category-settings error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});

/**
 * PUT /api/service-category-settings/:category
 * Body: { durationMinutes: number }
 * Validates: integer, minimum 30.
 * Upserts by category.
 */
router.put("/:category", async (req, res) => {
  try {
    const { category } = req.params;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const { durationMinutes } = req.body || {};
    const durationValue = Number(durationMinutes);

    if (
      durationMinutes === undefined ||
      !Number.isInteger(durationValue) ||
      durationValue < DEFAULT_DURATION
    ) {
      return res.status(400).json({
        error: `durationMinutes must be an integer >= ${DEFAULT_DURATION}`,
      });
    }

    const updated = await prisma.serviceCategoryConfig.upsert({
      where: { category },
      update: { durationMinutes: durationValue },
      create: { category, durationMinutes: durationValue },
    });

    res.json(updated);
  } catch (err) {
    console.error("PUT /api/service-category-settings/:category error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});

export default router;
