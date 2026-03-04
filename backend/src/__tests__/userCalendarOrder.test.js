/**
 * Unit tests for calendarOrder validation in PUT /api/users/:id.
 *
 * Tests the validation/coercion logic inline (no HTTP server or DB needed).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline validation logic mirroring the route handler
// ---------------------------------------------------------------------------

/**
 * Validates and coerces calendarOrder from a request body value.
 *
 * Returns:
 *   { error, status } on invalid input,
 *   { value }         on valid input (value may be null or a number).
 */
function resolveCalendarOrder(calendarOrder) {
  if (calendarOrder === undefined) {
    return { value: undefined }; // no change
  }
  if (calendarOrder === null || calendarOrder === "") {
    return { value: null };
  }
  const order = Number(calendarOrder);
  if (Number.isNaN(order)) {
    return { status: 400, error: "Invalid calendarOrder" };
  }
  return { value: order };
}

describe("PUT /api/users/:id – calendarOrder validation", () => {
  it("undefined → no change (value: undefined)", () => {
    const result = resolveCalendarOrder(undefined);
    assert.deepEqual(result, { value: undefined });
  });

  it("null → set to null", () => {
    const result = resolveCalendarOrder(null);
    assert.deepEqual(result, { value: null });
  });

  it("empty string → set to null", () => {
    const result = resolveCalendarOrder("");
    assert.deepEqual(result, { value: null });
  });

  it("numeric value → coerced to Number", () => {
    const result = resolveCalendarOrder(5);
    assert.deepEqual(result, { value: 5 });
  });

  it("numeric string → coerced to Number", () => {
    const result = resolveCalendarOrder("10");
    assert.deepEqual(result, { value: 10 });
  });

  it("zero → valid (value: 0)", () => {
    const result = resolveCalendarOrder(0);
    assert.deepEqual(result, { value: 0 });
  });

  it("non-numeric string → error 400", () => {
    const result = resolveCalendarOrder("abc");
    assert.ok(result.error);
    assert.equal(result.status, 400);
    assert.match(result.error, /calendarOrder/);
  });

  it("object value → error 400", () => {
    const result = resolveCalendarOrder({});
    assert.ok(result.error);
    assert.equal(result.status, 400);
  });

  it("negative number → valid (negative ordering allowed)", () => {
    const result = resolveCalendarOrder(-1);
    assert.deepEqual(result, { value: -1 });
  });

  it("float → coerced to float number", () => {
    const result = resolveCalendarOrder("3.5");
    assert.deepEqual(result, { value: 3.5 });
  });
});
