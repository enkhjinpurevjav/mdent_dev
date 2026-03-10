import express from "express";
import prisma from "../../db.js";
import {
  discountPercentEnumToNumber,
  computeServiceNetProportionalDiscount,
  allocatePaymentProportionalByRemaining,
} from "../../utils/incomeHelpers.js";

const router = express.Router();

// Payment method rules
const INCLUDED_METHODS = new Set([
  "CASH",
  "POS",
  "TRANSFER",
  "QPAY",
  "WALLET",
  "VOUCHER",
  "OTHER", // when active -> treated as CASH
]);

const EXCLUDED_METHODS = new Set(["EMPLOYEE_BENEFIT"]);

const OVERRIDE_METHODS = new Set(["INSURANCE", "APPLICATION"]);

// Home bleaching: Service.code === 151
const HOME_BLEACHING_SERVICE_CODE = 151;

function inRange(ts, start, end) {
  return ts >= start && ts < end;
}

function bucketKeyForService(service) {
  if (!service) return "GENERAL";
  if (service.category === "IMAGING") return "IMAGING";
  if (service.category === "ORTHODONTIC_TREATMENT") return "ORTHODONTIC_TREATMENT";
  if (service.category === "DEFECT_CORRECTION") return "DEFECT_CORRECTION";
  if (service.category === "SURGERY") return "SURGERY";
  return "GENERAL";
}

