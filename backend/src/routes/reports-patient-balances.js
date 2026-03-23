import express from "express";
import prisma from "../db.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Computes patient balance from all invoices, payments, and manual adjustments.
 * Returns { totalBilled, totalPaid, totalAdjusted, balance }.
 * balance = totalBilled - totalPaid - totalAdjusted
 * (positive = patient owes money / debt, negative = patient overpaid / credit)
 */
export async function getPatientBalance(patientId) {
  const invoices = await prisma.invoice.findMany({
    where: { patientId },
    select: { id: true, finalAmount: true, totalAmount: true },
  });

  let totalBilled = 0;
  let totalPaid = 0;

  if (invoices.length > 0) {
    const invoiceIds = invoices.map((inv) => inv.id);

    const payments = await prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { invoiceId: { in: invoiceIds } },
      _sum: { amount: true },
    });

    const paidByInvoice = new Map();
    for (const p of payments) {
      paidByInvoice.set(p.invoiceId, Number(p._sum.amount || 0));
    }

    for (const inv of invoices) {
      const billed =
        inv.finalAmount != null
          ? Number(inv.finalAmount)
          : Number(inv.totalAmount || 0);
      totalBilled += billed;
      totalPaid += paidByInvoice.get(inv.id) || 0;
    }
  }

  // Include manual balance adjustments
  const adjAgg = await prisma.balanceAdjustmentLog.aggregate({
    where: { patientId },
    _sum: { amount: true },
  }).catch(() => ({ _sum: { amount: 0 } }));
  const totalAdjusted = Number(adjAgg._sum.amount || 0);

  totalBilled = Number(totalBilled.toFixed(2));
  totalPaid = Number(totalPaid.toFixed(2));
  const balance = Number((totalBilled - totalPaid - totalAdjusted).toFixed(2));

  return { totalBilled, totalPaid, totalAdjusted, balance };
}

/**
 * GET /api/reports/patient-balances
 *
 * Query params:
 *   - type: "debt" | "overpayment" (required — filters by balance sign)
 *   - branchId: number (optional — filter by branch)
 *   - search: string (optional — search name, ovog, regNo, phone, bookNumber)
 *   - page: number (default 1)
 *   - pageSize: number (default 30, max 100)
 *
 * Response: { total, page, pageSize, items: [...] }
 */
router.get(
  "/patient-balances",
  requireRole("admin", "super_admin", "accountant", "manager"),
  async (req, res) => {
  try {
    const { type, branchId: branchIdParam, search, page: pageParam, pageSize: pageSizeParam } = req.query;

    if (type !== "debt" && type !== "overpayment") {
      return res.status(400).json({ error: "type must be 'debt' or 'overpayment'." });
    }

    const branchId = branchIdParam ? Number(branchIdParam) : null;
    if (branchIdParam && (Number.isNaN(branchId) || branchId <= 0)) {
      return res.status(400).json({ error: "branchId must be a positive number." });
    }

    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeParam) || 30));

    // 1) Build patient WHERE clause
    const patientWhere = {
      isActive: true,
      ...(branchId ? { branchId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { ovog: { contains: search, mode: "insensitive" } },
              { regNo: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { patientBook: { bookNumber: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    // 2) Fetch patients
    const patients = await prisma.patient.findMany({
      where: patientWhere,
      include: {
        branch: { select: { id: true, name: true } },
        patientBook: { select: { bookNumber: true } },
      },
    });

    if (patients.length === 0) {
      return res.json({ total: 0, page, pageSize, items: [] });
    }

    const patientIds = patients.map((p) => p.id);

    // 3) Fetch all invoices for these patients
    const invoices = await prisma.invoice.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true, patientId: true, finalAmount: true, totalAmount: true },
    });

    // 4) Fetch all payments for those invoices
    const invoiceIds = invoices.map((inv) => inv.id);
    const payments = invoiceIds.length
      ? await prisma.payment.groupBy({
          by: ["invoiceId"],
          where: { invoiceId: { in: invoiceIds } },
          _sum: { amount: true },
        })
      : [];

    const paidByInvoice = new Map();
    for (const p of payments) {
      paidByInvoice.set(p.invoiceId, Number(p._sum.amount || 0));
    }

    // 5) Fetch manual balance adjustments
    const adjustments = await prisma.balanceAdjustmentLog.groupBy({
      by: ["patientId"],
      where: { patientId: { in: patientIds } },
      _sum: { amount: true },
    }).catch(() => []);

    const adjByPatient = new Map();
    for (const a of adjustments) {
      adjByPatient.set(a.patientId, Number(a._sum.amount || 0));
    }

    // 6) Aggregate per patient
    const billedByPatient = new Map();
    const paidByPatient = new Map();

    for (const inv of invoices) {
      const pid = inv.patientId;
      if (!pid) continue;
      const billed = inv.finalAmount != null
        ? Number(inv.finalAmount)
        : Number(inv.totalAmount || 0);
      billedByPatient.set(pid, (billedByPatient.get(pid) || 0) + billed);
      paidByPatient.set(pid, (paidByPatient.get(pid) || 0) + (paidByInvoice.get(inv.id) || 0));
    }

    // 7) Build result with balance filter
    const allItems = [];
    for (const p of patients) {
      const totalBilled = Number((billedByPatient.get(p.id) || 0).toFixed(2));
      const totalPaid = Number((paidByPatient.get(p.id) || 0).toFixed(2));
      const totalAdjusted = Number((adjByPatient.get(p.id) || 0).toFixed(2));
      const balance = Number((totalBilled - totalPaid - totalAdjusted).toFixed(2));

      // debt: balance > 0 (owes money), overpayment: balance < 0 (prepaid)
      if (type === "debt" && balance <= 0) continue;
      if (type === "overpayment" && balance >= 0) continue;

      allItems.push({
        patientId: p.id,
        bookNumber: p.patientBook?.bookNumber ?? null,
        name: p.name,
        ovog: p.ovog,
        regNo: p.regNo,
        phone: p.phone,
        branchId: p.branchId,
        branchName: p.branch?.name ?? null,
        totalBilled,
        totalPaid,
        totalAdjusted,
        balance,
      });
    }

    // Sort by absolute balance descending
    allItems.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    const total = allItems.length;
    const items = allItems.slice((page - 1) * pageSize, page * pageSize);

    return res.json({ total, page, pageSize, items });
  } catch (err) {
    console.error("GET /api/reports/patient-balances error:", err);
    return res.status(500).json({ error: "Failed to compute patient balances." });
  }
}
);

