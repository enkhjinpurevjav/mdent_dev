import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import prisma from "../db.js";
import { sendPasswordResetEmail } from "../services/mailer.js";
import { authenticateJWT } from "../middleware/auth.js";

const router = Router();

// ---------------------------------------------------------------------------
// Login rate limiting — dual-layer protection
//
// Layer 1 (applied first): per-IP backstop
//   Prevents one IP from trying many different email addresses.
//   Threshold is high enough that a whole clinic sharing one public IP
//   won't be locked out during normal use (100 attempts / 15 min).
//
// Layer 2: per (IP + email)
//   Prevents brute-force against a single account.
//   Uses a keyGenerator that normalises the email so that different
//   capitalisation / whitespace variations still count as one key.
//   Falls back to "${ip}:no-email" when no email is provided.
//
// NOTE (IPv6): Use express-rate-limit's ipKeyGenerator helper for IPv6-safe keys.
// ---------------------------------------------------------------------------

// Layer 1 — IP backstop: 100 attempts per 15 minutes per IP
const ipBackstopRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

// Layer 2 — per (IP + email): 10 attempts per 15 minutes
const ipEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
  keyGenerator: (req) => {
    const raw = req.body?.email || req.body?.username || "";
    const email = raw.trim().toLowerCase() || "no-email";
    // Use "||" separator — pipe is invalid in both email addresses and IP
    // addresses, so the parts cannot be manipulated to collide with another
    // (ip, email) pair.
    //
    // IMPORTANT: Use ipKeyGenerator(req) instead of req.ip to avoid IPv6 bypass.
    return `${ipKeyGenerator(req)}||${email}`;
  },
});

const COOKIE_NAME = "access_token";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  // Use leading-dot domain in production so the cookie is valid for both
  // mdent.cloud and any subdomains (e.g. api.mdent.cloud).
  // COOKIE_DOMAIN env var overrides the default when set explicitly.
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    domain: process.env.COOKIE_DOMAIN || (isProd ? ".mdent.cloud" : undefined),
    path: "/",
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

// POST /api/auth/login
router.post("/login", ipBackstopRateLimit, ipEmailRateLimit, async (req, res) => {
  const { email, username, password } = req.body;
  const loginEmail = email || username;

  if (!loginEmail || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email: loginEmail } });
  } catch (err) {
    console.error("DB error during login:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  if (!user || !user.password) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  // Support both bcrypt-hashed and legacy plaintext passwords
  let valid = false;
  try {
    if (
      user.password.startsWith("$2a$") ||
      user.password.startsWith("$2b$") ||
      user.password.startsWith("$2y$")
    ) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = password === user.password;
      // Upgrade plaintext password to bcrypt on successful login
      if (valid) {
        const hashed = await bcrypt.hash(password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashed },
        });
      }
    }
  } catch (err) {
    console.error("Error during password check:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("JWT_SECRET is not set");
    return res.status(500).json({ error: "Internal server error." });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      ovog: user.ovog ?? null,
    },
    secret,
    { expiresIn: "8h" }
  );

  const opts = cookieOptions();
  res.cookie(COOKIE_NAME, token, opts);
  console.info(
    `[auth] login ok — user=${user.id} role=${user.role} cookieDomain=${opts.domain ?? "(none)"} secure=${opts.secure}`
  );

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      ovog: user.ovog ?? null,
    },
  });
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    ...cookieOptions(),
    maxAge: 0,
  });
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Internal server error." });
  }

  try {
    const user = jwt.verify(token, secret);
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        ovog: user.ovog ?? null,
      },
    });
  } catch (err) {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
    return res.status(401).json({ error: "Invalid or expired token." });
  }
});

// Rate limit: max 5 password reset requests per 15 minutes per IP
const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// POST /api/auth/password-reset/request
router.post("/password-reset/request", passwordResetRateLimit, async (req, res) => {
  const { email } = req.body;

  // Always respond 200 to avoid user enumeration
  if (!email) {
    return res.json({ ok: true });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      // Invalidate previous unused tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      await sendPasswordResetEmail(user.email, rawToken);
    }
  } catch (err) {
    console.error("Error during password reset request:", err);
  }

  return res.json({ ok: true });
});

// POST /api/auth/password-reset/confirm
router.post("/password-reset/confirm", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const tokenHash = hashToken(token);

  let resetToken;
  try {
    resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
  } catch (err) {
    console.error("DB error during password reset confirm:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt.getTime() < Date.now()
  ) {
    return res.status(400).json({ error: "Invalid or expired reset token." });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashed },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);
  } catch (err) {
    console.error("Error during password reset confirm:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  return res.json({ ok: true });
});

// POST /api/auth/change-password  (requires authentication)
router.post("/change-password", authenticateJWT, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword) {
    return res.status(400).json({ error: "Одоогийн нууц үгийг оруулна уу." });
  }
  if (!newPassword) {
    return res.status(400).json({ error: "Шинэ нууц үгийг оруулна уу." });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: "Шинэ нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.",
    });
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { id: req.user.id } });
  } catch (err) {
    console.error("DB error during change-password:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  if (!user || !user.password) {
    return res.status(400).json({ error: "Хэрэглэгч олдсонгүй." });
  }

  let valid = false;
  try {
    if (
      user.password.startsWith("$2a$") ||
      user.password.startsWith("$2b$") ||
      user.password.startsWith("$2y$")
    ) {
      valid = await bcrypt.compare(currentPassword, user.password);
    } else {
      valid = currentPassword === user.password;
    }
  } catch (err) {
    console.error("Error during password compare:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  if (!valid) {
    return res.status(400).json({ error: "Одоогийн нууц үг буруу байна." });
  }

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed },
    });
  } catch (err) {
    console.error("Error during change-password update:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  return res.json({ ok: true });
});

export default router;
