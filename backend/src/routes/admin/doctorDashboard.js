/**
 * GET /api/admin/doctors/:doctorId/dashboard
 *
 * Returns bucketed performance metrics for a doctor dashboard:
 * - sales, income per bucket
 * - completed appointments count per bucket
 * - contributed services (invoice line items) count per bucket
 * - pies: gender & age group breakdown of completed appointments
 *   (only when bucket != "day", i.e., monthly/yearly views)
 *
 * Query params:
 *   startDate=YYYY-MM-DD  (browser-timezone start, treated as UTC midnight)
 *   endDate=YYYY-MM-DD    (browser-timezone end inclusive, treated as UTC midnight)
 *   bucket=month|week|day
 */

import express from "express";
import prisma from "../../db.js";
import {
  discountPercentEnumToNumber,
  computeServiceNetProportionalDiscount,
  allocatePaymentProportionalByRemaining,
} from "../../utils/incomeHelpers.js";
import { generateBuckets } from "../../utils/dashboardHelpers.js";

const router = express.Router();

// ── Shared payment method constants (same as income.js) ──────────────────────
const INCLUDED_METHODS = new Set([
  "CASH",
  "POS",
  "TRANSFER",
  "QPAY",
  "WALLET",
  "VOUCHER",
  "OTHER",
]);

const EXCLUDED_METHODS = new Set(["EMPLOYEE_BENEFIT"]);
const OVERRIDE_METHODS = new Set(["INSURANCE", "APPLICATION"]);

const HOME_BLEACHING_SERVICE_CODE = 151;

/** Minimum BARTER payment amount before the excess contributes to doctor sales. */
const BARTER_THRESHOLD_MNT = 800_000;

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
 * Compute sales + income contribution from a single invoice for a given date range.
 * Returns { sales, income, servicesCount }.
 */
