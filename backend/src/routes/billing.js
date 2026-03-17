import express from "express";
import { PrismaClient } from "@prisma/client";
import { applyPaymentToInvoice, computePaidTotal } from "../services/settlementService.js";
import { sseBroadcast } from "./appointments.js";

const prisma = new PrismaClient();
const router = express.Router();

/**
 * Helper: map DiscountPercent enum to numeric value
 */
function discountPercentToNumber(discountEnum) {
  if (!discountEnum) return 0;
  switch (discountEnum) {
    case "FIVE":
      return 5;
    case "TEN":
      return 10;
    case "ZERO":
    default:
      return 0;
  }
}

/**
 * Helper: map numeric percent to DiscountPercent enum
 * Only allow 0 / 5 / 10 (per business rule).
 */
function toDiscountEnum(percent) {
  if (!percent || percent === 0) return "ZERO";
  if (percent === 5) return "FIVE";
  if (percent === 10) return "TEN";
  throw new Error("Invalid discount percent. Allowed: 0, 5, 10.");
}

/**
 * Helper: compute patient balance from all invoices + payments.
 * Returns { totalBilled, totalPaid, balance }.
 */
async function getPatientBalance(patientId) {
  const invoices = await prisma.invoice.findMany({
    where: { patientId },
    select: {
      id: true,
      finalAmount: true,
      totalAmount: true,
    },
  });

  if (invoices.length === 0) {
    return { totalBilled: 0, totalPaid: 0, balance: 0 };
  }

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

  let totalBilled = 0;
  let totalPaid = 0;

  for (const inv of invoices) {
    const billed =
      inv.finalAmount != null ? Number(inv.finalAmount) : Number(inv.totalAmount || 0);
    const paid = paidByInvoice.get(inv.id) || 0;
    totalBilled += billed;
    totalPaid += paid;
  }

  totalBilled = Number(totalBilled.toFixed(2));
  totalPaid = Number(totalPaid.toFixed(2));
  const balance = Number((totalBilled - totalPaid).toFixed(2));

  return { totalBilled, totalPaid, balance };
}

/**
 * Helper: compute outstanding balance on old invoices (excluding a given invoiceId).
 * Returns the sum of (finalAmount - paidTotal) for invoices where unpaid > 0.
 * Used for FIFO split payment allocation.
 */
async function getPatientOldBalance(patientId, excludeInvoiceId) {
  const where = { patientId };
  if (excludeInvoiceId) where.NOT = { id: excludeInvoiceId };

  const invoices = await prisma.invoice.findMany({
    where,
    select: { id: true, finalAmount: true, totalAmount: true },
    orderBy: { createdAt: "asc" },
  });

  if (invoices.length === 0) return 0;

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

  let oldBalance = 0;
  for (const inv of invoices) {
    const billed =
      inv.finalAmount != null ? Number(inv.finalAmount) : Number(inv.totalAmount || 0);
    const paid = paidByInvoice.get(inv.id) || 0;
    const unpaid = billed - paid;
    if (unpaid > 0) oldBalance += unpaid;
  }

  return Number(oldBalance.toFixed(2));
}

