/**
 * GET /api/admin/reports/appointments/doctors-income
 *
 * Doctor income performance report for the new admin "Эмч" report page.
 * Uses the same income calculation logic as the existing Эмчийн Орлогын Тайлан.
 *
 * Query params:
 *   year       (optional; default current year) — used in monthly mode
 *   startDate  (optional, YYYY-MM-DD)
 *   endDate    (optional, YYYY-MM-DD) — inclusive
 *   branchId   (optional)
 *   doctorId   (optional)
 *
 * Response:
 *   {
 *     mode: "monthly" | "daily",
 *     year, startDate, endDate,
 *     series: [{ key: "YYYY-MM" | "YYYY-MM-DD", incomeMnt }],
 *     totalIncomeMnt,
 *     breakdown: { type: "branches"|"doctors"|"categories", rows: [{id,label,incomeMnt,pct}] },
 *     filters: { branches: [...], doctors: [...] }
 *   }
 */
import express from "express";
import prisma from "../../db.js";
import {
  discountPercentEnumToNumber,
  computeServiceNetProportionalDiscount,
  allocatePaymentProportionalByRemaining,
} from "../../utils/incomeHelpers.js";

const router = express.Router();

// ── Constants (must match income.js exactly) ──────────────────────────────────
const INCLUDED_METHODS = new Set([
  "CASH", "POS", "TRANSFER", "QPAY", "WALLET", "VOUCHER", "OTHER",
]);
const EXCLUDED_METHODS = new Set(["EMPLOYEE_BENEFIT"]);
const OVERRIDE_METHODS = new Set(["INSURANCE", "APPLICATION"]);
const HOME_BLEACHING_SERVICE_CODE = 151;
const BARTER_THRESHOLD_MNT = 800_000;

const CATEGORY_LABELS = {
  IMAGING: "Зураг авах",
  ORTHODONTIC_TREATMENT: "Гажиг заслын эмчилгээ",
  DEFECT_CORRECTION: "Согог засал",
  SURGERY: "Мэс засал",
  GENERAL: "Ерөнхий",
  BARTER_EXCESS: "Бартер (800,000₮-с дээш)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

/**
 * Add YYYY-MM-DD strings between start and end inclusive.
 */
function enumerateDays(start, end) {
  const days = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/** Compute percentage contribution rounded to 2 decimal places. */
function calcPct(part, total) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

/**
 * Compute doctor income (incomeMnt) and category breakdown from a list of invoices.
 * Returns { incomeMnt, byCategory: Map<categoryKey, incomeMnt> }.
 *
 * This logic mirrors income.js exactly (same payment filters, barter rule, imaging rule, etc.)
 */
function computeIncomeFromInvoices(invoices, rangeStart, rangeEnd, homeBleachingDeductAmountMnt) {
  let totalIncomeMnt = 0;
  const byCategory = new Map([
    ["IMAGING", 0],
    ["ORTHODONTIC_TREATMENT", 0],
    ["DEFECT_CORRECTION", 0],
    ["SURGERY", 0],
    ["GENERAL", 0],
    ["BARTER_EXCESS", 0],
  ]);

  for (const inv of invoices) {
    const doctor = inv.encounter?.doctor;
    if (!doctor) continue;

    const cfg = doctor.commissionConfig;
    const payments = inv.payments || [];
    const hasOverride = payments.some((p) => OVERRIDE_METHODS.has(String(p.method).toUpperCase()));

    const discountPct = discountPercentEnumToNumber(inv.discountPercent);
    const serviceItems = (inv.items || []).filter(
      (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
    );
    if (!serviceItems.length) continue;

    const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);

    const nonImagingServiceItems = serviceItems.filter(
      (it) => it.service?.category !== "IMAGING"
    );
    const totalAllServiceNet = serviceItems.reduce(
      (sum, it) => sum + (lineNets.get(it.id) || 0), 0
    );
    const totalNonImagingNet = nonImagingServiceItems.reduce(
      (sum, it) => sum + (lineNets.get(it.id) || 0), 0
    );
    const nonImagingRatio = totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;

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
      if (!inRange(ts, rangeStart, rangeEnd)) continue;
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

    // Barter excess income (via GENERAL pct) — same as income.js
    if (!hasOverride) {
      const generalPct = Number(cfg?.generalPct || 0);
      const barterExcess = Math.max(0, barterSum - BARTER_THRESHOLD_MNT);
      if (barterExcess > 0) {
        const allocatedBarterExcess = barterExcess * nonImagingRatio;
        const barterIncome = allocatedBarterExcess * (generalPct / 100);
        byCategory.set("BARTER_EXCESS", (byCategory.get("BARTER_EXCESS") || 0) + barterIncome);
        totalIncomeMnt += barterIncome;
      }
    }

    // Income per service line
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
          if (it.meta?.assignedTo === "DOCTOR") {
            const income = lineNet * (imagingPct / 100);
            byCategory.set("IMAGING", (byCategory.get("IMAGING") || 0) + income);
            totalIncomeMnt += income;
          }
          continue;
        }

        if (Number(it.service?.code) === HOME_BLEACHING_SERVICE_CODE) {
          const base = Math.max(0, lineNet - homeBleachingDeductAmountMnt);
          const income = base * (generalPct / 100);
          byCategory.set("GENERAL", (byCategory.get("GENERAL") || 0) + income);
          totalIncomeMnt += income;
          continue;
        }

        const k = bucketKeyForService(service);
        let pct = generalPct;
        if (k === "ORTHODONTIC_TREATMENT") pct = orthoPct;
        else if (k === "DEFECT_CORRECTION") pct = defectPct;
        else if (k === "SURGERY") pct = surgeryPct;

        const income = lineNet * (pct / 100);
        byCategory.set(k, (byCategory.get(k) || 0) + income);
        totalIncomeMnt += income;
      }
    }
  }

  return { incomeMnt: totalIncomeMnt, byCategory };
}