router.get("/doctors-income", async (req, res) => {
  const { startDate, endDate, branchId } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required parameters." });
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  try {
    // Settings: home bleaching deduction amount
    const homeBleachingDeductSetting = await prisma.settings.findUnique({
      where: { key: "finance.homeBleachingDeductAmountMnt" },
    });
    const homeBleachingDeductAmountMnt = Number(homeBleachingDeductSetting?.value || 0) || 0;

    const invoices = await prisma.invoice.findMany({
      where: {
        ...(branchId ? { branchId: Number(branchId) } : {}),
        OR: [
          { createdAt: { gte: start, lt: endExclusive } },
          { payments: { some: { timestamp: { gte: start, lt: endExclusive } } } },
        ],
      },
      include: {
        encounter: {
          include: {
            doctor: {
              include: {
                branch: true,
                commissionConfig: true,
              },
            },
          },
        },
        items: {
          include: {
            service: true,
          },
        },
        payments: {
          include: {
            allocations: { select: { invoiceItemId: true, amount: true } },
          },
        },
      },
    });

    const byDoctor = new Map();

    for (const inv of invoices) {
      const doctor = inv.encounter?.doctor;
      if (!doctor) continue;

      const cfg = doctor.commissionConfig;
      const doctorId = doctor.id;

      if (!byDoctor.has(doctorId)) {
        byDoctor.set(doctorId, {
          doctorId,
          doctorName: doctor.name,
          doctorOvog: doctor.ovog ?? null,
          branchName: doctor.branch?.name,

          // ✅ date-only strings (no time)
          startDate: String(startDate),
          endDate: String(endDate),

          doctorSalesMnt: 0,
          doctorIncomeMnt: 0,
          monthlyGoalAmountMnt: Number(cfg?.monthlyGoalAmountMnt || 0),
        });
      }

      const acc = byDoctor.get(doctorId);

      const payments = inv.payments || [];
      const hasOverride = payments.some((p) => OVERRIDE_METHODS.has(String(p.method).toUpperCase()));

      // ---------- per-line nets via proportional discount per service line ----------
      const discountPct = discountPercentEnumToNumber(inv.discountPercent);
      const serviceItems = (inv.items || []).filter(
        (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
      );
      const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);

      // Non-IMAGING items used for sales (IMAGING is excluded from doctorSalesMnt)
      const nonImagingServiceItems = serviceItems.filter(
        (it) => it.service?.category !== "IMAGING"
      );

      const totalNonImagingNet = nonImagingServiceItems.reduce(
        (sum, it) => sum + (lineNets.get(it.id) || 0),
        0
      );
      const totalAllServiceNet = serviceItems.reduce(
        (sum, it) => sum + (lineNets.get(it.id) || 0),
        0
      );
      // Ratio used to allocate BARTER excess proportionally across non-IMAGING lines
      const nonImagingRatio = totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;

      // ---------- Single payment pass: proportional allocation by remaining due ----------
      // itemById and serviceLineIds used in both SALES and INCOME sections below
      const itemById = new Map(serviceItems.map((it) => [it.id, it]));
      const serviceLineIds = serviceItems.map((it) => it.id);

      // remainingDue tracks outstanding amount per line (initialised to net after discount).
      // It is mutated by allocatePaymentProportionalByRemaining so later payments only
      // allocate to still-unpaid portions.
      const remainingDue = new Map(serviceItems.map((it) => [it.id, lineNets.get(it.id) || 0]));

      // itemAllocationBase accumulates the pre-feeMultiplier payment allocation per line.
      const itemAllocationBase = new Map(serviceItems.map((it) => [it.id, 0]));

      let barterSum = 0;

      // Process payments in timestamp order for deterministic remaining-due tracking.
      const sortedPayments = [...payments].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      for (const p of sortedPayments) {
        const method = String(p.method || "").toUpperCase();
        const ts = new Date(p.timestamp);
        if (!inRange(ts, start, endExclusive)) continue;
        if (EXCLUDED_METHODS.has(method)) continue;

        if (method === "BARTER") {
          barterSum += Number(p.amount || 0);
          continue;
        }

        if (!INCLUDED_METHODS.has(method) && !OVERRIDE_METHODS.has(method)) continue;

        const payAmt = Number(p.amount || 0);
        const payAllocs = p.allocations || [];

        if (payAllocs.length > 0) {
          // Use explicit allocations; update remainingDue for subsequent payments.
          for (const alloc of payAllocs) {
            const item = itemById.get(alloc.invoiceItemId);
            if (!item) continue;
            const allocAmt = Number(alloc.amount || 0);
            itemAllocationBase.set(item.id, (itemAllocationBase.get(item.id) || 0) + allocAmt);
            remainingDue.set(item.id, Math.max(0, (remainingDue.get(item.id) || 0) - allocAmt));
          }
        } else {
          // Proportional allocation by remaining due across all service lines (mutates remainingDue).
          const allocs = allocatePaymentProportionalByRemaining(payAmt, serviceLineIds, remainingDue);
          for (const [id, amt] of allocs) {
            itemAllocationBase.set(id, (itemAllocationBase.get(id) || 0) + amt);
          }
        }
      }

      // ---------- SALES (exclude IMAGING) ----------
      if (hasOverride) {
        // Override invoices: invoice-level sales contribution when paid.
        const status = String(inv.statusLegacy || "").toLowerCase();
        if (status === "paid") {
          acc.doctorSalesMnt += totalNonImagingNet * 0.9;
        }
      } else {
        // Sum proportional allocations for non-IMAGING lines.
        let salesFromIncluded = 0;
        for (const it of nonImagingServiceItems) {
          salesFromIncluded += itemAllocationBase.get(it.id) || 0;
        }

        // BARTER excess contributes to sales (proportional to non-imaging share of lineNets).
        const barterExcess = Math.max(0, barterSum - 800000);
        const barterIncluded = barterExcess * nonImagingRatio;
        acc.doctorSalesMnt += salesFromIncluded + barterIncluded;

        // Barter excess also contributes to income via generalPct.
        const generalPct = Number(cfg?.generalPct || 0);
        acc.doctorIncomeMnt += barterIncluded * (generalPct / 100);
      }

      // ---------- INCOME ----------
      {
        const orthoPct = Number(cfg?.orthoPct || 0);
        const defectPct = Number(cfg?.defectPct || 0);
        const surgeryPct = Number(cfg?.surgeryPct || 0);
        const generalPct = Number(cfg?.generalPct || 0);
        const imagingPct = Number(cfg?.imagingPct || 0);
        const feeMultiplier = hasOverride ? 0.9 : 1;

        for (const it of serviceItems) {
          const service = it.service;
          const lineNet = (itemAllocationBase.get(it.id) || 0) * feeMultiplier;
          if (lineNet <= 0) continue;

          if (service?.category === "IMAGING") {
            // Only credit doctor when explicitly assignedTo=DOCTOR.
            if (it.meta?.assignedTo === "DOCTOR") {
              acc.doctorIncomeMnt += lineNet * (imagingPct / 100);
            }
            continue;
          }

          if (Number(it.service?.code) === HOME_BLEACHING_SERVICE_CODE) {
            // Deduct material cost before applying generalPct.
            const base = Math.max(0, lineNet - homeBleachingDeductAmountMnt);
            acc.doctorIncomeMnt += base * (generalPct / 100);
            continue;
          }

          let pct = generalPct;
          if (service?.category === "ORTHODONTIC_TREATMENT") pct = orthoPct;
          else if (service?.category === "DEFECT_CORRECTION") pct = defectPct;
          else if (service?.category === "SURGERY") pct = surgeryPct;

          acc.doctorIncomeMnt += lineNet * (pct / 100);
        }
      }
    }

    const doctors = Array.from(byDoctor.values()).map((d) => {
      const goal = Number(d.monthlyGoalAmountMnt || 0);
      const sales = Number(d.doctorSalesMnt || 0);

      return {
        doctorId: d.doctorId,
        doctorName: d.doctorName,
        doctorOvog: d.doctorOvog,
        branchName: d.branchName,
        startDate: d.startDate,
        endDate: d.endDate,

        // Keeping legacy response keys so frontend works without changes:
        revenue: Math.round(sales),
        commission: Math.round(d.doctorIncomeMnt),
        monthlyGoal: Math.round(goal),
        progressPercent: goal > 0 ? Math.round((sales / goal) * 10000) / 100 : 0,
      };
    });

    if (!doctors.length) return res.status(404).json({ error: "No income data found." });
    return res.json(doctors);
  } catch (error) {
    console.error("Error in fetching doctor incomes:", error);
    return res.status(500).json({ error: "Failed to fetch doctor incomes." });
  }
});

