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
