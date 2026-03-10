/**
 * Dashboard helpers: bucket generation for doctor dashboard endpoint.
 *
 * All dates are treated as UTC-day boundaries (YYYY-MM-DDT00:00:00.000Z),
 * matching the pattern used throughout income.js. The frontend sends
 * startDate/endDate in YYYY-MM-DD format already converted to the user's
 * browser timezone.
 */

/**
 * Returns the ISO week number (1–53) for a UTC date.
 * ISO week: Mon=start, week containing Jan 4 is week 1.
 * @param {Date} d
 * @returns {number}
 */
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Adjust to nearest Thursday (ISO week belongs to the year that contains Thursday)
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

/**
 * Returns the ISO week year for a UTC date (may differ from calendar year near year-end).
 * @param {Date} d
 * @returns {number}
 */
function isoWeekYear(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  return date.getUTCFullYear();
}

/**
 * Returns the Monday of the ISO week containing the given UTC date.
 * @param {Date} d
 * @returns {Date}
 */
function isoWeekMonday(d) {
  const dow = d.getUTCDay() || 7; // 1=Mon … 7=Sun
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Add N UTC days to a date.
 * @param {Date} d
 * @param {number} n
 * @returns {Date}
 */
function addUTCDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/**
 * Format YYYY-MM-DD from a UTC Date.
 * @param {Date} d
 * @returns {string}
 */
function toYMD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Generate bucket descriptors for the given overall range and bucket type.
 *
 * Each bucket has:
 *   - key: string  (e.g. "2026-03", "2026-W09", "2026-03-09")
 *   - label: string (same as key for backend; frontend formats it)
 *   - start: Date  (inclusive, UTC midnight)
 *   - end: Date    (exclusive, UTC midnight of next day after bucket)
 *
 * @param {string} startDateStr  YYYY-MM-DD
 * @param {string} endDateStr    YYYY-MM-DD (inclusive)
 * @param {"month"|"week"|"day"} bucket
 * @returns {Array<{key: string, label: string, start: Date, end: Date, startDate: string, endDate: string}>}
 */
export function generateBuckets(startDateStr, endDateStr, bucket) {
  const overallStart = new Date(`${startDateStr}T00:00:00.000Z`);
  // endDate is inclusive, so we need endExclusive = next day after endDate
  const overallEndExclusive = new Date(`${endDateStr}T00:00:00.000Z`);
  overallEndExclusive.setUTCDate(overallEndExclusive.getUTCDate() + 1);

  const buckets = [];

  if (bucket === "day") {
    let cur = new Date(overallStart);
    while (cur < overallEndExclusive) {
      const next = addUTCDays(cur, 1);
      const key = toYMD(cur);
      buckets.push({
        key,
        label: key,
        start: new Date(cur),
        end: new Date(next),
        startDate: toYMD(cur),
        endDate: toYMD(cur), // inclusive end
      });
      cur = next;
    }
  } else if (bucket === "week") {
    // ISO week buckets – start at the Monday of the week containing overallStart
    // Each bucket is clipped to [overallStart, overallEndExclusive)
    let cur = isoWeekMonday(overallStart);
    while (cur < overallEndExclusive) {
      const weekEnd = addUTCDays(cur, 7); // exclusive (next Monday)
      // Clip to overall range
      const bucketStart = cur < overallStart ? new Date(overallStart) : new Date(cur);
      const bucketEnd = weekEnd > overallEndExclusive ? new Date(overallEndExclusive) : new Date(weekEnd);

      const wYear = isoWeekYear(cur);
      const wNum = String(isoWeekNumber(cur)).padStart(2, "0");
      const key = `${wYear}-W${wNum}`;
      const inclusiveEnd = addUTCDays(bucketEnd, -1);

      buckets.push({
        key,
        label: key,
        start: bucketStart,
        end: bucketEnd,
        startDate: toYMD(bucketStart),
        endDate: toYMD(inclusiveEnd),
      });
      cur = weekEnd;
    }
  } else {
    // bucket === "month"
    // Iterate months from the month containing overallStart
    let curYear = overallStart.getUTCFullYear();
    let curMonth = overallStart.getUTCMonth(); // 0-based

    const endYear = overallEndExclusive.getUTCFullYear();
    const endMonth = overallEndExclusive.getUTCMonth(); // 0-based (this is the first month NOT included fully)

    while (curYear < endYear || (curYear === endYear && curMonth < endMonth)) {
      const monthStart = new Date(Date.UTC(curYear, curMonth, 1));
      const monthEnd = new Date(Date.UTC(curYear, curMonth + 1, 1)); // exclusive

      // Clip to overall range
      const bucketStart = monthStart < overallStart ? new Date(overallStart) : new Date(monthStart);
      const bucketEnd = monthEnd > overallEndExclusive ? new Date(overallEndExclusive) : new Date(monthEnd);

      const mm = String(curMonth + 1).padStart(2, "0");
      const key = `${curYear}-${mm}`;
      const inclusiveEnd = addUTCDays(bucketEnd, -1);

      buckets.push({
        key,
        label: key,
        start: bucketStart,
        end: bucketEnd,
        startDate: toYMD(bucketStart),
        endDate: toYMD(inclusiveEnd),
      });

      curMonth++;
      if (curMonth > 11) {
        curMonth = 0;
        curYear++;
      }
    }
  }

  return buckets;
}

export { isoWeekNumber, isoWeekYear, isoWeekMonday, addUTCDays, toYMD };
