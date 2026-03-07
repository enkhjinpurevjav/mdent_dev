import express from "express";
import prisma from "../../db.js";

const router = express.Router();

// This should match what you already have in DB (image7)
const WHITENING_KEY = "finance.homeBleachingDeductAmountMnt";

async function loadWhiteningDeductAmountMnt() {
  const row = await prisma.settings.findFirst({
    where: { key: WHITENING_KEY },
    select: { value: true },
  });

  const n = Number(row?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function saveWhiteningDeductAmountMnt(valueNumber) {
  // value is TEXT in DB, so store as string
  const value = String(valueNumber);

  const existing = await prisma.settings.findFirst({
    where: { key: WHITENING_KEY },
    select: { id: true },
  });

  if (existing) {
    await prisma.settings.update({
      where: { id: existing.id },
      data: { value },
    });
  } else {
    await prisma.settings.create({
      data: { key: WHITENING_KEY, value },
    });
  }
}

/**
 * GET /api/admin/staff-income-settings
 */
router.get("/staff-income-settings", async (_req, res) => {
  try {
    const whiteningDeductAmountMnt = await loadWhiteningDeductAmountMnt();

    // If your role values are uppercase (DOCTOR), change here.
    const doctors = await prisma.user.findMany({
      where: { role: "doctor" },
      select: { id: true, ovog: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    const configs = await prisma.doctorCommissionConfig.findMany({
      select: {
        doctorId: true,
        orthoPct: true,
        defectPct: true,
        surgeryPct: true,
        generalPct: true,
        imagingPct: true,
        monthlyGoalAmountMnt: true,
        updatedAt: true,
      },
    });

    const cfgByDoctorId = new Map(configs.map((c) => [c.doctorId, c]));

    const rows = doctors.map((d) => {
      const cfg = cfgByDoctorId.get(d.id);
      return {
        doctorId: d.id,
        ovog: d.ovog ?? null,
        name: d.name ?? null,
        email: d.email ?? null,

        orthoPct: Number(cfg?.orthoPct ?? 0),
        defectPct: Number(cfg?.defectPct ?? 0),
        surgeryPct: Number(cfg?.surgeryPct ?? 0),
        generalPct: Number(cfg?.generalPct ?? 0),
        imagingPct: Number(cfg?.imagingPct ?? 0),

        monthlyGoalAmountMnt: Number(cfg?.monthlyGoalAmountMnt ?? 0),
        configUpdatedAt: cfg?.updatedAt ?? null,
      };
    });

    // Load nurses with their commission configs
    const nurseUsers = await prisma.user.findMany({
      where: { role: "nurse" },
      select: { id: true, ovog: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    const nurseConfigs = await prisma.nurseCommissionConfig.findMany({
      select: { nurseId: true, imagingPct: true, updatedAt: true },
    });
    const nurseCfgByNurseId = new Map(nurseConfigs.map((c) => [c.nurseId, c]));

    const nurseRows = nurseUsers.map((n) => {
      const cfg = nurseCfgByNurseId.get(n.id);
      return {
        nurseId: n.id,
        ovog: n.ovog ?? null,
        name: n.name ?? null,
        email: n.email ?? null,
        imagingPct: Number(cfg?.imagingPct ?? 0),
        configUpdatedAt: cfg?.updatedAt ?? null,
      };
    });

    return res.json({
      whiteningDeductAmountMnt,
      doctors: rows,
      nurses: nurseRows,
    });
  } catch (e) {
    console.error("Failed to load staff income settings", e);
    return res.status(500).json({ error: e?.message || "Failed to load staff income settings" });
  }
});

/**
 * PUT /api/admin/staff-income-settings
 */
router.put("/staff-income-settings", async (req, res) => {
  try {
    const body = req.body || {};
    const whitening = Number(body.whiteningDeductAmountMnt ?? 0);
    const doctors = Array.isArray(body.doctors) ? body.doctors : [];
    const nurses = Array.isArray(body.nurses) ? body.nurses : [];

    if (!Number.isFinite(whitening) || whitening < 0) {
      return res.status(400).json({ error: "whiteningDeductAmountMnt must be >= 0" });
    }

    // Persist whitening to Settings table
    await saveWhiteningDeductAmountMnt(whitening);

    // Persist doctors configs
    for (const d of doctors) {
      const doctorId = Number(d.doctorId);
      if (!doctorId || !Number.isFinite(doctorId)) continue;

      const orthoPct = Number(d.orthoPct ?? 0);
      const defectPct = Number(d.defectPct ?? 0);
      const surgeryPct = Number(d.surgeryPct ?? 0);
      const generalPct = Number(d.generalPct ?? 0);
      const imagingPct = Number(d.imagingPct ?? 0);
      const monthlyGoalAmountMnt = Number(d.monthlyGoalAmountMnt ?? 0);

      const pcts = [orthoPct, defectPct, surgeryPct, generalPct, imagingPct];
      if (pcts.some((x) => !Number.isFinite(x) || x < 0)) {
        return res.status(400).json({ error: "Percent values must be >= 0 numbers" });
      }
      if (!Number.isFinite(monthlyGoalAmountMnt) || monthlyGoalAmountMnt < 0) {
        return res.status(400).json({ error: "monthlyGoalAmountMnt must be >= 0" });
      }

      await prisma.doctorCommissionConfig.upsert({
        where: { doctorId },
        update: { orthoPct, defectPct, surgeryPct, generalPct, imagingPct, monthlyGoalAmountMnt },
        create: { doctorId, orthoPct, defectPct, surgeryPct, generalPct, imagingPct, monthlyGoalAmountMnt },
      });
    }

    // Persist nurses configs
    for (const n of nurses) {
      const nurseId = Number(n.nurseId);
      if (!nurseId || !Number.isFinite(nurseId)) continue;

      const imagingPct = Number(n.imagingPct ?? 0);
      if (!Number.isFinite(imagingPct) || imagingPct < 0) {
        return res.status(400).json({ error: "imagingPct must be >= 0" });
      }

      await prisma.nurseCommissionConfig.upsert({
        where: { nurseId },
        update: { imagingPct },
        create: { nurseId, imagingPct },
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("Failed to save staff income settings", e);
    return res.status(500).json({ error: e?.message || "Failed to save staff income settings" });
  }
});

export default router;
