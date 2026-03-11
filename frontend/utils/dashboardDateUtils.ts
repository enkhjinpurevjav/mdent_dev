/**
 * Dashboard date utilities (browser timezone aware).
 *
 * All functions work in the **browser's local timezone** so that the boundaries
 * sent to the backend API match what the user selected.
 */

export type DashboardMode = "yearly" | "monthly";
export type BucketType = "month" | "week";

// ── Low-level helpers ─────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a local Date as YYYY-MM-DD (browser timezone). */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ── Year / Month option generators ───────────────────────────────────────────

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
  month: number | null // 1-based (1–12), only for monthly
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

  return null;
}

// ── Mongolian month labels ────────────────────────────────────────────────────

const MN_MONTH_LABELS: Record<number, string> = {
  1: "1 сар", 2: "2 сар", 3: "3 сар", 4: "4 сар",
  5: "5 сар", 6: "6 сар", 7: "7 сар", 8: "8 сар",
  9: "9 сар", 10: "10 сар", 11: "11 сар", 12: "12 сар",
};

// ── Bucket label formatting for chart X-axis ──────────────────────────────────

/** Format a monetary amount in ₮ for chart Y-axis ticks. */
export function formatMntTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

/**
 * Given a bucket type and a series item key, produce a human-readable x-axis label.
 * - month bucket: key "2026-03" → label "3 сар"
 * - week bucket: key "2026-W09" → label "W09"
 */
export function formatBucketLabel(key: string, bucketType: BucketType): string {
  if (bucketType === "month") {
    // "2026-03" → "3 сар"
    const parts = key.split("-");
    const monthNum = parseInt(parts[1] ?? "0", 10);
    return MN_MONTH_LABELS[monthNum] ?? key;
  }
  // week bucket: "2026-W09" → "W09"
  const parts = key.split("-");
  return parts[1] ?? key;
}