router.get("/encounters/:id/invoice", async (req, res) => {
  const encounterId = Number(req.params.id);
  if (!encounterId || Number.isNaN(encounterId)) {
    return res.status(400).json({ error: "Invalid encounter id." });
  }

  try {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patientBook: { include: { patient: { include: { branch: true } } } },
        encounterServices: { include: { service: true } },
        invoice: { include: { items: { include: { service: true } }, eBarimtReceipt: true } },
        appointment: { select: { branchId: true } },
      },
    });

    if (!encounter) return res.status(404).json({ error: "Encounter not found." });

    // Receptionist can only access billing for their own branch
    if (req.user?.role === "receptionist") {
      const encBranchId = encounter.appointment?.branchId ?? encounter.patientBook?.patient?.branchId;
      if (encBranchId !== req.user.branchId) {
        return res.status(403).json({ error: "Receptionist can only access billing for their own branch." });
      }
    }

    const patient = encounter.patientBook?.patient;
    if (!patient) {
      return res.status(409).json({ error: "Encounter has no linked patient book / patient." });
    }

    const existingInvoice = encounter.invoice;

    if (existingInvoice) {
      const discountNum = discountPercentToNumber(existingInvoice.discountPercent);
      const balanceData = await getPatientBalance(patient.id);

      // Detect marker: any encounter service whose service.category === "PREVIOUS"
      const hasMarker = (encounter.encounterServices || []).some(
        (es) => es.service?.category === "PREVIOUS"
      );
      const patientOldBalance = hasMarker
        ? await getPatientOldBalance(patient.id, existingInvoice.id)
        : 0;

      // Compute per-item already-allocated amounts for split payment display
      const serviceItemIds = existingInvoice.items
        .filter((it) => it.itemType === "SERVICE")
        .map((it) => it.id);

      const allocGroups =
        serviceItemIds.length > 0
          ? await prisma.paymentAllocation.groupBy({
              by: ["invoiceItemId"],
              where: { invoiceItemId: { in: serviceItemIds } },
              _sum: { amount: true },
            })
          : [];

      const allocByItemId = new Map(
        allocGroups.map((a) => [a.invoiceItemId, Number(a._sum.amount || 0)])
      );

      return res.json({
        id: existingInvoice.id,
        branchId: existingInvoice.branchId,
        encounterId: existingInvoice.encounterId,
        patientId: existingInvoice.patientId,
        status: existingInvoice.statusLegacy || "UNPAID",
        totalBeforeDiscount: existingInvoice.totalBeforeDiscount,
        discountPercent: discountNum,
        collectionDiscountAmount: existingInvoice.collectionDiscountAmount || 0,
        finalAmount: existingInvoice.finalAmount,
        hasEBarimt: !!existingInvoice.eBarimtReceipt,
        buyerType: existingInvoice.buyerType || "B2C",
        buyerTin: existingInvoice.buyerTin || null,
        ebarimtReceipt: existingInvoice.eBarimtReceipt
          ? {
              id: existingInvoice.eBarimtReceipt.id,
              status: existingInvoice.eBarimtReceipt.status,
              ddtd: existingInvoice.eBarimtReceipt.ddtd ?? null,
              printedAtText: existingInvoice.eBarimtReceipt.printedAtText ?? null,
              printedAt: existingInvoice.eBarimtReceipt.printedAt
                ? existingInvoice.eBarimtReceipt.printedAt.toISOString()
                : null,
              totalAmount: existingInvoice.eBarimtReceipt.totalAmount ?? null,
              qrData: existingInvoice.eBarimtReceipt.qrData ?? null,
              lottery: existingInvoice.eBarimtReceipt.lottery ?? null,
            }
          : null,
        items: existingInvoice.items.map((it) => ({
          id: it.id,
          itemType: it.itemType,
          serviceId: it.serviceId,
          productId: it.productId,
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          lineTotal: it.lineTotal,
          source: it.source,
          meta: it.meta ?? null,
          serviceCategory: it.service?.category ?? null,
          alreadyAllocated: allocByItemId.get(it.id) ?? 0,
        })),
        patientTotalBilled: balanceData.totalBilled,
        patientTotalPaid: balanceData.totalPaid,
        patientBalance: balanceData.balance,
        hasMarker,
        patientOldBalance,
        patientOvog: patient.ovog ?? null,
        patientName: patient.name,
        patientRegNo: patient.regNo ?? null,
      });
    }

    const branchId = patient.branchId;
    const patientId = patient.id;

    const provisionalItems =
      encounter.encounterServices?.map((es) => {
        const unitPrice = es.service?.price != null ? es.service.price : es.price || 0;
        const quantity = es.quantity || 1;
        const lineTotal = unitPrice * quantity;

        return {
          tempId: es.id,
          itemType: "SERVICE",
          serviceId: es.serviceId,
          productId: null,
          name: es.service?.name || `Service #${es.serviceId}`,
          unitPrice,
          quantity,
          lineTotal,
          source: "ENCOUNTER",
          serviceCategory: es.service?.category ?? null,
          meta: (es.meta?.assignedTo) ? { assignedTo: es.meta.assignedTo, nurseId: es.meta.nurseId ?? undefined } : null,
        };
      }) ?? [];

    const totalBeforeDiscount = provisionalItems.reduce((sum, it) => sum + it.lineTotal, 0);
    const balanceData = await getPatientBalance(patientId);

    // Detect marker for provisional case too
    const hasMarker = (encounter.encounterServices || []).some(
      (es) => es.service?.category === "PREVIOUS"
    );
    const patientOldBalance = hasMarker
      ? await getPatientOldBalance(patientId, null)
      : 0;

    return res.json({
      id: null,
      branchId,
      encounterId,
      patientId,
      status: "UNPAID",
      totalBeforeDiscount,
      discountPercent: 0,
      collectionDiscountAmount: 0,
      finalAmount: totalBeforeDiscount,
      hasEBarimt: false,
      buyerType: "B2C",
      buyerTin: null,
      items: provisionalItems,
      isProvisional: true,
      patientTotalBilled: balanceData.totalBilled,
      patientTotalPaid: balanceData.totalPaid,
      patientBalance: balanceData.balance,
      hasMarker,
      patientOldBalance,
    });
  } catch (err) {
    console.error("GET /encounters/:id/invoice failed:", err);
    return res.status(500).json({ error: "Failed to load invoice for encounter." });
  }
});