// ── Main endpoint ─────────────────────────────────────────────────────────────
router.get("/reports/appointments/doctors-income", async (req, res) => {
  try {
    const {
      year: yearParam,
      startDate: startDateParam,
      endDate: endDateParam,
      branchId: branchIdParam,
      doctorId: doctorIdParam,
    } = req.query;

    const currentYear = new Date().getFullYear();
    const year = yearParam ? Number(yearParam) : currentYear;

    // Determine mode
    const isDateRange = Boolean(startDateParam && endDateParam);
    const mode = isDateRange ? "daily" : "monthly";

    let rangeStart, rangeEnd; // Date objects
    let startDateStr, endDateStr; // YYYY-MM-DD strings

    if (isDateRange) {
      startDateStr = String(startDateParam);
      endDateStr = String(endDateParam);
      rangeStart = new Date(`${startDateStr}T00:00:00.000Z`);
      rangeEnd = new Date(`${endDateStr}T00:00:00.000Z`);
      rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); // exclusive end
    } else {
      startDateStr = `${year}-01-01`;
      endDateStr = `${year}-12-31`;
      rangeStart = new Date(`${startDateStr}T00:00:00.000Z`);
      rangeEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    }

    const branchId = branchIdParam ? Number(branchIdParam) : null;
    const doctorId = doctorIdParam ? Number(doctorIdParam) : null;

    // ── Settings ──────────────────────────────────────────────────────────────
    const homeBleachingDeductSetting = await prisma.settings.findUnique({
      where: { key: "finance.homeBleachingDeductAmountMnt" },
    });
    const homeBleachingDeductAmountMnt = Number(homeBleachingDeductSetting?.value || 0) || 0;

    // ── Fetch filter lists ────────────────────────────────────────────────────
    const [allBranches, allDoctors] = await Promise.all([
      prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.user.findMany({
        where: {
          role: "doctor",
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true, name: true, ovog: true, branchId: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // ── Fetch invoices ────────────────────────────────────────────────────────
    // Build the encounter filter to scope by doctor (branch scope is on Invoice.branchId)
    const encounterFilter = {};
    if (doctorId) {
      encounterFilter.doctorId = doctorId;
    }

    const invoiceWhere = {
  OR: [
    { createdAt: { gte: rangeStart, lt: rangeEnd } },
    { payments: { some: { timestamp: { gte: rangeStart, lt: rangeEnd } } } },
  ],
  encounter: encounterFilter,
  ...(branchId ? { branchId } : {}), // ✅ branch-at-time
};

    const invoices = await prisma.invoice.findMany({
  where: invoiceWhere,
  include: {
    branch: { select: { id: true, name: true } }, // ✅ invoice branch (branch-at-time)
    encounter: {
      include: {
        doctor: {
          include: {
            branch: { select: { id: true, name: true } }, // optional; ok to keep
            commissionConfig: true,
          },
        },
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

    // ── Build time-series ─────────────────────────────────────────────────────
    // Group invoices by bucket key (YYYY-MM or YYYY-MM-DD).
    // We use the payment timestamps to determine which bucket an invoice falls into.
    // If an invoice has no in-range payment but was created in range, we bucket by createdAt.

    const bucketMap = new Map(); // key → incomeMnt

    // Pre-populate buckets with zero for all expected keys
    if (mode === "monthly") {
      for (let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2, "0")}`;
        bucketMap.set(key, 0);
      }
    } else {
      for (const day of enumerateDays(startDateStr, endDateStr)) {
        bucketMap.set(day, 0);
      }
    }

    // For time-series bucketing: each invoice contributes to the bucket of its
    // earliest in-range payment timestamp. If no payment found, use createdAt.
    function getBucketKey(inv) {
      const sortedPayments = [...(inv.payments || [])].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
      for (const p of sortedPayments) {
        const method = String(p.method || "").toUpperCase();
        if (EXCLUDED_METHODS.has(method)) continue;
        const ts = new Date(p.timestamp);
        if (!inRange(ts, rangeStart, rangeEnd)) continue;
        const iso = ts.toISOString().slice(0, 10); // YYYY-MM-DD
        return mode === "monthly" ? iso.slice(0, 7) : iso;
      }
      // Fall back to createdAt
      const created = new Date(inv.createdAt);
      if (inRange(created, rangeStart, rangeEnd)) {
        const iso = created.toISOString().slice(0, 10);
        return mode === "monthly" ? iso.slice(0, 7) : iso;
      }
      return null;
    }

    // Breakdown maps
    const breakdownByBranch = new Map(); // branchId → { label, incomeMnt }
    const breakdownByDoctor = new Map(); // doctorId → { label, incomeMnt }
    const breakdownByCategory = new Map([
      ["IMAGING", 0],
      ["ORTHODONTIC_TREATMENT", 0],
      ["DEFECT_CORRECTION", 0],
      ["SURGERY", 0],
      ["GENERAL", 0],
      ["BARTER_EXCESS", 0],
    ]);

    let totalIncomeMnt = 0;

    // We process invoices one at a time; for time-series we compute income per invoice.
    for (const inv of invoices) {
      const doctor = inv.encounter?.doctor;
      if (!doctor) continue;

      const { incomeMnt, byCategory } = computeIncomeFromInvoices(
        [inv],
        rangeStart,
        rangeEnd,
        homeBleachingDeductAmountMnt
      );

      if (incomeMnt <= 0) continue;

      // Time-series bucket
      const key = getBucketKey(inv);
      if (key && bucketMap.has(key)) {
        bucketMap.set(key, bucketMap.get(key) + incomeMnt);
      }

      totalIncomeMnt += incomeMnt;

      // Breakdown: branch (use doctor's branch at time of encounter)
      const branch = inv.branch; // ✅ branch-at-time comes from Invoice
      if (branch) {
        if (!breakdownByBranch.has(branch.id)) {
          breakdownByBranch.set(branch.id, { id: branch.id, label: branch.name, incomeMnt: 0 });
        }
        breakdownByBranch.get(branch.id).incomeMnt += incomeMnt;
      }

      // Breakdown: doctor
      const dLabel =
        ((doctor.ovog ? doctor.ovog.charAt(0) + ". " : "") + (doctor.name || "")).trim() ||
        `Doctor ${doctor.id}`;
      if (!breakdownByDoctor.has(doctor.id)) {
        breakdownByDoctor.set(doctor.id, { id: doctor.id, label: dLabel, incomeMnt: 0 });
      }
      breakdownByDoctor.get(doctor.id).incomeMnt += incomeMnt;

      // Breakdown: category
      for (const [cat, amt] of byCategory) {
        breakdownByCategory.set(cat, (breakdownByCategory.get(cat) || 0) + amt);
      }
    }

    // ── Build breakdown rows ──────────────────────────────────────────────────
    let breakdownType;
    let breakdownRows;

    if (doctorId) {
      // Category breakdown for selected doctor
      breakdownType = "categories";
      breakdownRows = Array.from(breakdownByCategory.entries())
        .map(([key, incomeMnt]) => ({
          id: key,
          label: CATEGORY_LABELS[key] || key,
          incomeMnt: Math.round(incomeMnt),
          pct: calcPct(incomeMnt, totalIncomeMnt),
        }))
        .filter((r) => r.incomeMnt > 0);
    } else if (branchId) {
      // Doctor breakdown within selected branch
      breakdownType = "doctors";
      breakdownRows = Array.from(breakdownByDoctor.values())
        .map((r) => ({
          ...r,
          incomeMnt: Math.round(r.incomeMnt),
          pct: calcPct(r.incomeMnt, totalIncomeMnt),
        }))
        .sort((a, b) => b.incomeMnt - a.incomeMnt);
    } else {
      // Branch breakdown (default)
      breakdownType = "branches";
      breakdownRows = Array.from(breakdownByBranch.values())
        .map((r) => ({
          ...r,
          incomeMnt: Math.round(r.incomeMnt),
          pct: calcPct(r.incomeMnt, totalIncomeMnt),
        }))
        .sort((a, b) => b.incomeMnt - a.incomeMnt);
    }

    // ── Build series ──────────────────────────────────────────────────────────
    const series = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, incomeMnt]) => ({ key, incomeMnt: Math.round(incomeMnt) }));

    return res.json({
      mode,
      year,
      startDate: startDateStr,
      endDate: endDateStr,
      scope: { branchId: branchId || null, doctorId: doctorId || null },
      series,
      totalIncomeMnt: Math.round(totalIncomeMnt),
      breakdown: { type: breakdownType, rows: breakdownRows },
      filters: {
        branches: allBranches,
        doctors: allDoctors.map((d) => ({
          id: d.id,
          name: d.name,
          ovog: d.ovog,
          branchId: d.branchId,
        })),
      },
    });
  } catch (err) {
    console.error("GET /api/admin/reports/appointments/doctors-income error:", err);
    return res.status(500).json({ error: "Failed to fetch doctor income report." });
  }
});

export default router;
