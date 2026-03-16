import express from "express";
import prisma from "../db.js";
import {
  computePaidTotal,
  applyPaymentToInvoice,
} from "../services/settlementService.js";

const router = express.Router();

/**
 * POST /api/invoices/:id/settlement
 *
 * Body:
 * {
 *   amount: number;        // required, >0
 *   method: "CASH" | "QPAY" | "POS" | "TRANSFER" | "INSURANCE" | "VOUCHER" | ...,
 *   issueEBarimt?: boolean; // ignored; e-Barimt is always auto-issued on full payment
 *   meta?: { ... }          // optional extra info (employeeCode, voucherCode, etc.)
 * }
 */
router.post("/:id/settlement", async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!invoiceId || Number.isNaN(invoiceId)) {
      return res.status(400).json({ error: "Invalid invoice id" });
    }

    const { amount, method, meta } = req.body || {};

    const payAmount = Number(amount || 0);
    if (!payAmount || payAmount <= 0) {
      return res
        .status(400)
        .json({ error: "amount must be a number greater than zero." });
    }

    if (!method || typeof method !== "string" || !method.trim()) {
      return res
        .status(400)
        .json({ error: "method is required for payment." });
    }
    const methodStr = method.trim().toUpperCase();

    // Load invoice with items, payments, and patient info
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        payments: true,
        eBarimtReceipt: true,
        encounter: {
          include: {
            patientBook: {
              include: { patient: true },
            },
            appointment: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Settlement gating: validate appointment status
    if (invoice.encounter?.appointment) {
      const appointmentStatus = invoice.encounter.appointment.status;
      const allowedStatuses = ["ready_to_pay", "partial_paid"];
      
      if (!allowedStatuses.includes(appointmentStatus)) {
        return res.status(400).json({
          error: `Settlement not allowed for appointment status "${appointmentStatus}". Only "ready_to_pay" and "partial_paid" statuses can accept payment.`,
        });
      }
    }

    // NEW: Billing gate - check for unresolved sterilization mismatches
    if (invoice.encounterId) {
      const unresolvedMismatches = await prisma.sterilizationMismatch.findFirst({
        where: {
          encounterId: invoice.encounterId,
          status: "UNRESOLVED",
        },
        select: { id: true },
      });

      if (unresolvedMismatches) {
        return res.status(400).json({
          error: "Төлбөр батлах боломжгүй: Ариутгалын тохиргоо дутуу байна. Эхлээд ариутгалын зөрүүг шийдвэрлэнэ үү.",
          errorCode: "UNRESOLVED_STERILIZATION_MISMATCH",
        });
      }
    }

    // Financial base amount to settle against
    const baseAmount =
      invoice.finalAmount != null
        ? Number(invoice.finalAmount)
        : Number(invoice.totalAmount || 0);

    // B2B validation: block settlement if buyerType=B2B and no buyerTin
    if (invoice.buyerType === "B2B" && !invoice.buyerTin) {
      return res.status(400).json({
        error:
          "B2B баримт гаргахын тулд худалдан авагчийн ТТД шаардлагатай. Нэхэмжлэлд buyerTin оруулна уу.",
        errorCode: "B2B_BUYER_TIN_REQUIRED",
      });
    }

    if (!baseAmount || baseAmount <= 0) {
      return res.status(409).json({
        error:
          "Invoice has no positive final/total amount. Please verify invoice structure first.",
      });
    }

    const alreadyPaid = computePaidTotal(invoice.payments);

    // If already fully paid, don't accept more settlement
    if (alreadyPaid >= baseAmount) {
      return res.status(409).json({
        error:
          "Invoice is already fully paid. Additional settlement is not allowed.",
      });
    }

    // Option A enforcement: if invoice has any PaymentAllocation rows, reject
    // standard (non-split) settlement — caller must use batch-settlement with splitAllocations.
    const hasAllocations = await prisma.paymentAllocation.findFirst({
      where: { invoiceItem: { invoiceId } },
      select: { id: true },
    });
    if (hasAllocations) {
      return res.status(400).json({
        error:
          'Энэ нэхэмжлэл дээр "Хувааж төлөх" ашигласан тул дараагийн төлбөрийг мөн үйлчилгээний мөрөөр хуваарилж бүртгэнэ үү.',
        errorCode: "ALLOCATION_REQUIRED",
      });
    }

    // ─────────────────────────────────────────────────────────────
    // SPECIAL CASE: EMPLOYEE_BENEFIT
    // ─────────────────────────────────────────────────────────────
    if (methodStr === "EMPLOYEE_BENEFIT") {
      const employeeCode =
        meta && typeof meta.employeeCode === "string"
          ? meta.employeeCode.trim()
          : null;

      if (!employeeCode) {
        return res.status(400).json({
          error: "employeeCode is required for EMPLOYEE_BENEFIT.",
        });
      }

      try {
        const result = await prisma.$transaction(async (trx) => {
          const benefit = await trx.employeeBenefit.findFirst({
            where: {
              code: employeeCode,
              isActive: true,
            },
          });

          if (!benefit) {
            throw new Error("Ажилтны код хүчингүй байна.");
          }

          if (benefit.remainingAmount < payAmount) {
            throw new Error(
              "Ажилтны хөнгөлөлтийн үлдэгдэл хүрэлцэхгүй байна."
            );
          }

          // 1) Deduct benefit balance
          await trx.employeeBenefit.update({
            where: { id: benefit.id },
            data: {
              remainingAmount: {
                decrement: payAmount,
              },
            },
          });

          // 2) Record usage
          const bookNumber = invoice.encounter?.patientBook?.bookNumber || null;
          await trx.employeeBenefitUsage.create({
            data: {
              employeeBenefitId: benefit.id,
              invoiceId: invoice.id,
              encounterId: invoice.encounterId,
              amountUsed: payAmount,
              patientId: invoice.patientId,
              patientBookNumber: bookNumber,
            },
          });

          // 3) Apply payment using shared settlement logic
          const { updatedInvoice, paidTotal } = await applyPaymentToInvoice(trx, {
            invoice,
            payAmount,
            methodStr,
            meta,
            createdByUserId: req.user?.id || null,
          });

          return { updatedInvoice, paidTotal };
        });

        const { updatedInvoice, paidTotal } = result;

        return res.json({
          id: updatedInvoice.id,
          branchId: updatedInvoice.branchId,
          encounterId: updatedInvoice.encounterId,
          patientId: updatedInvoice.patientId,
          status: updatedInvoice.statusLegacy,
          totalBeforeDiscount: updatedInvoice.totalBeforeDiscount,
          discountPercent: updatedInvoice.discountPercent,
          collectionDiscountAmount: updatedInvoice.collectionDiscountAmount || 0,
          finalAmount: updatedInvoice.finalAmount,
          totalAmountLegacy: updatedInvoice.totalAmount,
          paidTotal,
          unpaidAmount: Math.max(baseAmount - paidTotal, 0),
          hasEBarimt: !!updatedInvoice.eBarimtReceipt,
          items: updatedInvoice.items.map((it) => ({
            id: it.id,
            itemType: it.itemType,
            serviceId: it.serviceId,
            productId: it.productId,
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            lineTotal: it.lineTotal,
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
        console.error("EMPLOYEE_BENEFIT settlement transaction error:", err);
        return res
          .status(400)
          .json({ error: err.message || "Төлбөр бүртгэхэд алдаа гарлаа." });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // DEFAULT: other methods (CASH, QPAY, POS, TRANSFER, etc.)
    // ─────────────────────────────────────────────────────────────

    // QPAY idempotency check
    if (methodStr === "QPAY") {
      const qpayPaymentId =
        meta && typeof meta.qpayPaymentId === "string"
          ? meta.qpayPaymentId.trim()
          : null;

      if (qpayPaymentId) {
        // Check if payment already exists with this qpayTxnId
        const existingPayment = await prisma.payment.findFirst({
          where: {
            invoiceId,
            qpayTxnId: qpayPaymentId,
          },
        });

        if (existingPayment) {
          // Already settled with this QPay payment ID - return current invoice state
          const currentInvoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
              items: true,
              payments: { include: { createdBy: { select: { id: true, name: true, ovog: true } } } },
              eBarimtReceipt: true,
            },
          });

          if (!currentInvoice) {
            return res.status(404).json({ error: "Invoice not found" });
          }

          const payments = currentInvoice.payments || [];
          const paidTotal = computePaidTotal(payments);

          return res.json({
            id: currentInvoice.id,
            branchId: currentInvoice.branchId,
            encounterId: currentInvoice.encounterId,
            patientId: currentInvoice.patientId,
            status: currentInvoice.statusLegacy,
            totalBeforeDiscount: currentInvoice.totalBeforeDiscount,
            discountPercent: currentInvoice.discountPercent,
            collectionDiscountAmount: currentInvoice.collectionDiscountAmount || 0,
            finalAmount: currentInvoice.finalAmount,
            totalAmountLegacy: currentInvoice.totalAmount,
            paidTotal,
            unpaidAmount: Math.max(baseAmount - paidTotal, 0),
            hasEBarimt: !!currentInvoice.eBarimtReceipt,
            items: currentInvoice.items.map((it) => ({
              id: it.id,
              itemType: it.itemType,
              serviceId: it.serviceId,
              productId: it.productId,
              name: it.name,
              unitPrice: it.unitPrice,
              quantity: it.quantity,
              lineTotal: it.lineTotal,
            })),
            payments: payments.map((p) => ({
              id: p.id,
              amount: p.amount,
              method: p.method,
              timestamp: p.timestamp,
              qpayTxnId: p.qpayTxnId,
              createdByUser: p.createdBy ? { id: p.createdBy.id, name: p.createdBy.name || null, ovog: p.createdBy.ovog || null } : null,
            })),
          });
        }
      }
    }

    const qpayTxnId =
      methodStr === "QPAY" && meta && typeof meta.qpayPaymentId === "string"
        ? meta.qpayPaymentId.trim() || null
        : null;

    const updated = await prisma.$transaction(async (trx) => {
      return applyPaymentToInvoice(trx, {
        invoice,
        payAmount,
        methodStr,
        meta,
        qpayTxnId,
        createdByUserId: req.user?.id || null,
      });
    });

    const { updatedInvoice, paidTotal } = updated;

    return res.json({
      id: updatedInvoice.id,
      branchId: updatedInvoice.branchId,
      encounterId: updatedInvoice.encounterId,
      patientId: updatedInvoice.patientId,
      status: updatedInvoice.statusLegacy,
      totalBeforeDiscount: updatedInvoice.totalBeforeDiscount,
      discountPercent: updatedInvoice.discountPercent,
      collectionDiscountAmount: updatedInvoice.collectionDiscountAmount || 0,
      finalAmount: updatedInvoice.finalAmount,
      totalAmountLegacy: updatedInvoice.totalAmount,
      paidTotal,
      unpaidAmount: Math.max(baseAmount - paidTotal, 0),
      hasEBarimt: !!updatedInvoice.eBarimtReceipt,
      items: updatedInvoice.items.map((it) => ({
        id: it.id,
        itemType: it.itemType,
        serviceId: it.serviceId,
        productId: it.productId,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
      })),
      payments: updatedInvoice.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        timestamp: p.timestamp,
        qpayTxnId: p.qpayTxnId,
        createdByUser: p.createdBy ? { id: p.createdBy.id, name: p.createdBy.name || null, ovog: p.createdBy.ovog || null } : null,
      })),
    });
  } catch (err) {
    console.error("POST /api/invoices/:id/settlement error:", err);
    return res.status(500).json({ error: "Failed to settle invoice payment." });
  }
});