/**
 * POST /api/billing/encounters/:id/invoice
 *
 * Create or update invoice structure for an encounter.
 */
router.post("/encounters/:id/invoice", async (req, res) => {
  const encounterId = Number(req.params.id);
  if (!encounterId || Number.isNaN(encounterId)) {
    return res.status(400).json({ error: "Invalid encounter id." });
  }

  const { discountPercent, items, collectionDiscountAmount } = req.body || {};

  try {
    const discountEnum = toDiscountEnum(Number(discountPercent || 0));
    const collectionDiscount = Number(collectionDiscountAmount || 0);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Invoice must have at least one item." });
    }

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patientBook: { include: { patient: true } },
        encounterServices: true,
        invoice: { include: { items: true, eBarimtReceipt: true } },
        appointment: { select: { branchId: true } },
      },
    });

    if (!encounter) return res.status(404).json({ error: "Encounter not found." });

    // Receptionist can only access billing for their own branch
    if (req.user?.role === "receptionist") {
      const encBranchId = encounter.appointment?.branchId ?? encounter.patientBook?.patient?.branchId;
      if (encBranchId !== req.user.branchId) {
        return res.status(403).json({ error: "Receptionist can only access billing for their own branch." });
      }
    }

    const patient = encounter.patientBook?.patient;
    if (!patient) {
      return res.status(409).json({ error: "Encounter has no linked patient book / patient." });
    }

    const branchId = patient.branchId;
    const patientId = patient.id;
    const existingInvoice = encounter.invoice;

    if (existingInvoice?.eBarimtReceipt) {
      return res.status(409).json({
        error: "Invoice already has an e-Barimt receipt. Structure cannot be modified.",
      });
    }

    const encounterServiceIds = new Set(
      (encounter.encounterServices || []).map((es) => Number(es.serviceId))
    );

    // ---------- NEW: validate productIds in one DB query ----------
    const productIdsNeeded = (items || [])
      .filter((r) => r?.itemType === "PRODUCT" && r.productId)
      .map((r) => Number(r.productId))
      .filter((id) => Number.isFinite(id));

    const uniqueProductIds = Array.from(new Set(productIdsNeeded));

    let productById = new Map();
    if (uniqueProductIds.length > 0) {
      const products = await prisma.product.findMany({
        where: {
          id: { in: uniqueProductIds },
          branchId,
          isActive: true,
        },
        select: { id: true, name: true, price: true },
      });
      productById = new Map(products.map((p) => [p.id, p]));
    }

    // Build normalized items payload
    const normalizedItems = [];

    for (const row of items) {
      const itemType = row.itemType;
      if (itemType !== "SERVICE" && itemType !== "PRODUCT") {
        return res.status(400).json({ error: "Invalid itemType. Must be SERVICE or PRODUCT." });
      }

      const qty = Number(row.quantity || 0);
      const price = Number(row.unitPrice || 0);

      if (qty <= 0) return res.status(400).json({ error: "Quantity must be greater than zero." });
      if (price < 0) return res.status(400).json({ error: "Unit price cannot be negative." });

      if (itemType === "SERVICE") {
        if (!row.serviceId) {
          return res.status(400).json({
            error:
              "SERVICE item must have serviceId. Use PRODUCT itemType for retail products.",
          });
        }
      } else {
        if (!row.productId) {
          return res.status(400).json({
            error:
              "PRODUCT item must have productId. Use SERVICE itemType for clinical services.",
          });
        }

        // NEW: ensure product exists and matches branch/isActive
        const pid = Number(row.productId);
        if (!productById.has(pid)) {
          return res.status(400).json({
            error: "Invalid productId (not found, inactive, or branch mismatch).",
          });
        }
      }

      const normalizedServiceId = itemType === "SERVICE" ? Number(row.serviceId) : null;
      const normalizedProductId = itemType === "PRODUCT" ? Number(row.productId) : null;

      const source =
        itemType === "SERVICE" &&
        normalizedServiceId != null &&
        encounterServiceIds.has(normalizedServiceId)
          ? "ENCOUNTER"
          : "MANUAL";

      const name = String(row.name || "").trim();
      const lineTotal = qty * price;

      // Persist imaging performer meta (assignedTo, nurseId) if provided
      const meta = row.meta != null ? row.meta : null;

      normalizedItems.push({
        id: row.id ?? null,
        itemType,
        serviceId: normalizedServiceId,
        productId: normalizedProductId,
        name,
        unitPrice: price,
        quantity: qty,
        lineTotal,
        source,
        meta,
      });
    }

    // ---------- Validate meta for IMAGING rows ----------
    for (const it of normalizedItems) {
      if (it.meta != null) {
        const allowedKeys = new Set(["assignedTo", "nurseId"]);
        for (const k of Object.keys(it.meta)) {
          if (!allowedKeys.has(k)) {
            return res.status(400).json({ error: `Invalid meta key: ${k}. Allowed: assignedTo, nurseId.` });
          }
        }
        const { assignedTo, nurseId } = it.meta;
        if (assignedTo !== "DOCTOR" && assignedTo !== "NURSE") {
          return res.status(400).json({ error: 'meta.assignedTo must be "DOCTOR" or "NURSE".' });
        }
        if (assignedTo === "NURSE") {
          if (!Number.isFinite(Number(nurseId))) {
            return res.status(400).json({ error: 'meta.nurseId must be a number when assignedTo is "NURSE".' });
          }
        }
        if (assignedTo === "DOCTOR" && nurseId != null) {
          return res.status(400).json({ error: 'meta.nurseId must not be set when assignedTo is "DOCTOR".' });
        }
      }
    }

    // ---------- NEW: totals + discount only on SERVICES ----------
    const servicesSubtotal = normalizedItems
      .filter((it) => it.itemType === "SERVICE")
      .reduce((sum, it) => sum + Number(it.lineTotal || 0), 0);

    const productsSubtotal = normalizedItems
      .filter((it) => it.itemType === "PRODUCT")
      .reduce((sum, it) => sum + Number(it.lineTotal || 0), 0);

    const totalBeforeDiscount = servicesSubtotal + productsSubtotal;

    const numericDiscount = discountPercentToNumber(discountEnum);
    const discountFactor = numericDiscount === 0 ? 1 : (100 - numericDiscount) / 100;

    const discountedServices = Math.max(Math.round(servicesSubtotal * discountFactor), 0);
    const finalAmount = Math.max(discountedServices + Math.round(productsSubtotal), 0);

    // ---------- save ----------
    let invoice;
    if (!existingInvoice) {
      invoice = await prisma.invoice.create({
        data: {
          branchId,
          encounterId,
          patientId,
          totalBeforeDiscount,
          discountPercent: discountEnum,
          collectionDiscountAmount: collectionDiscount,
          finalAmount,
          statusLegacy: "UNPAID",
          items: {
            create: normalizedItems.map((it) => ({
              itemType: it.itemType,
              serviceId: it.serviceId,
              productId: it.productId,
              name: it.name,
              unitPrice: it.unitPrice,
              quantity: it.quantity,
              lineTotal: it.lineTotal,
              source: it.source,
              meta: it.meta ?? undefined,
            })),
          },
        },
        include: { items: { include: { service: true } }, eBarimtReceipt: true },
      });
    } else {
      invoice = await prisma.invoice.update({
        where: { id: existingInvoice.id },
        data: {
          branchId,
          patientId,
          totalBeforeDiscount,
          discountPercent: discountEnum,
          collectionDiscountAmount: collectionDiscount,
          finalAmount,
          items: {
            deleteMany: { invoiceId: existingInvoice.id },
            create: normalizedItems.map((it) => ({
              itemType: it.itemType,
              serviceId: it.serviceId,
              productId: it.productId,
              name: it.name,
              unitPrice: it.unitPrice,
              quantity: it.quantity,
              lineTotal: it.lineTotal,
              source: it.source,
              meta: it.meta ?? undefined,
            })),
          },
        },
        include: { items: { include: { service: true } }, eBarimtReceipt: true },
      });
    }

    const respDiscount = discountPercentToNumber(invoice.discountPercent);
    return res.json({
      id: invoice.id,
      branchId: invoice.branchId,
      encounterId: invoice.encounterId,
      patientId: invoice.patientId,
      status: invoice.statusLegacy || "UNPAID",
      totalBeforeDiscount: invoice.totalBeforeDiscount,
      discountPercent: respDiscount,
      collectionDiscountAmount: invoice.collectionDiscountAmount || 0,
      finalAmount: invoice.finalAmount,
      hasEBarimt: !!invoice.eBarimtReceipt,
      items: invoice.items.map((it) => ({
        id: it.id,
        itemType: it.itemType,
        serviceId: it.serviceId,
        productId: it.productId,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
        source: it.source,
        meta: it.meta ?? null,
        serviceCategory: it.service?.category ?? null,
      })),
    });
  } catch (err) {
    console.error("POST /encounters/:id/invoice failed:", err);
    if (err.message?.startsWith("Invalid discount percent")) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to save invoice for encounter." });
  }
});

