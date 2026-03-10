/**
 * Unit tests for income calculation helper functions.
 *
 * Covers the three pure helpers exported from utils/incomeHelpers.js:
 *  - discountPercentEnumToNumber
 *  - computeServiceNetProportionalDiscount
 *  - allocatePaymentProportionalByRemaining
 *
 * Edge cases exercised:
 *  - proportional discount per line (same % applied to each line)
 *  - proportional allocation: 4 equal-ish lines → ~250k each from 1,000,000 payment
 *  - tiny line receives small proportional share (no overflow forced like equal split)
 *  - multiple payments with running remainingDue tracking
 *  - rounding: sum(allocations) === paymentAmount exactly
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  discountPercentEnumToNumber,
  computeServiceNetProportionalDiscount,
  allocatePaymentProportionalByRemaining,
} from "../utils/incomeHelpers.js";

// ---------------------------------------------------------------------------
// discountPercentEnumToNumber
// ---------------------------------------------------------------------------

describe("discountPercentEnumToNumber", () => {
  it("ZERO → 0", () => assert.equal(discountPercentEnumToNumber("ZERO"), 0));
  it("FIVE → 5", () => assert.equal(discountPercentEnumToNumber("FIVE"), 5));
  it("TEN → 10", () => assert.equal(discountPercentEnumToNumber("TEN"), 10));
  it("null → 0", () => assert.equal(discountPercentEnumToNumber(null), 0));
  it("undefined → 0", () => assert.equal(discountPercentEnumToNumber(undefined), 0));
  it("lowercase 'five' → 5 (case-insensitive)", () =>
    assert.equal(discountPercentEnumToNumber("five"), 5));
  it("unknown string → 0 (default)", () =>
    assert.equal(discountPercentEnumToNumber("TWENTY"), 0));
});

// ---------------------------------------------------------------------------
// computeServiceNetProportionalDiscount
// ---------------------------------------------------------------------------

describe("computeServiceNetProportionalDiscount – no discount", () => {
  const items = [
    { id: 1, lineTotal: 30000 },
    { id: 2, lineTotal: 20000 },
  ];
  it("each line net equals gross when discount is 0%", () => {
    const nets = computeServiceNetProportionalDiscount(items, 0);
    assert.equal(nets.get(1), 30000);
    assert.equal(nets.get(2), 20000);
  });
});

describe("computeServiceNetProportionalDiscount – 10% discount, 2 lines", () => {
  // Each line gets 10% off its own gross:
  // line1 net = round(30000 × 0.9) = 27000
  // line2 net = round(20000 × 0.9) = 18000
  const items = [
    { id: 1, lineTotal: 30000 },
    { id: 2, lineTotal: 20000 },
  ];
  it("applies 10% proportionally to each line independently", () => {
    const nets = computeServiceNetProportionalDiscount(items, 10);
    assert.equal(nets.get(1), 27000);
    assert.equal(nets.get(2), 18000);
  });
});

describe("computeServiceNetProportionalDiscount – small line with large discount", () => {
  // Small line is NOT reduced to zero; it just gets the same % discount as the large line:
  // line1 net = round(1000 × 0.5) = 500  (was 0 with equal-₮ distribution)
  // line2 net = round(9000 × 0.5) = 4500
  const items = [
    { id: 1, lineTotal: 1000 },
    { id: 2, lineTotal: 9000 },
  ];
  it("small line retains proportional share (not zeroed out by equal-₮ split)", () => {
    const nets = computeServiceNetProportionalDiscount(items, 50);
    assert.equal(nets.get(1), 500);
    assert.equal(nets.get(2), 4500);
  });
});

describe("computeServiceNetProportionalDiscount – empty items", () => {
  it("returns empty map", () => {
    const nets = computeServiceNetProportionalDiscount([], 10);
    assert.equal(nets.size, 0);
  });
});

// ---------------------------------------------------------------------------
// allocatePaymentProportionalByRemaining
// ---------------------------------------------------------------------------

describe("allocatePaymentProportionalByRemaining – 4 equal lines, 1,000,000 payment", () => {
  // 4 lines each with remaining due 250,000; payment = 1,000,000
  // Each line's share = 25%, so each gets 250,000 exactly.
  it("yields ~250,000 each for 4 equal-sized lines", () => {
    const remainingDue = new Map([
      [1, 250000],
      [2, 250000],
      [3, 250000],
      [4, 250000],
    ]);
    const result = allocatePaymentProportionalByRemaining(1000000, [1, 2, 3, 4], remainingDue);
    assert.equal(result.get(1), 250000);
    assert.equal(result.get(2), 250000);
    assert.equal(result.get(3), 250000);
    assert.equal(result.get(4), 250000);
    // Verify sum equals payment
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    assert.equal(total, 1000000);
    // All lines now fully paid
    assert.equal(remainingDue.get(1), 0);
    assert.equal(remainingDue.get(4), 0);
  });
});

describe("allocatePaymentProportionalByRemaining – tiny line gets small allocation", () => {
  // Lines: 1→5000, 2→995000; payment = 500000
  // share(1) = 5000/1000000 = 0.5%; share(2) = 99.5%
  // alloc(1) ≈ 2500; alloc(2) ≈ 497500
  // Unlike equal-split which forces 5000 to line1 and 495000 to line2,
  // proportional gives line1 only its fair 0.5% share.
  it("tiny line receives proportional share, not disproportionate overflow", () => {
    const remainingDue = new Map([
      [1, 5000],
      [2, 995000],
    ]);
    const result = allocatePaymentProportionalByRemaining(500000, [1, 2], remainingDue);
    assert.equal(result.get(1), 2500);
    assert.equal(result.get(2), 497500);
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    assert.equal(total, 500000);
    assert.equal(remainingDue.get(1), 2500);
    assert.equal(remainingDue.get(2), 497500);
  });
});

describe("allocatePaymentProportionalByRemaining – rounding: sum equals payment amount", () => {
  // 3 lines with unequal dues; payment = 100000
  // Ensures integer MNT rounding produces sum == 100000 exactly.
  it("sum of allocations equals payment amount (no rounding error)", () => {
    const remainingDue = new Map([
      [1, 33333],
      [2, 33334],
      [3, 33333],
    ]);
    const result = allocatePaymentProportionalByRemaining(100000, [1, 2, 3], remainingDue);
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    assert.equal(total, 100000);
  });
});

describe("allocatePaymentProportionalByRemaining – multiple payments track remaining", () => {
  // 2 lines: IMAGING due 117000, GENERAL due 1980000 (after 10% proportional discount)
  // Total remaining = 2097000
  // Payment 1: 1,000,000
  //   IMAGING share = 117000/2097000 ≈ 5.579% → alloc ≈ 55793 (or similar integer)
  //   GENERAL share = 1980000/2097000 ≈ 94.421% → alloc ≈ 944207
  //   sum = 1000000
  // Payment 2: 1,000,000 (second payment, after remainder tracked)
  //   IMAGING remaining ≈ 117000 - 55793 = 61207
  //   GENERAL remaining ≈ 1980000 - 944207 = 1035793
  //   Total remaining ≈ 1097000
  //   sum = 1000000
  it("tracks remaining due across two payments; totals converge correctly", () => {
    const remainingDue = new Map([
      [1, 117000],   // IMAGING (10% off 130000)
      [2, 1980000],  // GENERAL (10% off 2200000)
    ]);

    const r1 = allocatePaymentProportionalByRemaining(1000000, [1, 2], remainingDue);
    const r1Total = [...r1.values()].reduce((s, v) => s + v, 0);
    assert.equal(r1Total, 1000000);
    // IMAGING should get roughly 5.6% (much less than equal-split 500000)
    assert.ok(r1.get(1) < 60000, `IMAGING should be < 60000, got ${r1.get(1)}`);
    assert.ok(r1.get(1) > 50000, `IMAGING should be > 50000, got ${r1.get(1)}`);

    const r2 = allocatePaymentProportionalByRemaining(1000000, [1, 2], remainingDue);
    const r2Total = [...r2.values()].reduce((s, v) => s + v, 0);
    assert.equal(r2Total, 1000000);

    // After 2 payments of 1M on a 2.097M total, both lines should have allocations
    const alloc1 = (r1.get(1) || 0) + (r2.get(1) || 0);
    const alloc2 = (r1.get(2) || 0) + (r2.get(2) || 0);
    assert.equal(alloc1 + alloc2, 2000000);
  });
});

describe("allocatePaymentProportionalByRemaining – payment exceeds total remaining", () => {
  // Payment > total due → capped to total remaining, no over-allocation
  it("does not allocate more than total remaining due", () => {
    const remainingDue = new Map([
      [1, 30000],
      [2, 20000],
    ]);
    const result = allocatePaymentProportionalByRemaining(100000, [1, 2], remainingDue);
    // Max allocatable = 50000 (total remaining)
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    assert.equal(total, 50000);
    assert.equal(remainingDue.get(1), 0);
    assert.equal(remainingDue.get(2), 0);
  });
});

describe("allocatePaymentProportionalByRemaining – zero payment", () => {
  it("returns empty allocation for zero payment", () => {
    const remainingDue = new Map([[1, 10000]]);
    const result = allocatePaymentProportionalByRemaining(0, [1], remainingDue);
    assert.equal(result.size, 0);
    assert.equal(remainingDue.get(1), 10000); // unchanged
  });
});

describe("allocatePaymentProportionalByRemaining – no lines", () => {
  it("returns empty allocation when no lines provided", () => {
    const remainingDue = new Map();
    const result = allocatePaymentProportionalByRemaining(5000, [], remainingDue);
    assert.equal(result.size, 0);
  });
});

describe("allocatePaymentProportionalByRemaining – all lines already paid", () => {
  it("returns zero allocations when all lines are fully paid", () => {
    const remainingDue = new Map([
      [1, 0],
      [2, 0],
    ]);
    const result = allocatePaymentProportionalByRemaining(5000, [1, 2], remainingDue);
    assert.equal(result.get(1), 0);
    assert.equal(result.get(2), 0);
  });
});
