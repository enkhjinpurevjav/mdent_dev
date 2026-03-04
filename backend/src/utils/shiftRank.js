/**
 * Shift rank helpers for doctor ordering on the scheduling grid.
 *
 * Business rules:
 *   Weekdays (Mon–Fri):
 *     AM shift: starts before 15:00  → rank 0
 *     PM shift: starts at 15:00+     → rank 1
 *   Weekends (Sat/Sun):
 *     No shift split; all doctors get rank 0 so ordering is purely by calendarOrder.
 */

/** Mongolia timezone offset in milliseconds (UTC+8). */
const MONGOLIA_UTC_OFFSET_MS = 8 * 3600000;

/**
 * Returns true when the given YYYY-MM-DD date falls on Saturday (6) or Sunday (0).
 * @param {string} ymd  "YYYY-MM-DD"
 */
export function isWeekendDate(ymd) {
  if (!ymd) return false;
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat
  return day === 0 || day === 6;
}

/**
 * Returns the shift rank for a doctor schedule entry.
 *   0 = AM (or weekend — no split)
 *   1 = PM (weekday only, startTime >= 15:00)
 *
 * @param {string|null} startTime   "HH:MM" 24-hour, may be null
 * @param {string|null} scheduleDate  "YYYY-MM-DD", used to detect weekends
 */
export function getShiftRank(startTime, scheduleDate) {
  // Weekends: no shift split
  if (isWeekendDate(scheduleDate)) return 0;
  // Unknown start time defaults to AM rank
  if (!startTime) return 0;
  const [sh, sm = 0] = startTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  return startMins < 15 * 60 ? 0 : 1; // 15:00 weekday cutoff
}

/**
 * Returns the effective sort rank for a doctor schedule entry, potentially
 * swapping AM/PM when viewing "today" and the current Mongolia time is >= 15:00.
 *
 * After 15:00 on a weekday today:
 *   PM doctors (base rank 1) → effective rank 0  (shown first)
 *   AM doctors (base rank 0) → effective rank 1  (shown second)
 *
 * Weekends and non-today dates are never affected.
 *
 * @param {string|null} startTime    "HH:MM" 24-hour
 * @param {string|null} scheduleDate "YYYY-MM-DD"
 * @param {string|null} queryDate    the single "date" query param ("YYYY-MM-DD")
 */
export function maybeSwapRankForToday(startTime, scheduleDate, queryDate) {
  const base = getShiftRank(startTime, scheduleDate);
  // Weekends never swap (base is always 0, but guard explicitly for clarity)
  if (!queryDate || isWeekendDate(scheduleDate)) return base;
  // Compute today and current time in Mongolia timezone (UTC+8)
  const now = new Date();
  const mongoliaMs = now.getTime() + MONGOLIA_UTC_OFFSET_MS;
  const mongoliaDate = new Date(mongoliaMs);
  const todayYmd = mongoliaDate.toISOString().slice(0, 10);
  if (queryDate !== todayYmd) return base;
  const mongoliaMinutes = mongoliaDate.getUTCHours() * 60 + mongoliaDate.getUTCMinutes();
  if (mongoliaMinutes < 15 * 60) return base;
  // At/after 15:00 local today: swap AM (0) ↔ PM (1)
  return 1 - base;
}