/**
 * GET /api/reports/patient-balance-detail/:patientId
 *
 * Returns per-appointment breakdown for a patient's current balance.
 * Shows each invoice with appointment info, billed, paid, and remaining.
 */
router.get(
  "/patient-balance-detail/:patientId",
  requireRole("admin", "super_admin", "accountant", "manager"),
  async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (!patientId || patientId <= 0) {
      return res.status(400).json({ error: "Invalid patientId." });
    }

    const invoices = await prisma.invoice.findMany({
      where: { patientId },
      include: {
        encounter: {
          select: {
            visitDate: true,
            appointmentId: true,
            doctor: { select: { id: true, name: true, ovog: true } },
          },
        },
        payments: {
          select: { id: true, amount: true, method: true, timestamp: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = invoices.map((inv) => {
      const billed = inv.finalAmount != null
        ? Number(inv.finalAmount)
        : Number(inv.totalAmount || 0);
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      const remaining = Number((billed - paid).toFixed(2));
      const doctor = inv.encounter?.doctor;

      return {
        invoiceId: inv.id,
        appointmentId: inv.encounter?.appointmentId ?? null,
        scheduledAt: inv.encounter?.visitDate?.toISOString() ?? null,
        doctorName: doctor
          ? `${doctor.ovog ? doctor.ovog[0] + ". " : ""}${doctor.name ?? ""}`.trim()
          : null,
        totalAmount: Number(inv.totalAmount || 0),
        finalAmount: inv.finalAmount != null ? Number(inv.finalAmount) : null,
        billed,
        paid: Number(paid.toFixed(2)),
        remaining,
        status: inv.statusLegacy ?? null,
        createdAt: inv.createdAt,
      };
    });

    // Also include manual adjustment logs
    const adjustments = await prisma.balanceAdjustmentLog.findMany({
      where: { patientId },
      include: { createdBy: { select: { id: true, name: true, ovog: true } } },
      orderBy: { createdAt: "desc" },
    }).catch(() => []);

    return res.json({ invoiceBreakdown: items, adjustmentLog: adjustments });
  } catch (err) {
    console.error("GET /api/reports/patient-balance-detail error:", err);
    return res.status(500).json({ error: "Failed to load balance detail." });
  }
}
);

/**
 * POST /api/reports/patient-balance-adjustment
 *
 * Body: { patientId: number, amount: number, reason: string }
 * Requires admin or accountant role.
 * Creates a BalanceAdjustmentLog entry.
 */
router.post(
  "/patient-balance-adjustment",
  requireRole("admin", "super_admin", "accountant"),
  async (req, res) => {
    try {
      const { patientId, amount, reason } = req.body;

      if (!patientId || typeof patientId !== "number") {
        return res.status(400).json({ error: "patientId is required." });
      }
      if (typeof amount !== "number" || amount === 0) {
        return res.status(400).json({ error: "amount must be a non-zero number." });
      }
      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "reason is required." });
      }

      const patient = await prisma.patient.findUnique({ where: { id: patientId } });
      if (!patient) {
        return res.status(404).json({ error: "Patient not found." });
      }

      const log = await prisma.balanceAdjustmentLog.create({
        data: {
          patientId,
          amount: Number(amount),
          reason: reason.trim(),
          createdById: req.user.id,
        },
      });

      return res.status(201).json(log);
    } catch (err) {
      console.error("POST /api/reports/patient-balance-adjustment error:", err);
      return res.status(500).json({ error: "Failed to save balance adjustment." });
    }
  }
);

export default router;
