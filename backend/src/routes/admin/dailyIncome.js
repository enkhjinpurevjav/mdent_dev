import express from "express";
import prisma from "../../db.js";

const router = express.Router();

/**
 * GET /api/admin/daily-income
 * Returns daily income grouped by payment method for a given date, branch, and optional user.
 *
 * Query params:
 *   date     - required, YYYY-MM-DD
 *   branchId - optional, number
 *   userId   - optional, number (createdByUserId on Payment)
 */
router.get("/daily-income", async (req, res) => {
  try {
    const { date, branchId, userId } = req.query;

    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) {
      return res.status(400).json({ error: "Invalid date format, expected YYYY-MM-DD" });
    }

    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);

    // Build payment where clause
    const paymentWhere = {
      timestamp: {
        gte: dayStart,
        lte: dayEnd,
      },
    };

    if (userId) {
      const uid = Number(userId);
      if (!isNaN(uid)) {
        paymentWhere.createdByUserId = uid;
      }
    }

    // Branch filter is applied via invoice.branchId
    if (branchId) {
      const bid = Number(branchId);
      if (!isNaN(bid)) {
        paymentWhere.invoice = { branchId: bid };
      }
    }

    // Fetch all payments for the day with full related data
    const payments = await prisma.payment.findMany({
      where: paymentWhere,
      include: {
        createdBy: {
          select: { id: true, name: true, ovog: true },
        },
        invoice: {
          select: {
            id: true,
            branchId: true,
            patientId: true,
            encounterId: true,
            finalAmount: true,
            totalAmount: true,
            encounter: {
              select: {
                id: true,
                appointmentId: true,
                visitDate: true,
                patientBook: {
                  select: {
                    patient: {
                      select: {
                        id: true,
                        name: true,
                        ovog: true,
                      },
                    },
                  },
                },
                doctor: {
                  select: {
                    id: true,
                    name: true,
                    ovog: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Fetch active payment method labels
    const methodConfigs = await prisma.paymentMethodConfig.findMany({
      where: { isActive: true },
      select: { key: true, label: true },
    });
    const methodLabelMap = Object.fromEntries(methodConfigs.map((c) => [c.key, c.label]));

    // Group payments by method
    const groupMap = new Map();

    for (const p of payments) {
      const method = p.method || "OTHER";
      if (!groupMap.has(method)) {
        groupMap.set(method, {
          method,
          label: methodLabelMap[method] || method,
          totalAmount: 0,
          count: 0,
          items: [],
        });
      }
      const group = groupMap.get(method);
      const amount = Number(p.amount || 0);
      group.totalAmount += amount;
      group.count += 1;

      const encounter = p.invoice?.encounter;
      const patient = encounter?.patientBook?.patient;
      const doctor = encounter?.doctor;

      group.items.push({
        paymentId: p.id,
        invoiceId: p.invoiceId,
        encounterId: encounter?.id ?? null,
        appointmentId: encounter?.appointmentId ?? null,
        patientId: patient?.id ?? null,
        patientName: patient?.name ?? null,
        patientOvog: patient?.ovog ?? null,
        scheduledAt: encounter?.visitDate ?? null,
        visitDate: encounter?.visitDate ?? null,
        doctorId: doctor?.id ?? null,
        doctorName: doctor?.name ?? null,
        doctorOvog: doctor?.ovog ?? null,
        amount,
        collectedById: p.createdByUserId ?? null,
        collectedByName: p.createdBy?.name ?? null,
        collectedByOvog: p.createdBy?.ovog ?? null,
        paymentTimestamp: p.timestamp,
        meta: p.meta,
      });
    }

    // Convert map to sorted array (maintain payment method config sort order)
    const paymentTypes = Array.from(groupMap.values()).sort((a, b) => {
      const aIdx = methodConfigs.findIndex((c) => c.key === a.method);
      const bIdx = methodConfigs.findIndex((c) => c.key === b.method);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    const grandTotal = paymentTypes.reduce((sum, g) => sum + g.totalAmount, 0);

    return res.json({
      date,
      grandTotal,
      paymentTypes,
    });
  } catch (err) {
    console.error("GET /api/admin/daily-income error:", err);
    return res.status(500).json({ error: "Failed to fetch daily income data" });
  }
});

export default router;