function calcInvoiceContribution(inv, bucketStart, bucketEnd, homeBleachingDeductAmountMnt, cfg) {
  const payments = inv.payments || [];
  const hasOverride = payments.some((p) =>
    OVERRIDE_METHODS.has(String(p.method).toUpperCase())
  );
  const status = String(inv.statusLegacy || "").toLowerCase();
  const isPaid = status === "paid";

  const discountPct = discountPercentEnumToNumber(inv.discountPercent);
  const serviceItems = (inv.items || []).filter(
    (it) => it.itemType === "SERVICE" && it.service?.category !== "PREVIOUS"
  );
  if (!serviceItems.length) return { sales: 0, income: 0, servicesCount: 0 };

  const lineNets = computeServiceNetProportionalDiscount(serviceItems, discountPct);

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
  const nonImagingRatio =
    totalAllServiceNet > 0 ? totalNonImagingNet / totalAllServiceNet : 0;

  const serviceLineIds = serviceItems.map((it) => it.id);
  const itemById = new Map(serviceItems.map((it) => [it.id, it]));

  const remainingDue = new Map(serviceItems.map((it) => [it.id, lineNets.get(it.id) || 0]));
  const itemAllocationBase = new Map(serviceItems.map((it) => [it.id, 0]));

  let barterSum = 0;
  let hasPaymentInRange = false;

  const sortedPayments = [...payments].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  for (const p of sortedPayments) {
    const method = String(p.method || "").toUpperCase();
    const ts = new Date(p.timestamp);
    if (!inRange(ts, bucketStart, bucketEnd)) continue;
    if (EXCLUDED_METHODS.has(method)) continue;

    if (method === "BARTER") {
      barterSum += Number(p.amount || 0);
      hasPaymentInRange = true;
      continue;
    }

    if (!INCLUDED_METHODS.has(method) && !OVERRIDE_METHODS.has(method)) continue;

    hasPaymentInRange = true;
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

  let sales = 0;
  let income = 0;
  let servicesCount = 0;

  const orthoPct = Number(cfg?.orthoPct || 0);
  const defectPct = Number(cfg?.defectPct || 0);
  const surgeryPct = Number(cfg?.surgeryPct || 0);
  const generalPct = Number(cfg?.generalPct || 0);
  const imagingPct = Number(cfg?.imagingPct || 0);

  if (hasOverride) {
    // Override invoices: use invoice-level createdAt filter (must be in bucket range)
    if (isPaid && inRange(new Date(inv.createdAt), bucketStart, bucketEnd)) {
      for (const it of nonImagingServiceItems) {
        const lineNet = lineNets.get(it.id) || 0;
        if (lineNet <= 0) continue;
        sales += lineNet * 0.9;
        servicesCount++;
      }
    }
  } else {
    // Normal payments: aggregate allocated amounts for non-IMAGING lines
    for (const it of nonImagingServiceItems) {
      const amt = itemAllocationBase.get(it.id) || 0;
      if (amt <= 0) continue;
      sales += amt;
      servicesCount++;
    }

    // BARTER excess
    const barterExcess = Math.max(0, barterSum - BARTER_THRESHOLD_MNT);
    if (barterExcess > 0) {
      const allocatedBarterExcess = barterExcess * nonImagingRatio;
      sales += allocatedBarterExcess;
      income += allocatedBarterExcess * (generalPct / 100);
    }
  }

  // Income calculation (applies to all service items)
  const feeMultiplier = hasOverride ? 0.9 : 1;

  for (const it of serviceItems) {
    const service = it.service;
    const lineNet = (itemAllocationBase.get(it.id) || 0) * feeMultiplier;
    if (lineNet <= 0) continue;

    if (service?.category === "IMAGING") {
      if (it.meta?.assignedTo === "DOCTOR") {
        income += lineNet * (imagingPct / 100);
      }
      continue;
    }

    if (Number(it.service?.code) === HOME_BLEACHING_SERVICE_CODE) {
      const base = Math.max(0, lineNet - homeBleachingDeductAmountMnt);
      income += base * (generalPct / 100);
      continue;
    }

    const k = bucketKeyForService(service);
    let pct = generalPct;
    if (k === "ORTHODONTIC_TREATMENT") pct = orthoPct;
    else if (k === "DEFECT_CORRECTION") pct = defectPct;
    else if (k === "SURGERY") pct = surgeryPct;

    income += lineNet * (pct / 100);
  }

  return { sales, income, servicesCount };
}

/**
 * Compute age (in years) at a given reference date.
 * Returns null if birthDate is not available.
 */
function ageAt(birthDate, refDate) {
  if (!birthDate) return null;
  let age = refDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const mDiff = refDate.getUTCMonth() - birthDate.getUTCMonth();
  if (mDiff < 0 || (mDiff === 0 && refDate.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age;
}

/**
 * Map a raw gender value from the Patient record to a canonical bucket key.
 * Accepts Mongolian ("ЭР"/"ЭМ"), English ("M"/"MALE"/"F"/"FEMALE"), or null/empty.
 * @param {string|null|undefined} rawGender
 * @returns {"male"|"female"|"unknown"}
 */
function normalizeGender(rawGender) {
  const g = String(rawGender || "").toUpperCase().trim();
  if (g === "M" || g === "MALE" || g === "ЭР") return "male";
  if (g === "F" || g === "FEMALE" || g === "ЭМ") return "female";
  return "unknown";
}

// ── Dashboard endpoint ────────────────────────────────────────────────────────

router.get("/doctors/:doctorId/dashboard", async (req, res) => {
  const { doctorId } = req.params;
  const { startDate, endDate, bucket } = req.query;

  if (!doctorId || !startDate || !endDate || !bucket) {
    return res.status(400).json({
      error: "doctorId, startDate, endDate, and bucket are required.",
    });
  }

  const VALID_BUCKETS = ["month", "week", "day"];
  if (!VALID_BUCKETS.includes(String(bucket))) {
    return res.status(400).json({ error: "bucket must be one of: month, week, day" });
  }

  const DOCTOR_ID = Number(doctorId);
  if (!DOCTOR_ID || isNaN(DOCTOR_ID)) {
    return res.status(400).json({ error: "doctorId must be a valid number." });
  }

  const overallStart = new Date(`${String(startDate)}T00:00:00.000Z`);
  const overallEnd = new Date(`${String(endDate)}T00:00:00.000Z`);
  overallEnd.setUTCDate(overallEnd.getUTCDate() + 1); // exclusive

  try {
    // ── 1. Settings ──────────────────────────────────────────────────────────
    const homeBleachingDeductSetting = await prisma.settings.findUnique({
      where: { key: "finance.homeBleachingDeductAmountMnt" },
    });
    const homeBleachingDeductAmountMnt =
      Number(homeBleachingDeductSetting?.value || 0) || 0;

    // ── 2. Fetch invoices for doctor in overall range ────────────────────────
    const invoices = await prisma.invoice.findMany({
      where: {
        encounter: { doctorId: DOCTOR_ID },
        OR: [
          { createdAt: { gte: overallStart, lt: overallEnd } },
          { payments: { some: { timestamp: { gte: overallStart, lt: overallEnd } } } },
        ],
      },
      include: {
        encounter: {
          include: {
            doctor: { include: { commissionConfig: true } },
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

    const cfg = invoices[0]?.encounter?.doctor?.commissionConfig || null;

    // ── 3. Fetch completed appointments for doctor in overall range ──────────
    const completedAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: DOCTOR_ID,
        status: "completed",
        scheduledAt: { gte: overallStart, lt: overallEnd },
      },
      include: {
        patient: {
          select: { id: true, gender: true, birthDate: true },
        },
      },
    });

    // ── 4. Generate bucket descriptors ───────────────────────────────────────
    const buckets = generateBuckets(
      String(startDate),
      String(endDate),
      String(bucket)
    );

    // ── 5. Compute metrics per bucket ────────────────────────────────────────
    const series = buckets.map((b) => {
      // Sales + income + servicesCount from invoices
      let sales = 0;
      let income = 0;
      let servicesCount = 0;

      for (const inv of invoices) {
        const contrib = calcInvoiceContribution(
          inv,
          b.start,
          b.end,
          homeBleachingDeductAmountMnt,
          cfg
        );
        sales += contrib.sales;
        income += contrib.income;
        servicesCount += contrib.servicesCount;
      }

      // Completed appointments in this bucket (by scheduledAt)
      const completedCount = completedAppointments.filter(
        (a) => a.scheduledAt >= b.start && a.scheduledAt < b.end
      ).length;

      return {
        key: b.key,
        label: b.label,
        startDate: b.startDate,
        endDate: b.endDate,
        sales: Math.round(sales),
        income: Math.round(income),
        completedAppointments: completedCount,
        servicesCount,
      };
    });

    // ── 6. Compute pies (gender & age group) from all completed appointments ─
    // Pies are based on the overall date range, not per bucket.
    // hidePiesForBucketDay hint: frontend hides pies when bucket=day (weekly view).
    const genderCounts = { male: 0, female: 0, unknown: 0 };
    const ageCounts = { kidUnder16: 0, adult16Plus: 0, unknownAge: 0 };

    for (const appt of completedAppointments) {
      // Gender
      const genderKey = normalizeGender(appt.patient?.gender);
      genderCounts[genderKey]++;

      // Age at visit date (scheduledAt)
      const age = ageAt(appt.patient?.birthDate, appt.scheduledAt);
      if (age === null) {
        ageCounts.unknownAge++;
      } else if (age < 16) {
        ageCounts.kidUnder16++;
      } else {
        ageCounts.adult16Plus++;
      }
    }

    return res.json({
      range: {
        startDate: String(startDate),
        endDate: String(endDate),
        bucket: String(bucket),
      },
      series,
      pies: {
        gender: genderCounts,
        ageGroup: ageCounts,
      },
      meta: {
        doctorId: DOCTOR_ID,
        modeHints: {
          hidePiesForBucketDay: String(bucket) === "day",
        },
      },
    });
  } catch (error) {
    console.error("Error fetching doctor dashboard:", error);
    return res.status(500).json({ error: "Failed to fetch doctor dashboard data." });
  }
});

export default router;
