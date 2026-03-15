import { Router } from "express";
import crypto from "crypto";
import prisma from "../../db.js";
import { sendPasswordResetEmail } from "../../services/mailer.js";

const router = Router();

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/admin/users/:id/password-reset
 * Admin-triggered password reset link — sends reset email to the target user.
 * Requires admin or super_admin role (enforced by global middleware in index.js).
 */
router.post("/:id/password-reset", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { id: userId } });
  } catch (err) {
    console.error("DB error during admin password-reset:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  try {
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
  } catch (err) {
    console.error("Error during admin password-reset:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  return res.json({ ok: true });
});

export default router;