router.get("/doctors-income/:doctorId/details", async (req, res) => {
  const { doctorId } = req.params;
  const { startDate, endDate } = req.query;

  if (!doctorId || !startDate || !endDate) {
    return res.status(400).json({
      error: "doctorId, startDate, and endDate are required parameters.",
    });
  }

  const start = new Date(`${String(startDate)}T00:00:00.000Z`);
  const endExclusive = new Date(`${String(endDate)}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const DOCTOR_ID = Number(doctorId);

  const LABELS = {
    IMAGING: "Зураг авах",
    ORTHODONTIC_TREATMENT: "Гажиг заслын эмчилгээ",
    DEFECT_CORRECTION: "Согог засал",
    SURGERY: "Мэс засал",
    GENERAL: "Ерөнхий",
    BARTER_EXCESS: "Бартер (800,000₮-с дээш)",
  };

  function initBuckets(cfg) {
    return {
      // IMAGING: uses imagingPct when assignedTo=DOCTOR
      IMAGING: { key: "IMAGING", label: LABELS.IMAGING, salesMnt: 0, incomeMnt: 0, pctUsed: Number(cfg?.imagingPct || 0) },
      ORTHODONTIC_TREATMENT: {
        key: "ORTHODONTIC_TREATMENT",
        label: LABELS.ORTHODONTIC_TREATMENT,
        salesMnt: 0,
        incomeMnt: 0,
        pctUsed: Number(cfg?.orthoPct || 0),
      },
      DEFECT_CORRECTION: {
        key: "DEFECT_CORRECTION",
        label: LABELS.DEFECT_CORRECTION,
        salesMnt: 0,
        incomeMnt: 0,
        pctUsed: Number(cfg?.defectPct || 0),
      },
      SURGERY: {
        key: "SURGERY",
        label: LABELS.SURGERY,
        salesMnt: 0,
        incomeMnt: 0,
        pctUsed: Number(cfg?.surgeryPct || 0),
      },
      GENERAL: {
        key: "GENERAL",
        label: LABELS.GENERAL,
        salesMnt: 0,
        incomeMnt: 0,
        pctUsed: Number(cfg?.generalPct || 0),
      },
      BARTER_EXCESS: {
        key: "BARTER_EXCESS",
        label: LABELS.BARTER_EXCESS,
        salesMnt: 0,
        incomeMnt: 0,
        pctUsed: Number(cfg?.generalPct || 0),
      },
    };
  }

  try {
    // Settings: home bleaching deduction amount
    const homeBleachingDeductSetting = await prisma.settings.findUnique({
      where: { key: "finance.homeBleachingDeductAmountMnt" },
    });
    const homeBleachingDeductAmountMnt = Number(homeBleachingDeductSetting?.value || 0) || 0;

    const invoices = await prisma.invoice.findMany({
      where: {
        encounter: { doctorId: DOCTOR_ID },
        OR: [
          { createdAt: { gte: start, lt: endExclusive } },
          { payments: { some: { timestamp: { gte: start, lt: endExclusive } } } },
        ],
      },
      include: {
        encounter: {
          include: {
            doctor: {
              include: {
                commissionConfig: true,
              },
            },
          },
        },
        items: {
          include: {
            service: true,
          },
        },
        payments: {
          include: {
            allocations: { select: { invoiceItemId: true, amount: true } },
          },
        },
      },
    });

    const cfg = invoices?.[0]?.encounter?.doctor?.commissionConfig || null;
    const buckets = initBuckets(cfg);

    let totalSalesMnt = 0;
    let totalIncomeMnt = 0;

    for (const inv of invoices) {
      const payments = inv.payments || [];
      const hasOverride = payments.some((p) => OVERRIDE_METHODS.has(String(p.method).toUpperCase()));

      const status = String(inv.statusLegacy || "").toLowerCase();
      const isPaid = status === "paid";

      // ---------- per-line nets via proportional discount per service line ----------
      const discountPct = discountPercentEnumToNumber(inv.discountPercent);
      const serviceItems = (inv.items || []).filter(
        (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
      );
      if (!serviceItems.length) continue;

      const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);

      // Non-IMAGING items used for sales (IMAGING excluded from doctorSalesMnt)
      const nonImagingServiceItems = serviceItems.filter(
        (it) => it.service?.category !== "IMAGING"
      );

      const totalAllServiceNet = serviceItems.reduce(
        (sum, it) => sum + (lineNets.get(it.id) || 0),
        0
      );
      const totalNonImagingNet = nonImagingServiceItems.reduce(
        (sum, it) => sum + (lineNets.get(it.id) || 0),
        0
      );
      // Ratio used to allocate BARTER excess proportionally across non-IMAGING lines
      const nonImagingRatio = totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;

      // ---------- Single payment pass: proportional allocation by remaining due ----------
      const itemById = new Map(serviceItems.map((it) => [it.id, it]));
      const serviceLineIds = serviceItems.map((it) => it.id);

      const remainingDue = new Map(serviceItems.map((it) => [it.id, lineNets.get(it.id) || 0]));
      const itemAllocationBase = new Map(serviceItems.map((it) => [it.id, 0]));

      let barterSum = 0;

      const sortedPayments = [...payments].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      for (const p of sortedPayments) {
        const method = String(p.method || "").toUpperCase();
        const ts = new Date(p.timestamp);
        if (!inRange(ts, start, endExclusive)) continue;
        if (EXCLUDED_METHODS.has(method)) continue;

        if (method === "BARTER") {
          barterSum += Number(p.amount || 0);
          continue;
        }

        if (!INCLUDED_METHODS.has(method) && !OVERRIDE_METHODS.has(method)) continue;

        const payAmt = Number(p.amount || 0);
        const payAllocs = p.allocations || [];

        if (payAllocs.length > 0) {
          // Use explicit allocations; update remainingDue for subsequent payments.
          for (const alloc of payAllocs) {
            const item = itemById.get(alloc.invoiceItemId);
            if (!item) continue;
            const allocAmt = Number(alloc.amount || 0);
            itemAllocationBase.set(item.id, (itemAllocationBase.get(item.id) || 0) + allocAmt);
            remainingDue.set(item.id, Math.max(0, (remainingDue.get(item.id) || 0) - allocAmt));
          }
        } else {
          // Proportional allocation by remaining due across all service lines (mutates remainingDue).
          const allocs = allocatePaymentProportionalByRemaining(payAmt, serviceLineIds, remainingDue);
          for (const [id, amt] of allocs) {
            itemAllocationBase.set(id, (itemAllocationBase.get(id) || 0) + amt);
          }
        }
      }

      // ---------- SALES (exclude IMAGING) ----------
      if (hasOverride) {
        if (isPaid && inv.createdAt >= start && inv.createdAt < endExclusive) {
          // Per-item lineNet * 0.9 allocated to each non-IMAGING category bucket.
          for (const it of nonImagingServiceItems) {
            const lineNet = lineNets.get(it.id) || 0;
            if (lineNet <= 0) continue;
            const amt = lineNet * 0.9;
            const k = bucketKeyForService(it.service);
            buckets[k].salesMnt += amt;
            totalSalesMnt += amt;
          }
        }
      } else {
        // Sum equal-split allocations for non-IMAGING lines into their category buckets.
        for (const it of nonImagingServiceItems) {
          const amt = itemAllocationBase.get(it.id) || 0;
          if (amt <= 0) continue;
          const k = bucketKeyForService(it.service);
          buckets[k].salesMnt += amt;
          totalSalesMnt += amt;
        }

        // BARTER excess → BARTER_EXCESS bucket (proportional to non-imaging share).
        const barterExcess = Math.max(0, barterSum - 800000);
        if (barterExcess > 0) {
          const allocatedBarterExcess = barterExcess * nonImagingRatio;
          buckets.BARTER_EXCESS.salesMnt += allocatedBarterExcess;
          totalSalesMnt += allocatedBarterExcess;

          const generalPct = Number(cfg?.generalPct || 0);
          const barterIncome = allocatedBarterExcess * (generalPct / 100);
          buckets.BARTER_EXCESS.incomeMnt += barterIncome;
          totalIncomeMnt += barterIncome;
        }
      }

      // ---------- INCOME ----------
      {
        const orthoPct = Number(cfg?.orthoPct || 0);
        const defectPct = Number(cfg?.defectPct || 0);
        const surgeryPct = Number(cfg?.surgeryPct || 0);
        const generalPct = Number(cfg?.generalPct || 0);
        const imagingPct = Number(cfg?.imagingPct || 0);
        const feeMultiplier = hasOverride ? 0.9 : 1;

        for (const it of serviceItems) {
          const service = it.service;
          const lineNet = (itemAllocationBase.get(it.id) || 0) * feeMultiplier;
          if (lineNet <= 0) continue;

          if (service?.category === "IMAGING") {
            // Credit doctor only when explicitly assignedTo=DOCTOR.
            if (it.meta?.assignedTo === "DOCTOR") {
              const income = lineNet * (imagingPct / 100);
              buckets.IMAGING.incomeMnt += income;
              totalIncomeMnt += income;
            }
            continue;
          }

          if (Number(it.service?.code) === HOME_BLEACHING_SERVICE_CODE) {
            // Deduct material cost before applying generalPct.
            const base = Math.max(0, lineNet - homeBleachingDeductAmountMnt);
            const income = base * (generalPct / 100);
            buckets.GENERAL.incomeMnt += income;
            totalIncomeMnt += income;
            continue;
          }

          const k = bucketKeyForService(service);

          let pct = generalPct;
          if (k === "ORTHODONTIC_TREATMENT") pct = orthoPct;
          else if (k === "DEFECT_CORRECTION") pct = defectPct;
          else if (k === "SURGERY") pct = surgeryPct;

          const income = lineNet * (pct / 100);
          buckets[k].incomeMnt += income;
          totalIncomeMnt += income;
        }
      }
    }

    const categories = [
      buckets.IMAGING,
      buckets.ORTHODONTIC_TREATMENT,
      buckets.DEFECT_CORRECTION,
      buckets.SURGERY,
      buckets.GENERAL,
      buckets.BARTER_EXCESS,
    ].map((r) => ({
      ...r,
      salesMnt: Math.round(r.salesMnt),
      incomeMnt: Math.round(r.incomeMnt),
      pctUsed: Number(r.pctUsed || 0),
    }));

    return res.json({
      doctorId: DOCTOR_ID,
      startDate: String(startDate),
      endDate: String(endDate),
      categories,
      totals: {
        totalSalesMnt: Math.round(totalSalesMnt),
        totalIncomeMnt: Math.round(totalIncomeMnt),
      },
    });
  } catch (error) {
    console.error("Error in fetching category income breakdown:", error);
    return res.status(500).json({ error: "Failed to fetch detailed income breakdown." });
  }
});

// ==========================================================
// NURSES INCOME
// ==========================================================

/**
 * GET /api/admin/nurses-income
 * Summary of nurse income (imaging commission + assist income) per nurse for date range.
 *
 * NurseIncome = ImagingIncomeMnt + AssistIncomeMnt
 *
 * ImagingIncomeMnt: IMAGING service lines with meta.assignedTo==="NURSE" for this nurse,
 *   allocated using the same proportional-by-remaining-due helpers as doctor income,
 *   multiplied by global nurseImagingPct (Settings key "finance.nurseImagingPct").
 *
 * AssistIncomeMnt: For each invoice where encounter.nurseId === nurse,
 *   compute doctorSalesMnt (non-IMAGING paid allocations in range, same rules as doctors),
 *   then assistIncome = doctorSalesMnt × 1%.
 */
router.get("/nurses-income", async (req, res) => {
  const { startDate, endDate, branchId } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required parameters." });
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  try {
    // Load global nurse imaging percent from settings
    const nurseImagingPctSetting = await prisma.settings.findFirst({
      where: { key: "finance.nurseImagingPct" },
    });
    const nurseImagingPct = Number(nurseImagingPctSetting?.value ?? 0) || 0;

    // Load all nurses for name lookup
    const nurses = await prisma.user.findMany({
      where: { role: "nurse" },
      select: { id: true, name: true, ovog: true },
    });
    const nurseById = new Map(nurses.map((n) => [n.id, n]));

    // Query invoices with payments in date range; include encounter for nurseId
    const invoices = await prisma.invoice.findMany({
      where: {
        ...(branchId ? { branchId: Number(branchId) } : {}),
        payments: { some: { timestamp: { gte: start, lt: endExclusive } } },
      },
      include: {
        encounter: {
          select: { nurseId: true },
        },
        items: { include: { service: true } },
        payments: {
          include: {
            allocations: { select: { invoiceItemId: true, amount: true } },
          },
        },
      },
    });

    const byNurse = new Map();

    function ensureNurse(nurseId) {
      if (!byNurse.has(nurseId)) {
        const nurse = nurseById.get(nurseId);
        byNurse.set(nurseId, {
          nurseId,
          nurseName: nurse?.name ?? null,
          nurseOvog: nurse?.ovog ?? null,
          startDate: String(startDate),
          endDate: String(endDate),
          imagingIncomeMnt: 0,
          assistIncomeMnt: 0,
        });
      }
      return byNurse.get(nurseId);
    }

    for (const inv of invoices) {
      const payments = inv.payments || [];
      const hasOverride = payments.some((p) =>
        OVERRIDE_METHODS.has(String(p.method).toUpperCase())
      );
      const feeMultiplier = hasOverride ? 0.9 : 1;

      const discountPct = discountPercentEnumToNumber(inv.discountPercent);
      const serviceItems = (inv.items || []).filter(
        (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
      );

      if (!serviceItems.length) continue;

      const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);
      const serviceLineIds = serviceItems.map((it) => it.id);
      const itemById = new Map(serviceItems.map((it) => [it.id, it]));

      // remainingDue is mutated by allocatePaymentProportionalByRemaining
      const remainingDue = new Map(serviceItems.map((it) => [it.id, lineNets.get(it.id) || 0]));
      const itemAllocationBase = new Map(serviceItems.map((it) => [it.id, 0]));

      let barterSum = 0;

      // Process payments in timestamp order for deterministic remaining-due tracking
      const sortedPayments = [...payments].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      for (const p of sortedPayments) {
        const method = String(p.method || "").toUpperCase();
        const ts = new Date(p.timestamp);
        if (!inRange(ts, start, endExclusive)) continue;
        if (EXCLUDED_METHODS.has(method)) continue;

        if (method === "BARTER") {
          barterSum += Number(p.amount || 0);
          continue;
        }

        if (!INCLUDED_METHODS.has(method) && !OVERRIDE_METHODS.has(method)) continue;

        const payAmt = Number(p.amount || 0);
        const payAllocs = p.allocations || [];

        if (payAllocs.length > 0) {
          for (const alloc of payAllocs) {
            const item = itemById.get(alloc.invoiceItemId);
            if (!item) continue;
            const allocAmt = Number(alloc.amount || 0);
            itemAllocationBase.set(item.id, (itemAllocationBase.get(item.id) || 0) + allocAmt);
            remainingDue.set(item.id, Math.max(0, (remainingDue.get(item.id) || 0) - allocAmt));
          }
        } else {
          const allocs = allocatePaymentProportionalByRemaining(payAmt, serviceLineIds, remainingDue);
          for (const [id, amt] of allocs) {
            itemAllocationBase.set(id, (itemAllocationBase.get(id) || 0) + amt);
          }
        }
      }

      // --- IMAGING income for nurses ---
      const nurseImagingItems = serviceItems.filter(
        (it) =>
          it.service?.category === "IMAGING" &&
          it.meta?.assignedTo === "NURSE" &&
          it.meta?.nurseId != null
      );

      for (const it of nurseImagingItems) {
        const nurseId = Number(it.meta.nurseId);
        const lineBase = (itemAllocationBase.get(it.id) || 0) * feeMultiplier;
        if (lineBase <= 0) continue;
        const income = lineBase * (nurseImagingPct / 100);
        ensureNurse(nurseId).imagingIncomeMnt += income;
      }

      // --- ASSIST income for nurse assigned to encounter ---
      const assistNurseId = inv.encounter?.nurseId;
      if (assistNurseId) {
        const nonImagingItems = serviceItems.filter(
          (it) => it.service?.category !== "IMAGING"
        );

        let invDoctorSalesMnt = 0;

        if (hasOverride) {
          // Override invoices: only count when fully paid
          const status = String(inv.statusLegacy || "").toLowerCase();
          if (status === "paid") {
            const totalNonImagingNet = nonImagingItems.reduce(
              (sum, it) => sum + (lineNets.get(it.id) || 0),
              0
            );
            invDoctorSalesMnt = totalNonImagingNet * 0.9;
          }
        } else {
          // Sum paid allocations for non-IMAGING lines
          let salesFromPaid = 0;
          for (const it of nonImagingItems) {
            salesFromPaid += itemAllocationBase.get(it.id) || 0;
          }
          // BARTER excess (same rule as doctor income)
          const totalAllServiceNet = serviceItems.reduce(
            (sum, it) => sum + (lineNets.get(it.id) || 0),
            0
          );
          const totalNonImagingNet = nonImagingItems.reduce(
            (sum, it) => sum + (lineNets.get(it.id) || 0),
            0
          );
          const nonImagingRatio =
            totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;
          const barterExcess = Math.max(0, barterSum - 800000);
          invDoctorSalesMnt = salesFromPaid + barterExcess * nonImagingRatio;
        }

        if (invDoctorSalesMnt > 0) {
          ensureNurse(assistNurseId).assistIncomeMnt += invDoctorSalesMnt * 0.01;
        }
      }
    }

    const result = Array.from(byNurse.values()).map((n) => ({
      ...n,
      imagingIncomeMnt: Math.round(n.imagingIncomeMnt),
      assistIncomeMnt: Math.round(n.assistIncomeMnt),
      totalIncomeMnt: Math.round(n.imagingIncomeMnt + n.assistIncomeMnt),
      nurseImagingPct,
    }));

    return res.json(result);
  } catch (error) {
    console.error("Error in fetching nurses income:", error);
    return res.status(500).json({ error: "Failed to fetch nurses income." });
  }
});

/**
 * GET /api/admin/nurses-income/:nurseId/details
 * Detailed breakdown for a specific nurse: imaging lines + assist lines.
 */
router.get("/nurses-income/:nurseId/details", async (req, res) => {
  const { nurseId } = req.params;
  const { startDate, endDate } = req.query;

  if (!nurseId || !startDate || !endDate) {
    return res.status(400).json({
      error: "nurseId, startDate, and endDate are required parameters.",
    });
  }

  const NURSE_ID = Number(nurseId);
  const start = new Date(`${String(startDate)}T00:00:00.000Z`);
  const endExclusive = new Date(`${String(endDate)}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  try {
    // Load global nurse imaging percent from settings
    const nurseImagingPctSetting = await prisma.settings.findFirst({
      where: { key: "finance.nurseImagingPct" },
    });
    const nurseImagingPct = Number(nurseImagingPctSetting?.value ?? 0) || 0;

    // Query invoices that either have imaging items OR belong to this nurse's encounters
    const invoices = await prisma.invoice.findMany({
      where: {
        payments: { some: { timestamp: { gte: start, lt: endExclusive } } },
        OR: [
          {
            items: {
              some: {
                itemType: "SERVICE",
                service: { category: "IMAGING" },
              },
            },
          },
          {
            encounter: { nurseId: NURSE_ID },
          },
        ],
      },
      include: {
        encounter: {
          include: {
            doctor: { select: { id: true, name: true, ovog: true } },
          },
        },
        items: { include: { service: true } },
        payments: {
          include: {
            allocations: { select: { invoiceItemId: true, amount: true } },
          },
        },
      },
    });

    let totalImagingIncomeMnt = 0;
    let totalAssistIncomeMnt = 0;
    const imagingLines = [];
    const assistLines = [];

    for (const inv of invoices) {
      const payments = inv.payments || [];
      const hasOverride = payments.some((p) =>
        OVERRIDE_METHODS.has(String(p.method).toUpperCase())
      );
      const feeMultiplier = hasOverride ? 0.9 : 1;

      const discountPct = discountPercentEnumToNumber(inv.discountPercent);
      const serviceItems = (inv.items || []).filter(
        (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
      );

      if (!serviceItems.length) continue;

      const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);
      const serviceLineIds = serviceItems.map((it) => it.id);
      const itemById = new Map(serviceItems.map((it) => [it.id, it]));

      const remainingDue = new Map(serviceItems.map((it) => [it.id, lineNets.get(it.id) || 0]));
      const itemAllocationBase = new Map(serviceItems.map((it) => [it.id, 0]));

      let barterSum = 0;

      const sortedPayments = [...payments].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      for (const p of sortedPayments) {
        const method = String(p.method || "").toUpperCase();
        const ts = new Date(p.timestamp);
        if (!inRange(ts, start, endExclusive)) continue;
        if (EXCLUDED_METHODS.has(method)) continue;

        if (method === "BARTER") {
          barterSum += Number(p.amount || 0);
          continue;
        }

        if (!INCLUDED_METHODS.has(method) && !OVERRIDE_METHODS.has(method)) continue;

        const payAmt = Number(p.amount || 0);
        const payAllocs = p.allocations || [];

        if (payAllocs.length > 0) {
          for (const alloc of payAllocs) {
            const item = itemById.get(alloc.invoiceItemId);
            if (!item) continue;
            const allocAmt = Number(alloc.amount || 0);
            itemAllocationBase.set(item.id, (itemAllocationBase.get(item.id) || 0) + allocAmt);
            remainingDue.set(item.id, Math.max(0, (remainingDue.get(item.id) || 0) - allocAmt));
          }
        } else {
          const allocs = allocatePaymentProportionalByRemaining(payAmt, serviceLineIds, remainingDue);
          for (const [id, amt] of allocs) {
            itemAllocationBase.set(id, (itemAllocationBase.get(id) || 0) + amt);
          }
        }
      }

      // --- IMAGING lines for this nurse ---
      const myImagingItems = serviceItems.filter(
        (it) =>
          it.service?.category === "IMAGING" &&
          it.meta?.assignedTo === "NURSE" &&
          Number(it.meta?.nurseId) === NURSE_ID
      );

      for (const it of myImagingItems) {
        const lineBase = (itemAllocationBase.get(it.id) || 0) * feeMultiplier;
        if (lineBase <= 0) continue;
        const income = lineBase * (nurseImagingPct / 100);
        totalImagingIncomeMnt += income;
        imagingLines.push({
          invoiceId: inv.id,
          invoiceItemId: it.id,
          serviceName: it.service?.name || it.name,
          lineNet: Math.round(lineBase),
          imagingPct: nurseImagingPct,
          incomeMnt: Math.round(income),
        });
      }

      // --- ASSIST line for this nurse (if encounter.nurseId === NURSE_ID) ---
      if (inv.encounter?.nurseId === NURSE_ID) {
        const nonImagingItems = serviceItems.filter(
          (it) => it.service?.category !== "IMAGING"
        );

        let invDoctorSalesMnt = 0;

        if (hasOverride) {
          const status = String(inv.statusLegacy || "").toLowerCase();
          if (status === "paid") {
            const totalNonImagingNet = nonImagingItems.reduce(
              (sum, it) => sum + (lineNets.get(it.id) || 0),
              0
            );
            invDoctorSalesMnt = totalNonImagingNet * 0.9;
          }
        } else {
          let salesFromPaid = 0;
          for (const it of nonImagingItems) {
            salesFromPaid += itemAllocationBase.get(it.id) || 0;
          }
          const totalAllServiceNet = serviceItems.reduce(
            (sum, it) => sum + (lineNets.get(it.id) || 0),
            0
          );
          const totalNonImagingNet = nonImagingItems.reduce(
            (sum, it) => sum + (lineNets.get(it.id) || 0),
            0
          );
          const nonImagingRatio =
            totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;
          const barterExcess = Math.max(0, barterSum - 800000);
          invDoctorSalesMnt = salesFromPaid + barterExcess * nonImagingRatio;
        }

        if (invDoctorSalesMnt > 0) {
          const assistIncome = invDoctorSalesMnt * 0.01;
          totalAssistIncomeMnt += assistIncome;

          const doctor = inv.encounter?.doctor;
          const doctorName = doctor
            ? (
                (doctor.ovog ? doctor.ovog.charAt(0) + ". " : "") +
                (doctor.name || "")
              ).trim() || null
            : null;

          assistLines.push({
            encounterId: inv.encounterId,
            invoiceId: inv.id,
            doctorId: doctor?.id ?? null,
            doctorName,
            salesBaseMnt: Math.round(invDoctorSalesMnt),
            pct: 1,
            incomeMnt: Math.round(assistIncome),
          });
        }
      }
    }

    return res.json({
      nurseId: NURSE_ID,
      startDate: String(startDate),
      endDate: String(endDate),
      nurseImagingPct,
      imagingLines,
      assistLines,
      totals: {
        imagingIncomeMnt: Math.round(totalImagingIncomeMnt),
        assistIncomeMnt: Math.round(totalAssistIncomeMnt),
        totalIncomeMnt: Math.round(totalImagingIncomeMnt + totalAssistIncomeMnt),
      },
    });
  } catch (error) {
    console.error("Error in fetching nurse income details:", error);
    return res.status(500).json({ error: "Failed to fetch nurse income details." });
  }
});

export default router;
