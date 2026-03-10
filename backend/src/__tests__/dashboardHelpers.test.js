/**
 * Unit tests for dashboardHelpers.js
 *
 * Tests:
 *  - generateBuckets with bucket="month"
 *  - generateBuckets with bucket="week"
 *  - generateBuckets with bucket="day"
 *  - ISO week utility functions
 *  - Bucket clipping at range boundaries
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateBuckets,
  isoWeekNumber,
  isoWeekYear,
  isoWeekMonday,
  toYMD,
} from "../utils/dashboardHelpers.js";

// ── isoWeekNumber ─────────────────────────────────────────────────────────────

describe("isoWeekNumber", () => {
  it("2026-01-01 (Thu) is ISO week 1", () => {
    assert.equal(isoWeekNumber(new Date("2026-01-01T00:00:00.000Z")), 1);
  });

  it("2026-12-28 (Mon) is ISO week 53", () => {
    // 2026-12-28 is Monday of ISO week 53 of 2026
    assert.equal(isoWeekNumber(new Date("2026-12-28T00:00:00.000Z")), 53);
  });

  it("2026-03-09 (Mon) is ISO week 11", () => {
    assert.equal(isoWeekNumber(new Date("2026-03-09T00:00:00.000Z")), 11);
  });

  it("2026-03-15 (Sun) is ISO week 11", () => {
    assert.equal(isoWeekNumber(new Date("2026-03-15T00:00:00.000Z")), 11);
  });
});

// ── isoWeekMonday ────────────────────────────────────────────────────────────

describe("isoWeekMonday", () => {
  it("Monday returns itself", () => {
    const d = new Date("2026-03-09T00:00:00.000Z");
    assert.equal(toYMD(isoWeekMonday(d)), "2026-03-09");
  });

  it("Sunday returns previous Monday", () => {
    const d = new Date("2026-03-15T00:00:00.000Z");
    assert.equal(toYMD(isoWeekMonday(d)), "2026-03-09");
  });

  it("Wednesday returns Monday of same week", () => {
    const d = new Date("2026-03-11T00:00:00.000Z");
    assert.equal(toYMD(isoWeekMonday(d)), "2026-03-09");
  });
});

// ── generateBuckets - day ─────────────────────────────────────────────────────

describe("generateBuckets day", () => {
  it("3-day range produces 3 daily buckets", () => {
    const buckets = generateBuckets("2026-03-09", "2026-03-11", "day");
    assert.equal(buckets.length, 3);
    assert.equal(buckets[0].key, "2026-03-09");
    assert.equal(buckets[1].key, "2026-03-10");
    assert.equal(buckets[2].key, "2026-03-11");
  });

  it("single day produces 1 bucket", () => {
    const buckets = generateBuckets("2026-03-10", "2026-03-10", "day");
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].startDate, "2026-03-10");
    assert.equal(buckets[0].endDate, "2026-03-10");
  });

  it("each bucket covers exactly 1 day (start inclusive, end exclusive = next day)", () => {
    const buckets = generateBuckets("2026-03-09", "2026-03-11", "day");
    for (let i = 0; i < buckets.length; i++) {
      const diffMs = buckets[i].end.getTime() - buckets[i].start.getTime();
      assert.equal(diffMs, 86400000, `Bucket ${i} should be 1 day`);
    }
  });
});

// ── generateBuckets - week ────────────────────────────────────────────────────

describe("generateBuckets week", () => {
  it("full ISO week (Mon–Sun) produces 1 week bucket with correct key", () => {
    // 2026-W11: Mon 2026-03-09 – Sun 2026-03-15
    const buckets = generateBuckets("2026-03-09", "2026-03-15", "week");
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].key, "2026-W11");
  });

  it("2-week range spans 2 week buckets", () => {
    // W11 (2026-03-09 – 2026-03-15) + W12 (2026-03-16 – 2026-03-22)
    const buckets = generateBuckets("2026-03-09", "2026-03-22", "week");
    assert.equal(buckets.length, 2);
    assert.equal(buckets[0].key, "2026-W11");
    assert.equal(buckets[1].key, "2026-W12");
  });

  it("range starting on Wednesday clips first bucket start to Wednesday", () => {
    // W11: Mon=2026-03-09, but range starts 2026-03-11 (Wed)
    const buckets = generateBuckets("2026-03-11", "2026-03-15", "week");
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].key, "2026-W11");
    assert.equal(buckets[0].startDate, "2026-03-11");
  });
});

// ── generateBuckets - month ───────────────────────────────────────────────────

describe("generateBuckets month", () => {
  it("full year range produces 12 monthly buckets", () => {
    const buckets = generateBuckets("2026-01-01", "2026-12-31", "month");
    assert.equal(buckets.length, 12);
    assert.equal(buckets[0].key, "2026-01");
    assert.equal(buckets[11].key, "2026-12");
  });

  it("single month produces 1 bucket", () => {
    const buckets = generateBuckets("2026-03-01", "2026-03-31", "month");
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].key, "2026-03");
    assert.equal(buckets[0].startDate, "2026-03-01");
    assert.equal(buckets[0].endDate, "2026-03-31");
  });

  it("mid-month start clips first bucket startDate", () => {
    const buckets = generateBuckets("2026-03-10", "2026-04-30", "month");
    assert.equal(buckets.length, 2);
    assert.equal(buckets[0].startDate, "2026-03-10");
    assert.equal(buckets[0].endDate, "2026-03-31");
    assert.equal(buckets[1].startDate, "2026-04-01");
  });

  it("Q1 produces exactly 3 buckets Jan–Mar", () => {
    const buckets = generateBuckets("2026-01-01", "2026-03-31", "month");
    assert.equal(buckets.length, 3);
    const keys = buckets.map((b) => b.key);
    assert.deepEqual(keys, ["2026-01", "2026-02", "2026-03"]);
  });
});
