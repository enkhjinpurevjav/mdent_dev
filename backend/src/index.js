import express from "express";
import cors from "cors";
import helmet from "helmet";
import pino from "pino";
import path from "path"; // NEW
import { fileURLToPath } from "url";
import prisma from "./db.js";
import incomeRoutes from "./routes/admin/income.js"; // NEW

import branchesRouter from "./routes/branches.js";
import patientsRouter from "./routes/patients.js";
import loginRouter from "./routes/login.js";
import usersRouter from "./routes/users.js";
import employeesRouter from "./routes/employees.js";
import encountersRouter from "./routes/encounters.js";
import billingRouter from "./routes/billing.js";
import appointmentsRouter from "./routes/appointments.js";
import servicesRouter from "./routes/services.js";
import reportsRouter from "./routes/reports.js";
// NEW: scheduled doctors
import doctorsRouter from "./routes/doctors.js";
import bookingsRouter from "./routes/bookings.js";
import staffSummaryRoutes from "./routes/staff-summary.js";
import invoicesRouter from "./routes/invoices.js";
import sterilizationRouter from "./routes/sterilization.js";
// FIX: use import instead of require
import employeeBenefitsRouter from "./routes/employeeBenefits.js";
import reportsPatientBalancesRouter from "./routes/reports-patient-balances.js";
import inventoryRouter from "./routes/inventory.js";
import staffIncomeSettingsRouter from "./routes/admin/staffIncomeSettings.js";


// NEW: diagnoses
import diagnosesRouter from "./routes/diagnoses.js";
import diagnosisProblemsRouter from "./routes/diagnosisProblems.js";
import receptionRoutes from "./routes/reception.js";
import regnoRouter from "./routes/regno.js";
import paymentSettingsRouter from "./routes/payment-settings.js";
import adminRouter from "./routes/admin.js";
import qpayRouter from "./routes/qpay.js";
import settingsRouter from "./routes/settings.js";
import encounterDiagnosesRouter from "./routes/encounterDiagnoses.js";
import encounterServicesRouter from "./routes/encounterServices.js";
import encounterDiagnosisProblemTextsRouter from "./routes/encounterDiagnosisProblemTexts.js";
import encounterServiceTextsRouter from "./routes/encounterServiceTexts.js";
import publicRouter from "./routes/public.js";
import ebarimtRouter from "./routes/ebarimt.js";
import uploadsRouter from "./routes/uploads.js";

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(helmet());
app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

// NEW: serve uploaded media files
const mediaDir = process.env.MEDIA_UPLOAD_DIR || "/data/media";
app.use("/media", express.static(mediaDir));

// Serve staff photo uploads
const uploadsDir = path.resolve(__dirname, "../uploads");
app.use("/uploads", express.static(uploadsDir));

// Health (non-API path)
app.get("/health", async (_req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({
    ok: true,
    service: "mdent-backend",
    time: new Date().toISOString(),
    db: dbOk,
  });
});

// Wire routers — do not define handlers inline here
app.use("/api/login", loginRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/users", usersRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/encounters", encountersRouter);
app.use("/api/billing", billingRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/reports", reportsPatientBalancesRouter);
app.use("/api", sterilizationRouter);
app.use("/api/regno", regnoRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/admin", staffIncomeSettingsRouter);

// add this (NEW) so GET /api/admin/employee-benefits works
app.use("/api/admin", employeeBenefitsRouter);
// Wire admin income routes
app.use("/api/admin", incomeRoutes);

// NEW
app.use("/api/doctors", doctorsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/diagnoses", diagnosesRouter);
app.use("/api", diagnosisProblemsRouter);
app.use("/api/reception", receptionRoutes);
app.use("/api/staff/summary", staffSummaryRoutes);

// NEW: payment settings
app.use("/api/payment-settings", paymentSettingsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/admin", adminRouter);

// QPay integration
app.use("/api/qpay", qpayRouter);

// Encounter-related routes at root /api level
app.use("/api/encounter-diagnoses", encounterDiagnosesRouter);
app.use("/api/encounter-services", encounterServicesRouter);
app.use("/api/encounter-diagnosis-problem-texts", encounterDiagnosisProblemTextsRouter);
app.use("/api/encounter-service-texts", encounterServiceTextsRouter);

// Public routes (no auth)
app.use("/api/public", publicRouter);

// eBarimt POSAPI 3.0 routes
app.use("/api/ebarimt", ebarimtRouter);

// File upload routes
app.use("/api/uploads", uploadsRouter);

// Optional central error handler
app.use((err, _req, res, _next) => {
  log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "internal server error" });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  log.info({ port }, "Backend listening");
  if (process.env.RUN_SEED === "true") {
    log.warn("RUN_SEED=true – seed placeholder.");
  }
});

export default app;
