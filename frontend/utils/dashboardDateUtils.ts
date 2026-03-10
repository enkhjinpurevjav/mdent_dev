/**
 * Dashboard date utilities (browser timezone aware).
 *
 * All functions work in the **browser's local timezone** so that the boundaries
 * sent to the backend API match what the user selected.
 */

export type DashboardMode = "yearly" | "monthly" | "weekly";
export type BucketType = "month" | "week" | "day";

// ── Low-level helpers ─────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a local Date as YYYY-MM-DD (browser timezone). */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Returns the ISO week number (1–53) for a local Date. */
export function isoWeekNumber(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Returns the ISO week year for a local Date (may differ from calendar year near year boundaries). */
export function isoWeekYear(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  return date.getFullYear();
}

/** Returns the Monday of the ISO week containing the given local Date. */
function isoWeekMonday(d: Date): Date {
  const dow = d.getDay() || 7; // 1=Mon … 7=Sun
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dow - 1));
  return monday;
}

/** Mongolian weekday names (index 0=Sunday, 1=Monday, …, 6=Saturday). */
const MN_WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

/** Format a local Date as "YYYY/MM/DD Weekday" in Mongolian. */
export function formatDayLabelMn(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const weekday = MN_WEEKDAYS[d.getDay()];
  return `${y}/${m}/${day} ${weekday}`;
}

// ── Year / Month / Week option generators ─────────────────────────────────────

/** Number of years back (inclusive of current year) shown in the year dropdown. */
const YEARS_BACK = 4;

/** Returns an array of year numbers available in the dropdowns (past YEARS_BACK years + current). */
export function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear - YEARS_BACK; y <= currentYear; y++) {
    years.push(y);
  }
  return years;
}

/** Returns ISO week keys (YYYY-Www) for the given year, sorted ascending. */
export function getWeekOptionsForYear(year: number): string[] {
  const weeks: string[] = [];
  const d = new Date(year, 0, 1); // Jan 1
  // Advance to Monday of the first ISO week of this year
  const dow = d.getDay() || 7;
  if (dow > 4) {
    d.setDate(d.getDate() + (8 - dow));
  } else {
    d.setDate(d.getDate() - (dow - 1));
  }

  while (isoWeekYear(d) === year) {
    const wNum = String(isoWeekNumber(d)).padStart(2, "0");
    weeks.push(`${year}-W${wNum}`);
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

// ── Date range computation from filter selection ───────────────────────────────

export interface DashboardFilterResult {
  startDate: string; // YYYY-MM-DD local
  endDate: string; // YYYY-MM-DD local (inclusive)
  bucket: BucketType;
}

/**
 * Given a mode + selection, compute the startDate/endDate and bucket type
 * to send to the backend API.
 */
export function computeDateRange(
  mode: DashboardMode,
  year: number,
  month: number | null, // 1-based (1–12), only for monthly
  weekKey: string | null // "YYYY-Www", only for weekly
): DashboardFilterResult | null {
  if (mode === "yearly") {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    return { startDate, endDate, bucket: "month" };
  }

  if (mode === "monthly" && month !== null) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0); // last day of month
    return {
      startDate: ymdLocal(firstDay),
      endDate: ymdLocal(lastDay),
      bucket: "week",
    };
  }

  if (mode === "weekly" && weekKey) {
    const parsed = parseWeekKey(weekKey);
    if (!parsed) return null;
    const monday = isoWeekMonday(parsed);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      startDate: ymdLocal(monday),
      endDate: ymdLocal(sunday),
      bucket: "day",
    };
  }

  return null;
}

/**
 * Parse "YYYY-Www" into a Date on the Thursday of that ISO week
 * (used to find the Monday via isoWeekMonday).
 */
function parseWeekKey(weekKey: string): Date | null {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);

  // Jan 4 of year is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const dow4 = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (dow4 - 1));

  const result = new Date(week1Monday);
  result.setDate(week1Monday.getDate() + (week - 1) * 7);
  return result;
}

// ── Bucket label formatting for chart X-axis ──────────────────────────────────

/** Format a monetary amount in ₮ for chart Y-axis ticks. */
export function formatMntTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

/**
 * Given a bucket type and a series item key, produce a human-readable x-axis label.
 * - month bucket: key "2026-03" → label "03"
 * - week bucket: key "2026-W09" → label "W09"
 * - day bucket: key "2026-03-10" → label "2026/03/10 Мягмар"
 */
export function formatBucketLabel(key: string, bucketType: BucketType): string {
  if (bucketType === "month") {
    // "2026-03" → "03"
    const parts = key.split("-");
    return parts[1] ?? key;
  }
  if (bucketType === "week") {
    // "2026-W09" → "W09"
    const parts = key.split("-");
    return parts[1] ?? key;
  }
  // "day": "2026-03-10" → "2026/03/10 Мягмар"
  const d = new Date(key + "T00:00:00"); // local time
  if (isNaN(d.getTime())) return key;
  return formatDayLabelMn(d);
}