// Floating-point tolerance for split allocation comparisons (in ₮)
const ALLOCATION_TOLERANCE = 0.01;

/**
 * POST /api/billing/encounters/:id/batch-settlement
 *
 * Split-payment endpoint: optionally pay previous invoices FIFO before current.
 * Only allowed when encounter contains a marker service (service.category === PREVIOUS).
 *
 * Body:
 * {
 *   amount: number;              // total payment amount (> 0)
 *   method: string;              // payment method key
 *   closeOldBalance?: boolean;   // true = apply FIFO to previous unpaid invoices first
 *   splitAllocations?: { invoiceItemId: number; amount: number }[];
 *                                // per-service allocation for current invoice (SERVICE items only)
 *   issueEBarimt?: boolean;  // ignored; e-Barimt is always auto-issued on full payment
 *   meta?: object;
 * }
 */
router.post("/encounters/:id/batch-settlement", async (req, res) => {
  const encounterId = Number(req.params.id);
  if (!encounterId || Number.isNaN(encounterId)) {
    return res.status(400).json({ error: "Invalid encounter id." });
  }

  const { amount, method, closeOldBalance, splitAllocations, meta } =
    req.body || {};

  const payAmount = Number(amount || 0);
  if (!payAmount || payAmount <= 0) {
    return res.status(400).json({ error: "amount must be a number greater than zero." });
  }

  if (!method || typeof method !== "string" || !method.trim()) {
    return res.status(400).json({ error: "method is required for payment." });
  }
  const methodStr = method.trim().toUpperCase();

  try {
    // Load current encounter + invoice (including encounterServices for marker gating)
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patientBook: { include: { patient: true } },
        encounterServices: { include: { service: true } },
        invoice: {
          include: {
            items: true,
            payments: true,
            eBarimtReceipt: true,
            encounter: {
              select: { appointmentId: true },
            },
          },
        },
        appointment: true,
      },
    });

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found." });
    }

    // Receptionist can only access billing for their own branch
    if (req.user?.role === "receptionist") {
      const encBranchId = encounter.appointment?.branchId ?? encounter.patientBook?.patient?.branchId;
      if (encBranchId !== req.user.branchId) {
        return res.status(403).json({ error: "Receptionist can only access billing for their own branch." });
      }
    }

    const invoice = encounter.invoice;
    if (!invoice) {
      return res.status(409).json({ error: "No invoice found for this encounter. Save invoice structure first." });
    }

    const patient = encounter.patientBook?.patient;
    if (!patient) {
      return res.status(409).json({ error: "Encounter has no linked patient." });
    }

    // ── Marker gating ────────────────────────────────────────────
    // closeOldBalance and splitAllocations are only valid when the encounter
    // contains a marker service (category === PREVIOUS).
    const hasMarker = (encounter.encounterServices || []).some(
      (es) => es.service?.category === "PREVIOUS"
    );

    const usesSpecialFlow =
      closeOldBalance === true ||
      (Array.isArray(splitAllocations) && splitAllocations.length > 0);

    if (usesSpecialFlow && !hasMarker) {
      return res.status(400).json({
        error:
          "closeOldBalance болон splitAllocations нь PREVIOUS ангиллын маркер үйлчилгээтэй үзлэгт л боломжтой.",
      });
    }

    // Sterilization mismatch gate (applies to current encounter)
    const unresolvedMismatch = await prisma.sterilizationMismatch.findFirst({
      where: { encounterId, status: "UNRESOLVED" },
      select: { id: true },
    });
    if (unresolvedMismatch) {
      return res.status(400).json({
        error: "Төлбөр батлах боломжгүй: Ариутгалын тохиргоо дутуу байна. Эхлээд ариутгалын зөрүүг шийдвэрлэнэ үү.",
        errorCode: "UNRESOLVED_STERILIZATION_MISMATCH",
      });
    }

    // Compute current invoice base amount and already-paid total
    const currentBaseAmount =
      invoice.finalAmount != null
        ? Number(invoice.finalAmount)
        : Number(invoice.totalAmount || 0);

    const currentAlreadyPaid = computePaidTotal(invoice.payments);

    // Validate split allocations: must reference SERVICE items, amounts must not
    // exceed the remaining unpaid per line (lineTotal − alreadyAllocated).
    if (Array.isArray(splitAllocations) && splitAllocations.length > 0) {
      const serviceItems = invoice.items.filter((it) => it.itemType === "SERVICE");
      const serviceItemMap = new Map(serviceItems.map((it) => [it.id, it]));

      // Query existing allocation totals for these items
      const existingAllocGroups = serviceItems.length > 0
        ? await prisma.paymentAllocation.groupBy({
            by: ["invoiceItemId"],
            where: { invoiceItemId: { in: serviceItems.map((it) => it.id) } },
            _sum: { amount: true },
          })
        : [];
      const existingAllocByItemId = new Map(
        existingAllocGroups.map((a) => [a.invoiceItemId, Number(a._sum.amount || 0)])
      );

      for (const alloc of splitAllocations) {
        const itemId = Number(alloc.invoiceItemId);
        const allocAmt = Number(alloc.amount);

        if (!serviceItemMap.has(itemId)) {
          return res.status(400).json({
            error: `invoiceItemId ${alloc.invoiceItemId} нь энэ нэхэмжлэлийн SERVICE мөр биш байна.`,
          });
        }
        if (allocAmt < 0) {
          return res.status(400).json({ error: "Хуваарилалтын дүн сөрөг байж болохгүй." });
        }

        const item = serviceItemMap.get(itemId);
        const lineTotal = Number(item.lineTotal || 0);
        const alreadyAllocated = existingAllocByItemId.get(itemId) || 0;
        const remaining = lineTotal - alreadyAllocated;

        if (allocAmt > remaining + ALLOCATION_TOLERANCE) {
          return res.status(400).json({
            error: `"${item.name}" үйлчилгээний хуваарилалт үлдэгдэл дүнгээс хэтэрсэн байна (үлдэгдэл: ${remaining.toFixed(2)}).`,
          });
        }
      }
    }

    // ── FIFO computation ────────────────────────────────────────
    let amountForOld = 0;
    let amountForCurrent = payAmount;

    if (closeOldBalance) {
      // Find old unpaid invoices for this patient (excluding current), oldest first
      const oldInvoices = await prisma.invoice.findMany({
        where: { patientId: patient.id, NOT: { id: invoice.id } },
        include: { payments: true },
        orderBy: { createdAt: "asc" },
      });

      let totalOldBalance = 0;
      for (const oi of oldInvoices) {
        const billed =
          oi.finalAmount != null ? Number(oi.finalAmount) : Number(oi.totalAmount || 0);
        const paid = computePaidTotal(oi.payments);
        const unpaid = Math.max(billed - paid, 0);
        totalOldBalance += unpaid;
      }

      amountForOld = Math.min(payAmount, totalOldBalance);
      amountForCurrent = Math.max(payAmount - amountForOld, 0);
    }

    // Cap amountForCurrent to what the current invoice can still accept.
    // This ensures a 0₮ marker-only invoice never receives an accidental payment.
    const currentRemaining = Math.max(currentBaseAmount - currentAlreadyPaid, 0);
    amountForCurrent = Math.min(amountForCurrent, currentRemaining);

    // ── Option A enforcement ─────────────────────────────────────
    // If amountForCurrent > 0, check whether the invoice already has allocations.
    // If it does (or if splitAllocations were provided), splitAllocations are required
    // and their sum must equal amountForCurrent (within tolerance).
    if (amountForCurrent > 0) {
      const serviceItems = invoice.items.filter((it) => it.itemType === "SERVICE");
      const existingAllocsCheck =
        serviceItems.length > 0
          ? await prisma.paymentAllocation.findFirst({
              where: { invoiceItemId: { in: serviceItems.map((it) => it.id) } },
              select: { id: true },
            })
          : null;

      const invoiceHasAllocations = !!existingAllocsCheck;
      const allocsProvided =
        Array.isArray(splitAllocations) && splitAllocations.length > 0;

      if (invoiceHasAllocations || allocsProvided) {
        if (!allocsProvided) {
          return res.status(400).json({
            error:
              'Энэ нэхэмжлэл дээр "Хувааж төлөх" ашигласан тул дараагийн төлбөрийг мөн үйлчилгээний мөрөөр хуваарилж бүртгэнэ үү.',
            errorCode: "ALLOCATION_REQUIRED",
          });
        }

        const allocSum = splitAllocations.reduce(
          (s, a) => s + Number(a.amount || 0),
          0
        );
        if (Math.abs(allocSum - amountForCurrent) > ALLOCATION_TOLERANCE) {
          return res.status(400).json({
            error: `Хуваарилалтын нийлбэр (${allocSum.toFixed(2)}) нь өнөөдрийн нэхэмжлэлд орох дүн (${amountForCurrent.toFixed(2)})-тэй тохирохгүй байна.`,
          });
        }
      }
    }

    // ── Execute in transaction ────────────────────────────────────
    const result = await prisma.$transaction(async (trx) => {
      // 1) Apply FIFO payments to old invoices using shared settlement logic
      if (amountForOld > 0) {
        const oldInvoices = await trx.invoice.findMany({
          where: { patientId: patient.id, NOT: { id: invoice.id } },
          include: {
            items: true,
            payments: true,
            eBarimtReceipt: true,
            encounter: { select: { appointmentId: true } },
          },
          orderBy: { createdAt: "asc" },
        });

        let remaining = amountForOld;

        for (const oi of oldInvoices) {
          if (remaining <= 0) break;

          const billed =
            oi.finalAmount != null ? Number(oi.finalAmount) : Number(oi.totalAmount || 0);
          const paid = computePaidTotal(oi.payments);
          const unpaid = Math.max(billed - paid, 0);
          if (unpaid <= 0) continue;

          const chunk = Math.min(remaining, unpaid);
          remaining -= chunk;

          await applyPaymentToInvoice(trx, {
            invoice: oi,
            payAmount: chunk,
            methodStr,
            meta,
            createdByUserId: req.user?.id || null,
          });
        }
      }

      // 2) Apply payment to current invoice (if any amount remains for it)
      let currentPaymentId = null;
      if (amountForCurrent > 0) {
        // Check if already fully paid
        if (currentAlreadyPaid >= currentBaseAmount) {
          throw new Error("Current invoice is already fully paid.");
        }

        // Build a minimal invoice object for applyPaymentToInvoice that includes
        // the encounter appointmentId (needed for appointment status update).
        const invoiceForSettlement = {
          ...invoice,
          encounter: { appointmentId: encounter.appointmentId ?? null },
        };

        const { newPayment } = await applyPaymentToInvoice(trx, {
          invoice: invoiceForSettlement,
          payAmount: amountForCurrent,
          methodStr,
          meta,
          createdByUserId: req.user?.id || null,
        });

        currentPaymentId = newPayment.id;
      }

      // 3) Persist split allocations for current invoice payment
      if (
        currentPaymentId &&
        Array.isArray(splitAllocations) &&
        splitAllocations.length > 0
      ) {
        await trx.paymentAllocation.createMany({
          data: splitAllocations.map((a) => ({
            paymentId: currentPaymentId,
            invoiceItemId: Number(a.invoiceItemId),
            amount: Number(a.amount),
          })),
        });
      }

      // 4) Reload updated current invoice
      const updatedInvoice = await trx.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          items: true,
          payments: { include: { createdBy: { select: { id: true, name: true, ovog: true } } } },
          eBarimtReceipt: true,
        },
      });

      return { updatedInvoice };
    });

    const { updatedInvoice } = result;
    const paidTotal = computePaidTotal(updatedInvoice.payments);

    // Broadcast SSE so Appointments page reflects status change immediately
    const appointmentIdForSse = encounter.appointmentId ?? null;
    if (appointmentIdForSse) {
      try {
        const apptForBroadcast = await prisma.appointment.findUnique({
          where: { id: appointmentIdForSse },
          include: {
            patient: { select: { id: true, name: true, ovog: true, phone: true, patientBook: true } },
            doctor: { select: { id: true, name: true, ovog: true } },
            branch: { select: { id: true, name: true } },
          },
        });
        if (apptForBroadcast?.scheduledAt) {
          const apptDate = apptForBroadcast.scheduledAt.toISOString().slice(0, 10);
          sseBroadcast("appointment_updated", apptForBroadcast, apptDate, apptForBroadcast.branchId);
        }
      } catch (sseErr) {
        console.error("SSE broadcast error after batch-settlement (non-fatal):", sseErr);
      }
    }

    return res.json({
      id: updatedInvoice.id,
      branchId: updatedInvoice.branchId,
      encounterId: updatedInvoice.encounterId,
      patientId: updatedInvoice.patientId,
      status: updatedInvoice.statusLegacy,
      totalBeforeDiscount: updatedInvoice.totalBeforeDiscount,
      discountPercent: discountPercentToNumber(updatedInvoice.discountPercent),
      collectionDiscountAmount: updatedInvoice.collectionDiscountAmount || 0,
      finalAmount: updatedInvoice.finalAmount,
      paidTotal,
      unpaidAmount: Math.max(currentBaseAmount - paidTotal, 0),
      hasEBarimt: !!updatedInvoice.eBarimtReceipt,
      amountAppliedToOld: amountForOld,
      amountAppliedToCurrent: amountForCurrent,
      items: updatedInvoice.items.map((it) => ({
        id: it.id,
        itemType: it.itemType,
        serviceId: it.serviceId,
        productId: it.productId,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
        source: it.source,
        meta: it.meta ?? null,
      })),
      payments: updatedInvoice.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        timestamp: p.timestamp,
        createdByUser: p.createdBy ? { id: p.createdBy.id, name: p.createdBy.name || null, ovog: p.createdBy.ovog || null } : null,
      })),
    });
  } catch (err) {
    console.error("POST /encounters/:id/batch-settlement error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to process batch settlement." });
  }
});

export default router;
