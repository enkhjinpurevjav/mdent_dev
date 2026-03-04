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

// ---------------------------------------------------------------------------
// Inline mapping logic mirroring GET /api/users list response
// ---------------------------------------------------------------------------

function mapUserToListItem(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    ovog: u.ovog,
    role: u.role,
    branchId: u.branchId,
    branch: u.branch ? { id: u.branch.id, name: u.branch.name } : null,
    branches:
      u.doctorBranches?.map((db) => ({
        id: db.branch.id,
        name: db.branch.name,
      })) ?? [],
    regNo: u.regNo,
    phone: u.phone || null,
    licenseNumber: u.licenseNumber,
    licenseExpiryDate: u.licenseExpiryDate
      ? u.licenseExpiryDate.toISOString()
      : null,
    calendarOrder: u.calendarOrder ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

describe("GET /api/users – calendarOrder in list response", () => {
  const base = {
    id: 1,
    email: "doc@test.com",
    name: "Bat",
    ovog: "Bold",
    role: "doctor",
    branchId: null,
    branch: null,
    doctorBranches: [],
    regNo: null,
    phone: null,
    licenseNumber: null,
    licenseExpiryDate: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  it("includes calendarOrder in list response when set to a number", () => {
    const user = { ...base, calendarOrder: 3 };
    const item = mapUserToListItem(user);
    assert.equal(item.calendarOrder, 3);
  });

  it("includes calendarOrder as null in list response when null", () => {
    const user = { ...base, calendarOrder: null };
    const item = mapUserToListItem(user);
    assert.equal(item.calendarOrder, null);
  });

  it("includes calendarOrder as null in list response when undefined", () => {
    const user = { ...base, calendarOrder: undefined };
    const item = mapUserToListItem(user);
    assert.equal(item.calendarOrder, null);
  });

  it("preserves zero as a valid calendarOrder in list response", () => {
    const user = { ...base, calendarOrder: 0 };
    const item = mapUserToListItem(user);
    assert.equal(item.calendarOrder, 0);
  });

  it("list is sortable by calendarOrder after loading", () => {
    const users = [
      { ...base, id: 1, calendarOrder: 20 },
      { ...base, id: 2, calendarOrder: 10 },
      { ...base, id: 3, calendarOrder: null },
    ].map(mapUserToListItem);

    const sorted = [...users].sort((a, b) => {
      const ao = (a.calendarOrder ?? 0);
      const bo = (b.calendarOrder ?? 0);
      return ao - bo;
    });

    assert.equal(sorted[0].id, 3); // null → 0
    assert.equal(sorted[1].id, 2); // 10
    assert.equal(sorted[2].id, 1); // 20
  });
});

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
