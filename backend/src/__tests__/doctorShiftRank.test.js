/**
 * Unit tests for shift rank helpers (doctor ordering business rules).
 *
 * Business rules:
 *   Weekdays (Mon–Fri):  AM = rank 0 (before 15:00), PM = rank 1 (15:00+)
 *   Weekends (Sat/Sun):  rank 0 for all (no shift split; order by calendarOrder only)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isWeekendDate, getShiftRank } from "../utils/shiftRank.js";

describe("isWeekendDate", () => {
  it("identifies Saturday as weekend", () => {
    // 2026-03-07 is a Saturday
    assert.equal(isWeekendDate("2026-03-07"), true);
  });

  it("identifies Sunday as weekend", () => {
    // 2026-03-08 is a Sunday
    assert.equal(isWeekendDate("2026-03-08"), true);
  });

  it("identifies Monday as weekday", () => {
    // 2026-03-02 is a Monday
    assert.equal(isWeekendDate("2026-03-02"), false);
  });

  it("identifies Friday as weekday", () => {
    // 2026-03-06 is a Friday
    assert.equal(isWeekendDate("2026-03-06"), false);
  });

  it("returns false for null/empty", () => {
    assert.equal(isWeekendDate(null), false);
    assert.equal(isWeekendDate(""), false);
  });
});

describe("getShiftRank — weekdays", () => {
  const MONDAY = "2026-03-02"; // Monday

  it("AM shift (09:00) → rank 0", () => {
    assert.equal(getShiftRank("09:00", MONDAY), 0);
  });

  it("AM shift (14:59) → rank 0", () => {
    assert.equal(getShiftRank("14:59", MONDAY), 0);
  });

  it("PM boundary (15:00) → rank 1", () => {
    assert.equal(getShiftRank("15:00", MONDAY), 1);
  });

  it("PM shift (18:00) → rank 1", () => {
    assert.equal(getShiftRank("18:00", MONDAY), 1);
  });

  it("null startTime → rank 0 (default AM)", () => {
    assert.equal(getShiftRank(null, MONDAY), 0);
  });
});

describe("getShiftRank — weekends (no shift split)", () => {
  const SATURDAY = "2026-03-07";
  const SUNDAY = "2026-03-08";

  it("Saturday 10:00 → rank 0 (no split)", () => {
    assert.equal(getShiftRank("10:00", SATURDAY), 0);
  });

  it("Saturday 15:00 (would be PM on weekday) → still rank 0 on weekend", () => {
    assert.equal(getShiftRank("15:00", SATURDAY), 0);
  });

  it("Sunday 10:00 → rank 0", () => {
    assert.equal(getShiftRank("10:00", SUNDAY), 0);
  });

  it("Sunday null startTime → rank 0", () => {
    assert.equal(getShiftRank(null, SUNDAY), 0);
  });
});
