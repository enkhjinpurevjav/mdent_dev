/**
 * Unit tests for income calculation helper functions.
 *
 * Covers the three pure helpers exported from utils/incomeHelpers.js:
 *  - discountPercentEnumToNumber
 *  - computeServiceNetEqualDiscount
 *  - allocatePaymentEqualSplitWithOverflow
 *
 * Edge cases exercised:
 *  - payment < total (partial allocation)
 *  - equal split across equal-sized lines
 *  - line smaller than target triggers overflow to remaining lines
 *  - multiple payments with running remainingDue tracking
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  discountPercentEnumToNumber,
  computeServiceNetEqualDiscount,
  allocatePaymentEqualSplitWithOverflow,
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
// computeServiceNetEqualDiscount
// ---------------------------------------------------------------------------

describe("computeServiceNetEqualDiscount – no discount", () => {
  const items = [
    { id: 1, lineTotal: 30000 },
    { id: 2, lineTotal: 20000 },
  ];
  it("each line net equals gross when discount is 0%", () => {
    const nets = computeServiceNetEqualDiscount(items, 0);
    assert.equal(nets.get(1), 30000);
    assert.equal(nets.get(2), 20000);
  });
});

describe("computeServiceNetEqualDiscount – 10% discount, 2 lines", () => {
  // totalGross = 30000 + 20000 = 50000
  // totalDiscount = 5000, discountPerLine = 2500
  // line1 net = 30000 - 2500 = 27500
  // line2 net = 20000 - 2500 = 17500
  const items = [
    { id: 1, lineTotal: 30000 },
    { id: 2, lineTotal: 20000 },
  ];
  it("distributes discount equally across lines", () => {
    const nets = computeServiceNetEqualDiscount(items, 10);
    assert.equal(nets.get(1), 27500);
    assert.equal(nets.get(2), 17500);
  });
});

describe("computeServiceNetEqualDiscount – discount larger than one line", () => {
  // totalGross = 1000 + 9000 = 10000
  // totalDiscount (50%) = 5000, discountPerLine = 2500
  // line1 net = max(0, 1000 - 2500) = 0
  // line2 net = max(0, 9000 - 2500) = 6500
  const items = [
    { id: 1, lineTotal: 1000 },
    { id: 2, lineTotal: 9000 },
  ];
  it("clamps net to 0 when discount exceeds line gross", () => {
    const nets = computeServiceNetEqualDiscount(items, 50);
    assert.equal(nets.get(1), 0);
    assert.equal(nets.get(2), 6500);
  });
});

describe("computeServiceNetEqualDiscount – empty items", () => {
  it("returns empty map", () => {
    const nets = computeServiceNetEqualDiscount([], 10);
    assert.equal(nets.size, 0);
  });
});

// ---------------------------------------------------------------------------
// allocatePaymentEqualSplitWithOverflow
// ---------------------------------------------------------------------------

describe("allocatePaymentEqualSplitWithOverflow – payment less than total", () => {
  // 3 lines each due 10000; payment = 15000
  // target = 5000 per line; each line gets 5000 (no overflow needed)
  it("distributes partial payment equally when all lines have equal capacity", () => {
    const remainingDue = new Map([
      [1, 10000],
      [2, 10000],
      [3, 10000],
    ]);
    const result = allocatePaymentEqualSplitWithOverflow(15000, [1, 2, 3], remainingDue);
    assert.equal(result.get(1), 5000);
    assert.equal(result.get(2), 5000);
    assert.equal(result.get(3), 5000);
    // remainingDue should be updated
    assert.equal(remainingDue.get(1), 5000);
    assert.equal(remainingDue.get(2), 5000);
    assert.equal(remainingDue.get(3), 5000);
  });
});

describe("allocatePaymentEqualSplitWithOverflow – equal split, exact payment", () => {
  // 2 lines each due 20000; payment = 40000 (exact)
  it("covers both lines fully when payment equals total due", () => {
    const remainingDue = new Map([
      [1, 20000],
      [2, 20000],
    ]);
    const result = allocatePaymentEqualSplitWithOverflow(40000, [1, 2], remainingDue);
    assert.equal(result.get(1), 20000);
    assert.equal(result.get(2), 20000);
    assert.equal(remainingDue.get(1), 0);
    assert.equal(remainingDue.get(2), 0);
  });
});

describe("allocatePaymentEqualSplitWithOverflow – small line triggers overflow", () => {
  // lines: 1→5000, 2→30000; payment = 20000
  // target = 10000 each
  // line1: min(10000, 5000) = 5000; line2: min(10000, 30000) = 10000
  // totalAllocated = 15000; leftover = 5000
  // overflow → line2 has capacity 30000-10000 = 20000 → gets 5000
  // final: line1=5000, line2=15000
  it("overflows excess from small line to line with more capacity", () => {
    const remainingDue = new Map([
      [1, 5000],
      [2, 30000],
    ]);
    const result = allocatePaymentEqualSplitWithOverflow(20000, [1, 2], remainingDue);
    assert.equal(result.get(1), 5000);
    assert.equal(result.get(2), 15000);
    assert.equal(remainingDue.get(1), 0);
    assert.equal(remainingDue.get(2), 15000);
  });
});

describe("allocatePaymentEqualSplitWithOverflow – multiple payments with remaining tracking", () => {
  // 2 lines: IMAGING (due 10000), GENERAL (due 20000)
  // Payment 1: 9000 → target=4500 each
  //   IMAGING: min(4500, 10000)=4500; GENERAL: min(4500, 20000)=4500
  //   leftover=0; remainingDue → IMAGING=5500, GENERAL=15500
  // Payment 2: 9000 → target=4500 each
  //   IMAGING: min(4500, 5500)=4500; GENERAL: min(4500, 15500)=4500
  //   leftover=0; remainingDue → IMAGING=1000, GENERAL=11000
  // Payment 3: 9000 → target=4500 each
  //   IMAGING: min(4500, 1000)=1000; GENERAL: min(4500, 11000)=4500
  //   totalAllocated=5500; leftover=3500
  //   GENERAL capacity = 11000-4500 = 6500 → absorbs 3500
  //   final: IMAGING=1000, GENERAL=8000; remainingDue → IMAGING=0, GENERAL=3000
  it("tracks remaining due across three payments; later payments handle overflow correctly", () => {
    const remainingDue = new Map([
      [1, 10000], // IMAGING
      [2, 20000], // GENERAL
    ]);

    const r1 = allocatePaymentEqualSplitWithOverflow(9000, [1, 2], remainingDue);
    assert.equal(r1.get(1), 4500);
    assert.equal(r1.get(2), 4500);
    assert.equal(remainingDue.get(1), 5500);
    assert.equal(remainingDue.get(2), 15500);

    const r2 = allocatePaymentEqualSplitWithOverflow(9000, [1, 2], remainingDue);
    assert.equal(r2.get(1), 4500);
    assert.equal(r2.get(2), 4500);
    assert.equal(remainingDue.get(1), 1000);
    assert.equal(remainingDue.get(2), 11000);

    const r3 = allocatePaymentEqualSplitWithOverflow(9000, [1, 2], remainingDue);
    assert.equal(r3.get(1), 1000);
    assert.equal(r3.get(2), 8000);
    assert.equal(remainingDue.get(1), 0);
    assert.equal(remainingDue.get(2), 3000);
  });
});

describe("allocatePaymentEqualSplitWithOverflow – zero payment", () => {
  it("returns empty allocation for zero payment", () => {
    const remainingDue = new Map([[1, 10000]]);
    const result = allocatePaymentEqualSplitWithOverflow(0, [1], remainingDue);
    assert.equal(result.size, 0);
    assert.equal(remainingDue.get(1), 10000); // unchanged
  });
});

describe("allocatePaymentEqualSplitWithOverflow – no lines", () => {
  it("returns empty allocation when no lines provided", () => {
    const remainingDue = new Map();
    const result = allocatePaymentEqualSplitWithOverflow(5000, [], remainingDue);
    assert.equal(result.size, 0);
  });
});

describe("allocatePaymentEqualSplitWithOverflow – all lines already paid", () => {
  // All remainingDue = 0; payment cannot be allocated anywhere
  it("returns zero allocations when all lines are fully paid", () => {
    const remainingDue = new Map([
      [1, 0],
      [2, 0],
    ]);
    const result = allocatePaymentEqualSplitWithOverflow(5000, [1, 2], remainingDue);
    assert.equal(result.get(1), 0);
    assert.equal(result.get(2), 0);
  });
});
