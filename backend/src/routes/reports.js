import { Router } from "express";
import prisma from "../db.js";

const router = Router();

/**
 * GET /api/reports/summary
 * Query: from, to, branchId?, doctorId?, serviceId?, paymentMethod?
 */
router.get("/summary", async (req, res) => {
  try {
    const { from, to, branchId, doctorId, serviceId, paymentMethod } =
      req.query;

    if (!from || !to) {
      return res
        .status(400)
        .json({ error: "from and to query parameters are required" });
    }

    const fromDate = new Date(String(from));
    const toDate = new Date(String(to));
    const toDateEnd = new Date(toDate);
    toDateEnd.setHours(23, 59, 59, 999);

    const branchFilter = branchId ? Number(branchId) : null;
    const doctorFilter = doctorId ? Number(doctorId) : null;
    const serviceFilter = serviceId ? Number(serviceId) : null;
    const paymentMethodFilter =
      typeof paymentMethod === "string" && paymentMethod.trim()
        ? paymentMethod.trim()
        : null;

    // 1) New patients
    const patientWhere = {
      createdAt: {
        gte: fromDate,
        lte: toDateEnd,
      },
    };
    if (branchFilter) {
      patientWhere.branchId = branchFilter;
    }

    const newPatientsCount = await prisma.patient.count({
      where: patientWhere,
    });

    // 2) Encounters
    const encounterWhere = {
      visitDate: {
        gte: fromDate,
        lte: toDateEnd,
      },
    };
    if (branchFilter) {
      encounterWhere.patientBook = {
        patient: {
          branchId: branchFilter,
        },
      };
    }
    if (doctorFilter) {
      encounterWhere.doctorId = doctorFilter;
    }
    if (serviceFilter) {
      encounterWhere.encounterServices = {
        some: { serviceId: serviceFilter },
      };
    }

    const encountersCount = await prisma.encounter.count({
      where: encounterWhere,
    });

    // 3) Invoices
    const invoiceWhere = {
      createdAt: {
        gte: fromDate,
        lte: toDateEnd,
      },
    };

    invoiceWhere.encounter = { AND: [] };

    if (branchFilter) {
      invoiceWhere.encounter.AND.push({
        patientBook: {
          patient: {
            branchId: branchFilter,
          },
        },
      });
    }
    if (doctorFilter) {
      invoiceWhere.encounter.AND.push({
        doctorId: doctorFilter,
      });
    }
    if (serviceFilter) {
      invoiceWhere.encounter.AND.push({
        encounterServices: {
          some: { serviceId: serviceFilter },
        },
      });
    }

    if (invoiceWhere.encounter.AND.length === 0) {
      delete invoiceWhere.encounter;
    }

    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      include: {
        payments: true,
        encounter: {
          include: {
            patientBook: {
              include: { patient: true },
            },
            doctor: true,
          },
        },
      },
    });

    const filteredInvoices = paymentMethodFilter
      ? invoices.filter((inv) =>
          (inv.payments || []).some(
            (p) => p.method === paymentMethodFilter
          )
        )
      : invoices;

    const totalInvoicesCount = filteredInvoices.length;
    const totalInvoiceAmount = filteredInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount || 0),
      0
    );
    const totalPaidAmount = filteredInvoices.reduce((sum, inv) => {
      const invoicePaid = (inv.payments || []).reduce(
        (ps, p) => ps + Number(p.amount || 0),
        0
      );
      return sum + invoicePaid;
    }, 0);
    const totalUnpaidAmount = totalInvoiceAmount - totalPaidAmount;

    // 4) Top doctors
    const revenueByDoctor = {};
    for (const inv of filteredInvoices) {
      const docId = inv.encounter?.doctorId;
      if (!docId) continue;
      if (!revenueByDoctor[docId]) revenueByDoctor[docId] = 0;
      revenueByDoctor[docId] += Number(inv.totalAmount || 0);
    }

    const doctorIds = Object.keys(revenueByDoctor).map((id) => Number(id));
    let topDoctors = [];
    if (doctorIds.length > 0) {
      const doctors = await prisma.user.findMany({
        where: { id: { in: doctorIds } },
        select: { id: true, name: true, ovog: true, email: true },
      });

      topDoctors = doctors
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          ovog: doc.ovog,
          email: doc.email,
          revenue: revenueByDoctor[doc.id] || 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    }

    // 5) Top services
    const encounterIds = filteredInvoices.map((inv) => inv.encounterId);
    let topServices = [];
    if (encounterIds.length > 0) {
      const encounterServices = await prisma.encounterService.findMany({
        where: {
          encounterId: { in: encounterIds },
          ...(serviceFilter ? { serviceId: serviceFilter } : {}),
        },
        include: { service: true },
      });

      const revenueByService = {};
      for (const es of encounterServices) {
        if (!es.service) continue;
        const sid = es.serviceId;
        const lineTotal =
          Number(es.price || 0) * Number(es.quantity || 1);
        if (!revenueByService[sid]) {
          revenueByService[sid] = {
            id: sid,
            name: es.service.name,
            code: es.service.code,
            revenue: 0,
          };
        }
        revenueByService[sid].revenue += lineTotal;
      }

      topServices = Object.values(revenueByService)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    }

    return res.json({
      from: fromDate.toISOString(),
      to: toDateEnd.toISOString(),
      branchId: branchFilter,
      newPatientsCount,
      encountersCount,
      totalInvoicesCount,
      totalInvoiceAmount,
      totalPaidAmount,
      totalUnpaidAmount,
      topDoctors,
      topServices,
    });
  } catch (err) {
    console.error("GET /api/reports/summary error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});

/**
 * GET /api/reports/invoices.csv
 * Query: from, to, branchId?, doctorId?, serviceId?, paymentMethod?
 */
router.get("/invoices.csv", async (req, res) => {
  try {
    const { from, to, branchId, doctorId, serviceId, paymentMethod } =
      req.query;

    if (!from || !to) {
      return res
        .status(400)
        .json({ error: "from and to query parameters are required" });
    }

    const fromDate = new Date(String(from));
    const toDate = new Date(String(to));
    const toDateEnd = new Date(toDate);
    toDateEnd.setHours(23, 59, 59, 999);

    const branchFilter = branchId ? Number(branchId) : null;
    const doctorFilter = doctorId ? Number(doctorId) : null;
    const serviceFilter = serviceId ? Number(serviceId) : null;
    const paymentMethodFilter =
      typeof paymentMethod === "string" && paymentMethod.trim()
        ? paymentMethod.trim()
        : null;

    const invoiceWhere = {
      createdAt: {
        gte: fromDate,
        lte: toDateEnd,
      },
    };

    invoiceWhere.encounter = { AND: [] };

    if (branchFilter) {
      invoiceWhere.encounter.AND.push({
        patientBook: {
          patient: {
            branchId: branchFilter,
          },
        },
      });
    }
    if (doctorFilter) {
      invoiceWhere.encounter.AND.push({
        doctorId: doctorFilter,
      });
    }
    if (serviceFilter) {
      invoiceWhere.encounter.AND.push({
        encounterServices: {
          some: { serviceId: serviceFilter },
        },
      });
    }

    if (invoiceWhere.encounter.AND.length === 0) {
      delete invoiceWhere.encounter;
    }

    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      include: {
        payments: true,
        eBarimtReceipt: true,
        encounter: {
          include: {
            patientBook: {
              include: { patient: true },
            },
            doctor: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const filteredInvoices = paymentMethodFilter
      ? invoices.filter((inv) =>
          (inv.payments || []).some(
            (p) => p.method === paymentMethodFilter
          )
        )
      : invoices;

    const headers = [
      "invoiceId",
      "invoiceDate",
      "branchId",
      "patientRegNo",
      "patientName",
      "doctorName",
      "totalAmount",
      "statusLegacy",
      "paidAmount",
      "paymentMethods",
      "latestPaymentTime",
      "eBarimtReceiptNumber",
      "eBarimtTime",
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes('"') || str.includes(",") || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [headers.join(",")];

    for (const inv of filteredInvoices) {
      const patient = inv.encounter?.patientBook?.patient;
      const doctor = inv.encounter?.doctor;

      const branchIdVal = patient?.branchId ?? "";
      const patientRegNo = patient?.regNo ?? "";
      const patientName = patient
        ? `${patient.ovog ? patient.ovog + " " : ""}${patient.name ?? ""}`
        : "";

      const doctorName = doctor
        ? `${doctor.ovog ? doctor.ovog + " " : ""}${doctor.name ?? ""}`
        : "";

      const paidAmount = (inv.payments || []).reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );
      const paymentMethods = (inv.payments || [])
        .map((p) => p.method)
        .filter(Boolean)
        .join("|");

      const latestPayment = (inv.payments || []).reduce(
        (latest, p) => {
          if (!p.timestamp) return latest;
          const ts = p.timestamp;
          if (!latest || ts > latest) return ts;
          return latest;
        },
        null
      );
      const latestPaymentTime = latestPayment
        ? latestPayment.toISOString()
        : "";

      const eBarimtNumber = inv.eBarimtReceipt?.receiptNumber ?? "";
      const eBarimtTime = inv.eBarimtReceipt?.timestamp
        ? inv.eBarimtReceipt.timestamp.toISOString()
        : "";

      const row = [
        inv.id,
        inv.createdAt.toISOString(),
        branchIdVal,
        patientRegNo,
        patientName,
        doctorName,
        Number(inv.totalAmount || 0),
        inv.statusLegacy || "",
        paidAmount,
        paymentMethods,
        latestPaymentTime,
        eBarimtNumber,
        eBarimtTime,
      ].map(escapeCsv);

      rows.push(row.join(","));
    }

    const csvContent = rows.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoices_${from}_${to}${
        branchFilter ? "_b" + branchFilter : ""
      }${doctorFilter ? "_d" + doctorFilter : ""}${
        serviceFilter ? "_s" + serviceFilter : ""
      }.csv"`
    );

    return res.send(csvContent);
  } catch (err) {
    console.error("GET /api/reports/invoices.csv error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});

/**
 * GET /api/reports/doctor
 * Query: from, to, doctorId (required), branchId?, serviceId?, paymentMethod?
 */
router.get("/doctor", async (req, res) => {
  try {
    const { from, to, doctorId, branchId, serviceId, paymentMethod } =
      req.query;

    if (!from || !to || !doctorId) {
      return res.status(400).json({
        error: "from, to and doctorId query parameters are required",
      });
    }

    const fromDate = new Date(String(from));
    const toDate = new Date(String(to));
    const toDateEnd = new Date(toDate);
    toDateEnd.setHours(23, 59, 59, 999);

    const doctorFilter = Number(doctorId);
    const branchFilter = branchId ? Number(branchId) : null;
    const serviceFilter = serviceId ? Number(serviceId) : null;
    const paymentMethodFilter =
      typeof paymentMethod === "string" && paymentMethod.trim()
        ? paymentMethod.trim()
        : null;

    const doctor = await prisma.user.findUnique({
      where: { id: doctorFilter },
      select: { id: true, name: true, ovog: true, email: true },
    });
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const encounterWhere = {
      doctorId: doctorFilter,
      visitDate: {
        gte: fromDate,
        lte: toDateEnd,
      },
    };
    if (branchFilter) {
      encounterWhere.patientBook = {
        patient: {
          branchId: branchFilter,
        },
      };
    }
    if (serviceFilter) {
      encounterWhere.encounterServices = {
        some: { serviceId: serviceFilter },
      };
    }

    const encounters = await prisma.encounter.findMany({
      where: encounterWhere,
      include: {
        patientBook: {
          include: { patient: true },
        },
        invoice: {
          include: { payments: true },
        },
        encounterServices: {
          include: { service: true },
        },
      },
    });

    const encountersCount = encounters.length;

    const uniquePatientIds = new Set(
      encounters
        .map((e) => e.patientBook?.patient?.id)
        .filter((id) => id !== undefined && id !== null)
    );

    const newPatientsCount = await prisma.patient.count({
      where: {
        id: { in: Array.from(uniquePatientIds) },
        createdAt: { gte: fromDate, lte: toDateEnd },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
    });

    const invoices = encounters
      .map((e) => e.invoice)
      .filter((inv) => !!inv);

    const filteredInvoices = paymentMethodFilter
      ? invoices.filter((inv) =>
          (inv.payments || []).some(
            (p) => p.method === paymentMethodFilter
          )
        )
      : invoices;

    const invoiceCount = filteredInvoices.length;
    const totalInvoiceAmount = filteredInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount || 0),
      0
    );
    const totalPaidAmount = filteredInvoices.reduce((sum, inv) => {
      const paid = (inv.payments || []).reduce(
        (ps, p) => ps + Number(p.amount || 0),
        0
      );
      return sum + paid;
    }, 0);
    const totalUnpaidAmount = totalInvoiceAmount - totalPaidAmount;

    const allEncounterServices = encounters.flatMap(
      (e) => e.encounterServices || []
    );
    const filteredEncounterServices = serviceFilter
      ? allEncounterServices.filter((es) => es.serviceId === serviceFilter)
      : allEncounterServices;

    const servicesMap = {};
    for (const es of filteredEncounterServices) {
      if (!es.service) continue;
      const sid = es.serviceId;
      if (!servicesMap[sid]) {
        servicesMap[sid] = {
          serviceId: sid,
          code: es.service.code,
          name: es.service.name,
          totalQuantity: 0,
          revenue: 0,
        };
      }
      const qty = Number(es.quantity || 1);
      const lineTotal = Number(es.price || 0) * qty;
      servicesMap[sid].totalQuantity += qty;
      servicesMap[sid].revenue += lineTotal;
    }

    const services = Object.values(servicesMap).sort(
      (a, b) => b.revenue - a.revenue
    );

    const dailyMap = {};
    for (const e of encounters) {
      const day = e.visitDate.toISOString().slice(0, 10);
      if (!dailyMap[day]) {
        dailyMap[day] = {
          date: day,
          encounters: 0,
          revenue: 0,
        };
      }
      dailyMap[day].encounters += 1;

      const inv = e.invoice;
      if (inv) {
        const hasMethod =
          !paymentMethodFilter ||
          (inv.payments || []).some(
            (p) => p.method === paymentMethodFilter
          );
        if (hasMethod) {
          dailyMap[day].revenue += Number(inv.totalAmount || 0);
        }
      }
    }

    const daily = Object.values(dailyMap).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );

    return res.json({
      doctor,
      from: fromDate.toISOString(),
      to: toDateEnd.toISOString(),
      branchId: branchFilter,
      totals: {
        encountersCount,
        invoiceCount,
        totalInvoiceAmount,
        totalPaidAmount,
        totalUnpaidAmount,
        newPatientsCount,
      },
      services,
      daily,
    });
  } catch (err) {
    console.error("GET /api/reports/doctor error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});

/**
 * GET /api/reports/branches
 * Query: from, to
 * Optional: doctorId?, serviceId?, paymentMethod?
 *
 * Returns per-branch metrics for the selected period.
 */
router.get("/branches", async (req, res) => {
  try {
    const { from, to, doctorId, serviceId, paymentMethod } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "from and to query parameters are required",
      });
    }

    const fromDate = new Date(String(from));
    const toDate = new Date(String(to));
    const toDateEnd = new Date(toDate);
    toDateEnd.setHours(23, 59, 59, 999);

    const doctorFilter = doctorId ? Number(doctorId) : null;
    const serviceFilter = serviceId ? Number(serviceId) : null;
    const paymentMethodFilter =
      typeof paymentMethod === "string" && paymentMethod.trim()
        ? paymentMethod.trim()
        : null;

    const branches = await prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    const results = [];

    for (const branch of branches) {
      const branchIdVal = branch.id;

      // Patients for this branch
      const patientWhere = {
        createdAt: {
          gte: fromDate,
          lte: toDateEnd,
        },
        branchId: branchIdVal,
      };

      const newPatientsCount = await prisma.patient.count({
        where: patientWhere,
      });

      // Encounters for this branch
      const encounterWhere = {
        visitDate: {
          gte: fromDate,
          lte: toDateEnd,
        },
        patientBook: {
          patient: {
            branchId: branchIdVal,
          },
        },
      };

      if (doctorFilter) {
        encounterWhere.doctorId = doctorFilter;
      }
      if (serviceFilter) {
        encounterWhere.encounterServices = {
          some: { serviceId: serviceFilter },
        };
      }

      const encountersCount = await prisma.encounter.count({
        where: encounterWhere,
      });

      // Invoices via encounters for this branch
      const invoiceWhere = {
        createdAt: {
          gte: fromDate,
          lte: toDateEnd,
        },
        encounter: {
          patientBook: {
            patient: {
              branchId: branchIdVal,
            },
          },
        },
      };

      if (doctorFilter) {
        invoiceWhere.encounter.doctorId = doctorFilter;
      }
      if (serviceFilter) {
        invoiceWhere.encounter.encounterServices = {
          some: { serviceId: serviceFilter },
        };
      }

      const invoices = await prisma.invoice.findMany({
        where: invoiceWhere,
        include: {
          payments: true,
        },
      });

      const filteredInvoices = paymentMethodFilter
        ? invoices.filter((inv) =>
            (inv.payments || []).some(
              (p) => p.method === paymentMethodFilter
            )
          )
        : invoices;

      const invoiceCount = filteredInvoices.length;

      const totalInvoiceAmount = filteredInvoices.reduce(
        (sum, inv) => sum + Number(inv.totalAmount || 0),
        0
      );
      const totalPaidAmount = filteredInvoices.reduce((sum, inv) => {
        const paid = (inv.payments || []).reduce(
          (ps, p) => ps + Number(p.amount || 0),
          0
        );
        return sum + paid;
      }, 0);
      const totalUnpaidAmount = totalInvoiceAmount - totalPaidAmount;

      results.push({
        branchId: branchIdVal,
        branchName: branch.name,
        newPatientsCount,
        encountersCount,
        invoiceCount,
        totalInvoiceAmount,
        totalPaidAmount,
        totalUnpaidAmount,
      });
    }

    return res.json({
      from: fromDate.toISOString(),
      to: toDateEnd.toISOString(),
      branches: results,
    });
  } catch (err) {
    console.error("GET /api/reports/branches error:", err);
    res.status(500).json({ error: "internal server error" });
  }
});

// GET /api/reports/daily-revenue?date=YYYY-MM-DD&branchId=optional
router.get("/daily-revenue", async (req, res) => {
  try {
    const { date, branchId } = req.query;

    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) {
      return res.status(400).json({ error: "invalid date format" });
    }

    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);

    const whereInvoice = {
      createdAt: {
        gte: start,
        lte: end,
      },
      statusLegacy: "paid",
    };

    if (branchId) {
      const bid = Number(branchId);
      if (!Number.isNaN(bid)) {
        whereInvoice.encounter = {
          patientBook: {
            patient: {
              branchId: bid,
            },
          },
        };
      }
    }

    const result = await prisma.invoice.aggregate({
      _sum: {
        totalAmount: true,
      },
      where: whereInvoice,
    });

    const total = result._sum.totalAmount || 0;
    return res.json({ total });
  } catch (err) {
    console.error("GET /api/reports/daily-revenue error:", err);
    return res
      .status(500)
      .json({ error: "failed to compute daily revenue" });
  }
});

/**
 * GET /api/reports/clinic
 * Clinic-level report for the Эмнэлэг page.
 * Query: from (YYYY-MM-DD), to (YYYY-MM-DD), branchId? (number)
 *
 * Returns:
 *  - topCards: { todayRevenue, todayOccupancyPct, monthlyAvgRevenue }
 *  - dailyData: [{ date, revenue, occupancyPct, doctorCount, completedAppointments }]
 *  - branchBreakdown: {
 *      revenue: [{ branchId, branchName, value }],
 *      occupancy: [...],
 *      doctorCount: [...],
 *      completedAppointments: [...],
 *    }
 *  - doctorBreakdown: same shape but per-doctor (only when branchId filter is set)
 */
router.get("/clinic", async (req, res) => {
  try {
    const { from, to, branchId } = req.query;

    if (!from || !to) {
      return res
        .status(400)
        .json({ error: "from and to query parameters are required" });
    }

    const [fy, fm, fd] = String(from).split("-").map(Number);
    const [ty, tm, td] = String(to).split("-").map(Number);

    const fromDate = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const toDate = new Date(ty, tm - 1, td, 23, 59, 59, 999);

    const branchFilter = branchId ? Number(branchId) : null;

    // ---------- helper: iterate dates ----------
    function eachDay(start, end) {
      const days = [];
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      const last = new Date(end);
      last.setHours(0, 0, 0, 0);
      while (cur <= last) {
        days.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    }

    // ---------- helper: parse "HH:MM" to minutes since midnight ----------
    function hmToMin(hm) {
      if (!hm || typeof hm !== "string") return 0;
      const [h, m] = hm.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    }

    // ---------- fetch all branches ----------
    const allBranches = await prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    const targetBranches = branchFilter
      ? allBranches.filter((b) => b.id === branchFilter)
      : allBranches;

    const branchIds = targetBranches.map((b) => b.id);

    // ---------- fetch invoices (revenue) ----------
    const invoices = await prisma.invoice.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
        statusLegacy: "paid",
        encounter: {
          patientBook: {
            patient: { branchId: { in: branchIds } },
          },
        },
      },
      select: {
        totalAmount: true,
        createdAt: true,
        encounter: {
          select: {
            doctorId: true,
            patientBook: {
              select: { patient: { select: { branchId: true } } },
            },
          },
        },
      },
    });

    // ---------- fetch appointments (status, count, occupancy) ----------
    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: fromDate, lte: toDate },
        branchId: { in: branchIds },
      },
      select: {
        id: true,
        branchId: true,
        doctorId: true,
        scheduledAt: true,
        endAt: true,
        status: true,
      },
    });

    // ---------- fetch doctor schedules (for occupancy & doctor count) ----------
    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
        branchId: { in: branchIds },
      },
      select: {
        doctorId: true,
        branchId: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    // ---------- pre-group by date ----------
    // invoices by date
    const invoiceByDate = {};
    const invoiceByBranch = {};
    const invoiceByDoctor = {};
    for (const inv of invoices) {
      const date = inv.createdAt.toISOString().slice(0, 10);
      const bId = inv.encounter?.patientBook?.patient?.branchId;
      const dId = inv.encounter?.doctorId;
      const amt = Number(inv.totalAmount || 0);

      invoiceByDate[date] = (invoiceByDate[date] || 0) + amt;
      if (bId) invoiceByBranch[bId] = (invoiceByBranch[bId] || 0) + amt;
      if (dId) invoiceByDoctor[dId] = (invoiceByDoctor[dId] || 0) + amt;
    }

    // completed appointments by date
    const completedByDate = {};
    const completedByBranch = {};
    const completedByDoctor = {};
    for (const appt of appointments) {
      const s = appt.status?.toLowerCase();
      if (s !== "completed") continue;
      const date = appt.scheduledAt.toISOString().slice(0, 10);
      completedByDate[date] = (completedByDate[date] || 0) + 1;
      completedByBranch[appt.branchId] =
        (completedByBranch[appt.branchId] || 0) + 1;
      if (appt.doctorId)
        completedByDoctor[appt.doctorId] =
          (completedByDoctor[appt.doctorId] || 0) + 1;
    }

    // schedules: available minutes and unique doctors per date/branch
    const schedByDate = {}; // date -> { availMins, doctorSet, branchSet }
    const schedByBranch = {}; // branchId -> { availMins, doctorSet }
    const schedByDoctor = {}; // doctorId -> { availMins, scheduledDays }
    for (const sch of schedules) {
      const date = sch.date instanceof Date
        ? sch.date.toISOString().slice(0, 10)
        : String(sch.date).slice(0, 10);
      const avail = hmToMin(sch.endTime) - hmToMin(sch.startTime);
      if (avail <= 0) continue;

      if (!schedByDate[date]) {
        schedByDate[date] = { availMins: 0, doctorSet: new Set() };
      }
      schedByDate[date].availMins += avail;
      schedByDate[date].doctorSet.add(sch.doctorId);

      if (!schedByBranch[sch.branchId]) {
        schedByBranch[sch.branchId] = { availMins: 0, doctorSet: new Set() };
      }
      schedByBranch[sch.branchId].availMins += avail;
      schedByBranch[sch.branchId].doctorSet.add(sch.doctorId);

      if (!schedByDoctor[sch.doctorId]) {
        schedByDoctor[sch.doctorId] = { availMins: 0, scheduledDays: 0 };
      }
      schedByDoctor[sch.doctorId].availMins += avail;
      schedByDoctor[sch.doctorId].scheduledDays += 1;
    }

    // booked appointment minutes per date/branch/doctor
    const bookedByDate = {};
    const bookedByBranch = {};
    const bookedByDoctor = {};
    const DEFAULT_SLOT = 30; // minutes if endAt is null
    for (const appt of appointments) {
      const s = appt.status?.toLowerCase();
      if (s === "cancelled" || s === "no_show") continue;
      const date = appt.scheduledAt.toISOString().slice(0, 10);
      let mins = DEFAULT_SLOT;
      if (appt.endAt) {
        const diff =
          (new Date(appt.endAt).getTime() -
            new Date(appt.scheduledAt).getTime()) /
          60000;
        if (diff > 0) mins = diff;
      }
      bookedByDate[date] = (bookedByDate[date] || 0) + mins;
      bookedByBranch[appt.branchId] =
        (bookedByBranch[appt.branchId] || 0) + mins;
      if (appt.doctorId)
        bookedByDoctor[appt.doctorId] =
          (bookedByDoctor[appt.doctorId] || 0) + mins;
    }

    // ---------- daily data array ----------
    const days = eachDay(fromDate, toDate);
    const dailyData = days.map((date) => {
      const revenue = invoiceByDate[date] || 0;
      const availMins = schedByDate[date]?.availMins || 0;
      const bookedMins = bookedByDate[date] || 0;
      const occupancyPct =
        availMins > 0 ? Math.round((bookedMins / availMins) * 100) : 0;
      const doctorCount = schedByDate[date]?.doctorSet?.size || 0;
      const completedAppointments = completedByDate[date] || 0;
      return { date, revenue, occupancyPct, doctorCount, completedAppointments };
    });

    // ---------- branch breakdowns ----------
    const branchBreakdown = {
      revenue: targetBranches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        value: invoiceByBranch[b.id] || 0,
      })),
      occupancy: targetBranches.map((b) => {
        const avail = schedByBranch[b.id]?.availMins || 0;
        const booked = bookedByBranch[b.id] || 0;
        return {
          branchId: b.id,
          branchName: b.name,
          value: avail > 0 ? Math.round((booked / avail) * 100) : 0,
        };
      }),
      doctorCount: targetBranches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        value: schedByBranch[b.id]?.doctorSet?.size || 0,
      })),
      completedAppointments: targetBranches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        value: completedByBranch[b.id] || 0,
      })),
    };

    // ---------- doctor breakdowns (only if branch is filtered) ----------
    let doctorBreakdown = null;
    if (branchFilter) {
      // get doctor names
      const doctorIds = [
        ...new Set([
          ...Object.keys(invoiceByDoctor).map(Number),
          ...Object.keys(completedByDoctor).map(Number),
          ...Object.keys(schedByDoctor).map(Number),
        ]),
      ];
      const doctorRecords =
        doctorIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: doctorIds } },
              select: { id: true, name: true, ovog: true },
            })
          : [];
      const docMap = {};
      for (const d of doctorRecords) docMap[d.id] = d;

      doctorBreakdown = {
        revenue: doctorIds.map((dId) => ({
          doctorId: dId,
          doctorName: docMap[dId]
            ? [docMap[dId].ovog, docMap[dId].name].filter(Boolean).join(" ")
            : `Эмч #${dId}`,
          value: invoiceByDoctor[dId] || 0,
        })),
        occupancy: doctorIds.map((dId) => {
          const avail = schedByDoctor[dId]?.availMins || 0;
          const booked = bookedByDoctor[dId] || 0;
          return {
            doctorId: dId,
            doctorName: docMap[dId]
              ? [docMap[dId].ovog, docMap[dId].name].filter(Boolean).join(" ")
              : `Эмч #${dId}`,
            value: avail > 0 ? Math.round((booked / avail) * 100) : 0,
          };
        }),
        doctorCount: doctorIds.map((dId) => ({
          doctorId: dId,
          doctorName: docMap[dId]
            ? [docMap[dId].ovog, docMap[dId].name].filter(Boolean).join(" ")
            : `Эмч #${dId}`,
          value: schedByDoctor[dId]?.scheduledDays || 0,
        })),
        completedAppointments: doctorIds.map((dId) => ({
          doctorId: dId,
          doctorName: docMap[dId]
            ? [docMap[dId].ovog, docMap[dId].name].filter(Boolean).join(" ")
            : `Эмч #${dId}`,
          value: completedByDoctor[dId] || 0,
        })),
      };
    }

    // ---------- top cards ----------
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // today's revenue
    const todayRevenue = invoiceByDate[todayStr] || 0;

    // today's occupancy
    const todayAvail = schedByDate[todayStr]?.availMins || 0;
    const todayBooked = bookedByDate[todayStr] || 0;
    const todayOccupancyPct =
      todayAvail > 0 ? Math.round((todayBooked / todayAvail) * 100) : 0;

    // monthly average: days 1..today for the current month that are within the requested range
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStart = firstOfMonth > fromDate ? firstOfMonth : fromDate;
    const monthEnd = today < toDate ? today : toDate;
    const monthDays = eachDay(monthStart, monthEnd);
    const monthTotal = monthDays.reduce(
      (sum, d) => sum + (invoiceByDate[d] || 0),
      0
    );
    const monthlyAvgRevenue =
      monthDays.length > 0 ? Math.round(monthTotal / monthDays.length) : 0;

    return res.json({
      topCards: {
        todayRevenue,
        todayOccupancyPct,
        monthlyAvgRevenue,
      },
      dailyData,
      branchBreakdown,
      doctorBreakdown,
    });
  } catch (err) {
    console.error("GET /api/reports/clinic error:", err);
    return res.status(500).json({ error: "internal server error" });
  }
});

export default router;
