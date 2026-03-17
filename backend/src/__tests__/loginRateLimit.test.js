/**
 * Unit tests for the login rate-limit key generator logic.
 *
 * These tests verify the key-generation rules that underpin the dual-layer
 * login rate-limiting strategy:
 *
 *   Layer 1 — IP backstop (100 req / 15 min per IP)
 *     Different emails from the same IP share one counter, so a
 *     password-spray attack is caught even though no single (ip+email)
 *     pair exceeds the per-account limit.
 *
 *   Layer 2 — per (IP + email) (10 req / 15 min)
 *     Brute-force against one account is throttled.  The key is
 *     normalised (trim + toLowerCase) so capitalisation variants count
 *     as the same key.
 *
 * Tests do NOT start an HTTP server or touch the database.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline key-generator logic — mirrors the implementation in routes/auth.js
// ---------------------------------------------------------------------------

/**
 * Generates the rate-limit key used by Layer 2 (per IP + email).
 *
 * Uses "||" as separator since pipe is invalid in both email addresses and
 * IP addresses, preventing key-collision/injection attacks.
 *
 * @param {{ ip: string, body?: { email?: string, username?: string } }} req
 * @returns {string}
 */
function buildIpEmailKey(req) {
  const raw = req.body?.email || req.body?.username || "";
  const email = raw.trim().toLowerCase() || "no-email";
  return `${req.ip}||${email}`;
}

/**
 * The IP backstop (Layer 1) uses express-rate-limit's default key which is
 * simply `req.ip`.  Simulate that here.
 *
 * @param {{ ip: string }} req
 * @returns {string}
 */
function buildIpKey(req) {
  return req.ip;
}

// ---------------------------------------------------------------------------
// Layer 2 — per (IP + email) key generator
// ---------------------------------------------------------------------------

describe("ipEmailRateLimit — keyGenerator", () => {
  it("returns ip:email for a normal request", () => {
    const req = { ip: "1.2.3.4", body: { email: "admin@clinic.mn" } };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||admin@clinic.mn");
  });

  it("normalises email to lowercase", () => {
    const req = { ip: "1.2.3.4", body: { email: "Admin@Clinic.MN" } };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||admin@clinic.mn");
  });

  it("trims whitespace from email", () => {
    const req = { ip: "1.2.3.4", body: { email: "  admin@clinic.mn  " } };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||admin@clinic.mn");
  });

  it("uses username field when email is absent", () => {
    const req = { ip: "1.2.3.4", body: { username: "Admin@Clinic.MN" } };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||admin@clinic.mn");
  });

  it("falls back to no-email when both email and username are absent", () => {
    const req = { ip: "1.2.3.4", body: {} };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||no-email");
  });

  it("falls back to no-email when body is undefined", () => {
    const req = { ip: "1.2.3.4" };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||no-email");
  });

  it("falls back to no-email when email is an empty string", () => {
    const req = { ip: "1.2.3.4", body: { email: "" } };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||no-email");
  });

  it("falls back to no-email when email is only whitespace", () => {
    const req = { ip: "1.2.3.4", body: { email: "   " } };
    assert.equal(buildIpEmailKey(req), "1.2.3.4||no-email");
  });

  it("two different emails from the same IP produce different keys (not cross-throttled)", () => {
    const reqA = { ip: "1.2.3.4", body: { email: "alice@clinic.mn" } };
    const reqB = { ip: "1.2.3.4", body: { email: "bob@clinic.mn" } };
    assert.notEqual(buildIpEmailKey(reqA), buildIpEmailKey(reqB));
  });

  it("same email from two different IPs produce different keys", () => {
    const reqA = { ip: "1.2.3.4", body: { email: "admin@clinic.mn" } };
    const reqB = { ip: "5.6.7.8", body: { email: "admin@clinic.mn" } };
    assert.notEqual(buildIpEmailKey(reqA), buildIpEmailKey(reqB));
  });

  it("capitalisation variants of the same email produce the same key", () => {
    const variants = [
      "Admin@Clinic.MN",
      "admin@clinic.mn",
      "ADMIN@CLINIC.MN",
      "  admin@clinic.mn  ",
    ];
    const keys = variants.map((email) => buildIpEmailKey({ ip: "1.2.3.4", body: { email } }));
    const unique = new Set(keys);
    assert.equal(unique.size, 1, `Expected all variants to map to the same key, got: ${[...unique]}`);
  });
});

// ---------------------------------------------------------------------------
// Layer 1 — IP backstop: multiple emails from the same IP share one counter
// ---------------------------------------------------------------------------

describe("ipBackstopRateLimit — default IP key", () => {
  it("two different emails from the same IP produce the same backstop key", () => {
    const reqA = { ip: "1.2.3.4", body: { email: "alice@clinic.mn" } };
    const reqB = { ip: "1.2.3.4", body: { email: "bob@clinic.mn" } };
    assert.equal(buildIpKey(reqA), buildIpKey(reqB));
  });

  it("same email from different IPs produce different backstop keys", () => {
    const reqA = { ip: "1.2.3.4", body: { email: "admin@clinic.mn" } };
    const reqB = { ip: "5.6.7.8", body: { email: "admin@clinic.mn" } };
    assert.notEqual(buildIpKey(reqA), buildIpKey(reqB));
  });
});

// ---------------------------------------------------------------------------
// Dual-layer interaction scenarios
// ---------------------------------------------------------------------------

describe("dual-layer rate-limit interaction", () => {
  it("different emails from same IP are NOT throttled by per-(ip+email) limiter independently", () => {
    // Simulates 10 requests from same IP but for different emails.
    // Each (ip+email) pair should have its own counter starting at 0.
    const ip = "1.2.3.4";
    const emails = Array.from({ length: 10 }, (_, i) => `user${i}@clinic.mn`);
    const keys = emails.map((email) => buildIpEmailKey({ ip, body: { email } }));

    // All keys must be unique → no single per-(ip+email) counter increments > 1
    const unique = new Set(keys);
    assert.equal(unique.size, 10, "Each email should produce a unique key");
  });

  it("same email from same IP always maps to the same per-(ip+email) key (brute-force is caught)", () => {
    const ip = "1.2.3.4";
    const email = "victim@clinic.mn";
    const keys = Array.from({ length: 15 }, () => buildIpEmailKey({ ip, body: { email } }));
    const unique = new Set(keys);
    assert.equal(unique.size, 1, "Repeated attempts for the same account must share one key");
  });
});
