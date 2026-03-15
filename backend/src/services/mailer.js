import nodemailer from "nodemailer";

/**
 * Creates a nodemailer transporter from environment variables.
 *
 * Required env vars:
 *   SMTP_HOST     - SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT     - SMTP port (e.g. 465 or 587)
 *   SMTP_SECURE   - "true" for TLS (port 465), omit or "false" for STARTTLS (port 587)
 *   SMTP_USER     - SMTP username / email address
 *   SMTP_PASS     - SMTP password or Gmail App Password
 *
 * Optional:
 *   SMTP_FROM_NAME   - Display name for From address (default: "mDent")
 *   SMTP_FROM_EMAIL  - From email address (default: SMTP_USER)
 *   APP_URL          - Base URL for reset links (default: https://mdent.cloud)
 */
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/**
 * Returns the configured "From" address string.
 */
function getFromAddress() {
  const name = process.env.SMTP_FROM_NAME || "mDent";
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "";
  return `"${name}" <${email}>`;
}

/**
 * Sends a password reset email.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} rawToken - The raw (un-hashed) reset token
 * @returns {Promise<boolean>} true if sent, false if SMTP not configured
 */
export async function sendPasswordResetEmail(toEmail, rawToken) {
  const transporter = createTransporter();

  if (!transporter) {
    const baseUrl = process.env.APP_URL || "https://mdent.cloud";
    const resetLink = `${baseUrl}/reset-password?token=${rawToken}`;
    console.log(`[mailer] SMTP not configured. Reset link for ${toEmail}: ${resetLink}`);
    return false;
  }

  const baseUrl = process.env.APP_URL || "https://mdent.cloud";
  const resetLink = `${baseUrl}/reset-password?token=${rawToken}`;

  const mailOptions = {
    from: getFromAddress(),
    to: toEmail,
    subject: "mDent - Нууц үг сэргээх холбоос",
    text: [
      "Та нууц үг сэргээх хүсэлт илгээсэн байна.",
      "",
      "Доорх холбоосоор нууц үгээ шинэчлэнэ үү:",
      resetLink,
      "",
      "60 минутын дотор ашиглана уу.",
      "",
      "Хэрэв та энэ хүсэлтийг илгээгээгүй бол энэ имэйлийг үл тоомсорлоно уу.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#0f2044;margin-bottom:16px;">mDent - Нууц үг сэргээх</h2>
        <p>Та нууц үг сэргээх хүсэлт илгээсэн байна.</p>
        <p>Доорх товчийг дарж нууц үгээ шинэчлэнэ үү:</p>
        <a href="${resetLink}"
           style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
          Нууц үг сэргээх
        </a>
        <p style="color:#6b7280;font-size:13px;">
          Эсвэл дараах холбоосыг хөтчийнхөө хаягийн мөрөнд хуулна уу:<br/>
          <a href="${resetLink}" style="color:#2563eb;word-break:break-all;">${resetLink}</a>
        </p>
        <p style="color:#dc2626;font-size:13px;font-weight:600;">60 минутын дотор ашиглана уу.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="color:#9ca3af;font-size:12px;">
          Хэрэв та энэ хүсэлтийг илгээгээгүй бол энэ имэйлийг үл тоомсорлоно уу.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return true;
}
