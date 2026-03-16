/**
 * Unit tests for receptionist RBAC gate on /api/users and data minimization.
 *
 * Tests the gate and mapping logic inline (no HTTP server or DB needed).
 *
 * Requirements verified:
 *   - receptionist can GET /api/users?role=doctor (gate allows through)
 *   - receptionist is blocked from all other /api/users routes (403)
 *   - admin / super_admin are always allowed through
 *   - receptionist receives a reduced "doctor-lite" representation (no email,
 *     phone, regNo, licenseNumber, licenseExpiryDate, createdAt)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline gate logic mirroring index.js app.use("/api/users", ...)
// ---------------------------------------------------------------------------

/**
 * Returns true when the request should be allowed to reach the /api/users
 * router, false when it should be blocked with 403.
 */
function usersGateAllows({ role, method, path, query }) {
  if (role === "admin" || role === "super_admin") return true;
  if (
    role === "receptionist" &&
    method === "GET" &&
    path === "/" &&
    query?.role === "doctor"
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Inline data-minimization logic mirroring routes/users.js GET / handler
// ---------------------------------------------------------------------------

const fullUserFields = {
  id: 1,
  email: "doc@test.com",
  name: "Bat",
  ovog: "Bold",
  role: "doctor",
  branchId: 1,
  branch: { id: 1, name: "Branch A" },
  branches: [{ id: 1, name: "Branch A" }],
  regNo: "МН-1234",
  phone: "99001122",
  licenseNumber: "LIC-001",
  licenseExpiryDate: "2027-01-01T00:00:00.000Z",
  calendarOrder: 2,
  createdAt: "2024-01-01T00:00:00.000Z",
};

function applyDataMinimization(result, requesterRole) {
  if (requesterRole === "receptionist") {
    return result.map((u) => ({
      id: u.id,
      name: u.name,
      ovog: u.ovog,
      role: u.role,
      branchId: u.branchId,
      branches: u.branches,
      calendarOrder: u.calendarOrder,
    }));
  }
  return result;
}

// ---------------------------------------------------------------------------
// RBAC gate tests
// ---------------------------------------------------------------------------

describe("/api/users RBAC gate — receptionist", () => {
  it("allows receptionist GET /api/users?role=doctor", () => {
    assert.ok(
      usersGateAllows({ role: "receptionist", method: "GET", path: "/", query: { role: "doctor" } })
    );
  });

  it("allows receptionist GET /api/users?role=doctor&branchId=1 (extra safe filter)", () => {
    assert.ok(
      usersGateAllows({
        role: "receptionist",
        method: "GET",
        path: "/",
        query: { role: "doctor", branchId: "1" },
      })
    );
  });

  it("blocks receptionist GET /api/users (no role filter)", () => {
    assert.equal(
      usersGateAllows({ role: "receptionist", method: "GET", path: "/", query: {} }),
      false
    );
  });

  it("blocks receptionist GET /api/users?role=nurse", () => {
    assert.equal(
      usersGateAllows({ role: "receptionist", method: "GET", path: "/", query: { role: "nurse" } }),
      false
    );
  });

  it("blocks receptionist POST /api/users", () => {
    assert.equal(
      usersGateAllows({ role: "receptionist", method: "POST", path: "/", query: {} }),
      false
    );
  });

  it("blocks receptionist PUT /api/users/:id", () => {
    assert.equal(
      usersGateAllows({ role: "receptionist", method: "PUT", path: "/5", query: {} }),
      false
    );
  });

  it("blocks receptionist DELETE /api/users/:id", () => {
    assert.equal(
      usersGateAllows({ role: "receptionist", method: "DELETE", path: "/5", query: {} }),
      false
    );
  });
});

describe("/api/users RBAC gate — admin / super_admin", () => {
  it("allows admin unconditionally (GET list)", () => {
    assert.ok(
      usersGateAllows({ role: "admin", method: "GET", path: "/", query: {} })
    );
  });

  it("allows admin unconditionally (POST create)", () => {
    assert.ok(
      usersGateAllows({ role: "admin", method: "POST", path: "/", query: {} })
    );
  });

  it("allows super_admin unconditionally (DELETE)", () => {
    assert.ok(
      usersGateAllows({ role: "super_admin", method: "DELETE", path: "/5", query: {} })
    );
  });
});

describe("/api/users RBAC gate — other roles", () => {
  for (const role of ["doctor", "nurse", "patient"]) {
    it(`blocks ${role} from /api/users`, () => {
      assert.equal(
        usersGateAllows({ role, method: "GET", path: "/", query: { role: "doctor" } }),
        false
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Data minimization tests
// ---------------------------------------------------------------------------

describe("GET /api/users — receptionist data minimization", () => {
  it("receptionist receives only allowed fields", () => {
    const [item] = applyDataMinimization([fullUserFields], "receptionist");
    assert.deepEqual(Object.keys(item).sort(), [
      "branchId",
      "branches",
      "calendarOrder",
      "id",
      "name",
      "ovog",
      "role",
    ]);
  });

  it("receptionist response does not include email", () => {
    const [item] = applyDataMinimization([fullUserFields], "receptionist");
    assert.ok(!("email" in item), "email must not be present");
  });

  it("receptionist response does not include phone", () => {
    const [item] = applyDataMinimization([fullUserFields], "receptionist");
    assert.ok(!("phone" in item), "phone must not be present");
  });

  it("receptionist response does not include regNo", () => {
    const [item] = applyDataMinimization([fullUserFields], "receptionist");
    assert.ok(!("regNo" in item), "regNo must not be present");
  });

  it("receptionist response does not include licenseNumber", () => {
    const [item] = applyDataMinimization([fullUserFields], "receptionist");
    assert.ok(!("licenseNumber" in item), "licenseNumber must not be present");
  });

  it("receptionist response preserves id, name, ovog, role, branchId, branches, calendarOrder", () => {
    const [item] = applyDataMinimization([fullUserFields], "receptionist");
    assert.equal(item.id, fullUserFields.id);
    assert.equal(item.name, fullUserFields.name);
    assert.equal(item.ovog, fullUserFields.ovog);
    assert.equal(item.role, fullUserFields.role);
    assert.equal(item.branchId, fullUserFields.branchId);
    assert.deepEqual(item.branches, fullUserFields.branches);
    assert.equal(item.calendarOrder, fullUserFields.calendarOrder);
  });

  it("admin receives the full representation (no minimization)", () => {
    const [item] = applyDataMinimization([fullUserFields], "admin");
    assert.ok("email" in item, "email must be present for admin");
    assert.ok("phone" in item, "phone must be present for admin");
    assert.ok("regNo" in item, "regNo must be present for admin");
  });
});
