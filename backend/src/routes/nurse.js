/**
 * Nurse Portal Router – /api/nurse
 *
 * All routes (except /me which also allows admin) require:
 *   - authenticateJWT  (valid JWT cookie / Authorization header)
 *   - requireRole("nurse")
 *
 * The authenticated nurse's identity is always taken from req.user.id.
 */
import express from "express";
import prisma from "../db.js";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import {
  discountPercentEnumToNumber,
  computeServiceNetProportionalDiscount,
  allocatePaymentProportionalByRemaining,
} from "../utils/incomeHelpers.js";

const router = express.Router();

// Payment method rules (same as admin income route)
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

function inRange(ts, start, end) {
  return ts >= start && ts < end;
}

// ─── GET /api/nurse/me ────────────────────────────────────────────────────────
// Returns the authenticated user's own nurse record.
// Allowed roles: nurse, admin, super_admin.
// Must be registered BEFORE the router-level requireRole("nurse") middleware.
router.get(
  "/me",
  authenticateJWT,
  requireRole("nurse", "admin", "super_admin"),
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
      console.error("GET /api/nurse/me error:", err);
      return res.status(500).json({ error: "Failed to fetch nurse profile." });
    }
  }
);

// Apply auth + nurse role to every route below this point
router.use(authenticateJWT, requireRole("nurse"));

// ─── GET /api/nurse/schedule ──────────────────────────────────────────────────
// Returns authenticated nurse's upcoming schedule (next 31 days by default).
// Optional query params: from=YYYY-MM-DD, to=YYYY-MM-DD
router.get("/schedule", async (req, res) => {
  const nurseId = req.user.id;

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
    const schedules = await prisma.nurseSchedule.findMany({
      where: {
        nurseId,
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
    console.error("GET /api/nurse/schedule error:", err);
    return res.status(500).json({ error: "Failed to fetch nurse schedule." });
  }
});

// ─── GET /api/nurse/income/details ───────────────────────────────────────────
// Returns income details for the authenticated nurse.
// Same response shape as GET /api/admin/nurses-income/:nurseId/details
// Required query params: startDate=YYYY-MM-DD, endDate=YYYY-MM-DD
router.get("/income/details", async (req, res) => {
  const NURSE_ID = req.user.id;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: "startDate and endDate are required parameters.",
    });
  }

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
    console.error("GET /api/nurse/income/details error:", error);
    return res.status(500).json({ error: "Failed to fetch nurse income details." });
  }
});

export default router;
