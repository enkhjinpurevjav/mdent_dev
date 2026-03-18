/**
 * Business-time helpers for Mongolia clinic (Asia/Ulaanbaatar, UTC+8).
 *
 * Strategy: appointment scheduledAt/endAt are stored and transmitted as
 * **naive timestamps** ("YYYY-MM-DD HH:mm:ss") — no timezone offset attached.
 * These wall-clock values are always interpreted as Mongolia local time.
 *
 * For internal arithmetic (grid positioning, overlap checks) we use
 * "fake-UTC" Date objects: the Date's UTC components equal the naive
 * wall-clock components. Always use getUTC*() methods on these objects.
 * Never call .toISOString() on appointment times.
 */

export const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";

// ---------------------------------------------------------------------------
// Current business day/time
// ---------------------------------------------------------------------------

/**
 * Returns YYYY-MM-DD for the current moment in Mongolia time.
 * Uses Intl.DateTimeFormat so it works regardless of browser timezone.
 */
export function getBusinessYmd(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/**
 * Returns HH:mm for the current moment in Mongolia time.
 */
export function getBusinessHm(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Naive timestamp construction / parsing
// ---------------------------------------------------------------------------

/**
 * Build a naive timestamp string from YYYY-MM-DD and HH:mm.
 * Result: "YYYY-MM-DD HH:mm:00"
 */
export function toNaiveTimestamp(ymd: string, hm: string): string {
  return `${ymd} ${hm}:00`;
}

/**
 * Parse a naive timestamp string "YYYY-MM-DD HH:mm:ss" (or "YYYY-MM-DDTHH:mm:ss").
 * Returns { ymd, hm, seconds } or null if the string is not recognisable.
 */
export function parseNaiveTimestamp(
  input: string
): { ymd: string; hm: string; seconds: string } | null {
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/.exec(
      String(input ?? "")
    );
  if (!m) return null;
  return { ymd: m[1], hm: m[2], seconds: m[3] ?? "00" };
}

/** Extract the YYYY-MM-DD part of a naive timestamp. */
export function naiveTimestampToYmd(input: string): string {
  if (!input) return "";
  return String(input).slice(0, 10);
}

/** Extract the HH:mm part of a naive timestamp. */
export function naiveTimestampToHm(input: string): string {
  const parsed = parseNaiveTimestamp(input);
  return parsed ? parsed.hm : "";
}

/** Minutes from midnight (00:00) for a naive timestamp. */
export function minutesFromNaive(input: string): number {
  const parsed = parseNaiveTimestamp(input);
  if (!parsed) return 0;
  const [h, m] = parsed.hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ---------------------------------------------------------------------------
// Fake-UTC Date helpers (for arithmetic & comparisons)
// ---------------------------------------------------------------------------

/**
 * Convert a naive timestamp to a "fake-UTC" Date.
 *
 * The resulting Date's **UTC** components equal the naive wall-clock values,
 * so getUTCHours() == Mongolia hours, getUTCDate() == Mongolia date, etc.
 *
 * Use this for arithmetic (getTime(), duration math) and for building slot
 * keys. **Never** call getHours() / getMinutes() on the result.
 */
export function naiveToFakeUtcDate(naive: string): Date {
  const parsed = parseNaiveTimestamp(naive);
  if (!parsed) return new Date(0);
  const [y, mo, d] = parsed.ymd.split("-").map(Number);
  const [h, m] = parsed.hm.split(":").map(Number);
  const s = Number(parsed.seconds ?? 0);
  return new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1, h || 0, m || 0, s));
}

/**
 * Convert a "fake-UTC" Date back to a naive timestamp "YYYY-MM-DD HH:mm:ss".
 */
export function fakeUtcDateToNaive(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${m}:${s}`;
}

/**
 * Get a "fake-UTC" Date for the start of a business day (midnight Mongolia).
 * Equivalent to naiveToFakeUtcDate(ymd + " 00:00:00").
 */
export function businessYmdToFakeUtcDate(ymd: string): Date {
  return naiveToFakeUtcDate(`${ymd} 00:00:00`);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Format a naive timestamp's time portion as "HH:mm" — timezone-free. */
export function formatNaiveHm(naive: string): string {
  return naiveTimestampToHm(naive);
}

/** Get the YYYY-MM-DD day key from a naive timestamp (just the first 10 chars). */
export function getBusinessDayKeyFromNaive(naive: string): string {
  return naiveTimestampToYmd(naive);
}
