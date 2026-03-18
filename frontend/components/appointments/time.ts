/**
 * Time and slot utility functions.
 *
 * All Date objects used here are "fake-UTC" Dates: their UTC components
 * represent Mongolia wall-clock time. Always use getUTC*() methods, never
 * getHours()/getMinutes()/getDay() etc.
 *
 * See frontend/utils/businessTime.ts for conversion helpers.
 */

import { getBusinessYmd, businessYmdToFakeUtcDate } from "../../utils/businessTime";

export const SLOT_MINUTES = 30;

export function floorToSlotStart(d: Date, slotMinutes = SLOT_MINUTES) {
  const slotMs = slotMinutes * 60_000;
  return new Date(Math.floor(d.getTime() / slotMs) * slotMs);
}

export function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

// doctorId|YYYY-MM-DD|HH:MM  — built from fake-UTC components
export function getSlotKey(doctorId: number, slotStart: Date) {
  const y = slotStart.getUTCFullYear();
  const m = String(slotStart.getUTCMonth() + 1).padStart(2, "0");
  const d = String(slotStart.getUTCDate()).padStart(2, "0");
  const hh = String(slotStart.getUTCHours()).padStart(2, "0");
  const mm = String(slotStart.getUTCMinutes()).padStart(2, "0");
  return `${doctorId}|${y}-${m}-${d}|${hh}:${mm}`;
}

/**
 * Enumerate slot start times for any overlap.
 * If appointment starts at 09:10, we still count 09:00 slot as filled.
 */
export function enumerateSlotStartsOverlappingRange(
  start: Date,
  end: Date,
  slotMinutes = SLOT_MINUTES
) {
  const slots: Date[] = [];
  if (end <= start) return slots;

  let cur = floorToSlotStart(start, slotMinutes);
  while (cur < end) {
    slots.push(cur);
    cur = addMinutes(cur, slotMinutes);
  }
  return slots;
}

export function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

/** Returns "HH:MM" from a fake-UTC Date (uses getUTCHours/getUTCMinutes). */
export function getSlotTimeString(date: Date): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

export function addMinutesToTimeString(time: string, minutesToAdd: number): string {
  const [hh, mm] = time.split(":").map(Number);
  const totalMinutes = (hh || 0) * 60 + (mm || 0) + minutesToAdd;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${pad2(newH)}:${pad2(newM)}`;
}

export function isTimeWithinRange(time: string, startTime: string, endTime: string) {
  // inclusive of start, exclusive of end
  return time >= startTime && time < endTime;
}

/**
 * Generate 30-minute time slots for a given day.
 * @param day  A fake-UTC Date (use getDateFromYMD). UTC components = wall clock.
 */
export function generateTimeSlotsForDay(day: Date) {
  const slots: { start: Date; end: Date; label: string }[] = [];

  // Use UTC day-of-week since the Date is fake-UTC
  const weekday = day.getUTCDay(); // 0 = Sun, 6 = Sat

  // Visual working window
  // Weekdays: 09:00–21:00
  // Weekends: 10:00–19:00
  const startHour = weekday === 0 || weekday === 6 ? 10 : 9;
  const endHour = weekday === 0 || weekday === 6 ? 19 : 21;

  // Build a UTC midnight and advance to startHour
  const base = new Date(day);
  // Zero out sub-day components, then set start hour
  const midnight = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0)
  );
  const d = new Date(midnight.getTime() + startHour * 3600_000);

  while (d.getUTCHours() < endHour) {
    const start = new Date(d);
    d.setTime(d.getTime() + SLOT_MINUTES * 60_000);
    const end = new Date(d);
    slots.push({
      start,
      end,
      label: getSlotTimeString(start),
    });
  }

  return slots;
}

/**
 * Convert a YYYY-MM-DD string to a fake-UTC Date (midnight UTC = midnight Mongolia).
 * Falls back to today's business date if the string is invalid.
 */
export function getDateFromYMD(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) {
    // Fallback: use today in business timezone
    return businessYmdToFakeUtcDate(getBusinessYmd());
  }
  return new Date(Date.UTC(y, m - 1, d));
}