/**
 * PATCH /api/invoices/:id/buyer
 *
 * Update buyer type and TIN for e-Barimt on an invoice.
 * Body: { buyerType: "B2C"|"B2B", buyerTin?: string|null }
 */
router.patch("/:id/buyer", async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!invoiceId || Number.isNaN(invoiceId)) {
      return res.status(400).json({ error: "Invalid invoice id." });
    }

    const { buyerType, buyerTin } = req.body || {};

    if (!buyerType || (buyerType !== "B2C" && buyerType !== "B2B")) {
      return res.status(400).json({ error: "buyerType must be 'B2C' or 'B2B'." });
    }

    if (buyerType === "B2B") {
      const tin = typeof buyerTin === "string" ? buyerTin.trim() : "";
      if (!tin) {
        return res.status(400).json({ error: "buyerTin is required for B2B buyer type." });
      }
      if (!/^\d{11}$/.test(tin) && !/^\d{14}$/.test(tin)) {
        return res
          .status(400)
          .json({ error: "buyerTin must be exactly 11 or 14 digits." });
      }
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { eBarimtReceipt: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found." });
    }

    if (invoice.eBarimtReceipt) {
      return res.status(409).json({
        error: "e-Barimt баримт аль хэдийн гаргасан тул худалдан авагчийн мэдээллийг өөрчлөх боломжгүй.",
      });
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        buyerType,
        buyerTin: buyerType === "B2B" ? (typeof buyerTin === "string" ? buyerTin.trim() : null) : null,
      },
    });

    return res.json({
      id: updatedInvoice.id,
      buyerType: updatedInvoice.buyerType,
      buyerTin: updatedInvoice.buyerTin,
    });
  } catch (err) {
    console.error("PATCH /api/invoices/:id/buyer error:", err);
    return res.status(500).json({ error: "Failed to update buyer info." });
  }
});

export default router;
