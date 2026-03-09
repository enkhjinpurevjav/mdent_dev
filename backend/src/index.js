import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "./db.js";
import incomeRoutes from "./routes/admin/income.js";

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
import doctorsRouter from "./routes/doctors.js";
import bookingsRouter from "./routes/bookings.js";
import staffSummaryRoutes from "./routes/staff-summary.js";
import invoicesRouter from "./routes/invoices.js";
import sterilizationRouter from "./routes/sterilization.js";
import employeeBenefitsRouter from "./routes/employeeBenefits.js";
import reportsPatientBalancesRouter from "./routes/reports-patient-balances.js";
import inventoryRouter from "./routes/inventory.js";
import staffIncomeSettingsRouter from "./routes/admin/staffIncomeSettings.js";

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
import authRouter from "./routes/auth.js";
import { authenticateJWT, requireRole } from "./middleware/auth.js";
import rateLimit from "express-rate-limit";

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/**
 * IMPORTANT: This backend runs behind Caddy (reverse proxy) which sets
 * X-Forwarded-For / X-Forwarded-Proto.
 *
 * - Needed for correct req.ip
 * - Required by express-rate-limit to avoid ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
 */
app.set("trust proxy", 1);

// Cookie name used for JWT — must match the value in routes/auth.js
const COOKIE_NAME_FOR_CSRF = "access_token";

app.use(helmet());
app.use(express.json());

// CORS: use allowlist from env for cookie-based auth compatibility
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : ["https://mdent.cloud"];

app.use(
  cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

app.use(cookieParser());

// CSRF protection: for state-changing methods, validate Origin or Referer header
// against the allowed CORS origins. sameSite=lax already prevents most CSRF,
// but this provides defense-in-depth for cookie-authenticated requests.
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use("/api", (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  // Only enforce when a cookie is present (i.e., cookie-authenticated request)
  if (!req.cookies?.[COOKIE_NAME_FOR_CSRF]) return next();

  const origin = req.headers.origin || req.headers.referer || "";
  const allowed = corsOrigins;
  const valid = allowed.some((o) => origin === o || origin.startsWith(o + "/"));
  if (!valid) {
    return res.status(403).json({ error: "CSRF validation failed." });
  }

  next();
});

// General API rate limiter — applied to all /api routes
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api", apiRateLimit);

// Serve uploaded media files
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

// Wire routers
// Auth routes (public — must be before global auth middleware)
app.use("/api/auth", authRouter);

// Public routes (no auth)
app.use("/api/public", publicRouter);

// Global auth middleware: protects all /api/* routes except /api/auth/* and /api/public/*
app.use("/api", (req, res, next) => {
  // Skip /api/auth and /api/public (already handled by their routers above)
  if (req.path.startsWith("/auth")) return next();
  if (req.path.startsWith("/public")) return next();
  return authenticateJWT(req, res, next);
});

// RBAC: /api/users and /api/admin/* require admin or super_admin
const requireAdminRole = requireRole("admin", "super_admin");
app.use("/api/users", requireAdminRole);
app.use("/api/admin", requireAdminRole);

// Existing routers
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

// Admin routes
app.use("/api/admin", employeeBenefitsRouter);
app.use("/api/admin", incomeRoutes);

app.use("/api/doctors", doctorsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/diagnoses", diagnosesRouter);
app.use("/api", diagnosisProblemsRouter);
app.use("/api/reception", receptionRoutes);
app.use("/api/staff/summary", staffSummaryRoutes);

app.use("/api/payment-settings", paymentSettingsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/admin", adminRouter);

// QPay integration
app.use("/api/qpay", qpayRouter);

// Encounter-related routes
app.use("/api/encounter-diagnoses", encounterDiagnosesRouter);
app.use("/api/encounter-services", encounterServicesRouter);
app.use(
  "/api/encounter-diagnosis-problem-texts",
  encounterDiagnosisProblemTextsRouter
);
app.use("/api/encounter-service-texts", encounterServiceTextsRouter);

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
