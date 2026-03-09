import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// POST /api/login
router.post("/", async (req, res) => {
  // Accept both 'username' and 'email' for login flexibility
  const { username, email, password } = req.body;
  const loginEmail = username || email;
  console.log("Login request body:", req.body);

  if (!loginEmail || !password) {
    return res.status(400).json({ error: "Username (email) and password required." });
  }

  // Find user by email
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: loginEmail }
    });
    console.log("Fetched user:", user);
  } catch (err) {
    console.error("DB error during user lookup:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  // User not found or missing password
  if (!user || !user.password) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  // Password check (bcrypt)
  let valid = false;
  try {
    valid = await bcrypt.compare(password, user.password);
  } catch (err) {
    console.error("Error comparing password:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({ error: "Internal server error." });
  }

  // JWT payload and signing
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

  // Response payload
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    },
  });
});

// GET /api/login/me endpoint removed as part of Phase 1 open-mode changes
// Authentication will be added in a future phase

export default router;
