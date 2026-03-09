import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import prisma from "../db.js";

const router = Router();

// Rate limit: max 10 login attempts per 15 minutes per IP
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

const COOKIE_NAME = "access_token";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    domain: process.env.COOKIE_DOMAIN || (isProd ? "mdent.cloud" : undefined),
    path: "/",
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

// POST /api/auth/login
router.post("/login", loginRateLimit, async (req, res) => {
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
    if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$") || user.password.startsWith("$2y$")) {
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
    },
    secret,
    { expiresIn: "8h" }
  );

  res.cookie(COOKIE_NAME, token, cookieOptions());

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
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
      },
    });
  } catch (err) {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
    return res.status(401).json({ error: "Invalid or expired token." });
  }
});

export default router;
