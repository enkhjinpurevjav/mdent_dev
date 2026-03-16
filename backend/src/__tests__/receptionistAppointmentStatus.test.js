/**
 * Unit tests for receptionist appointment status transition rules.
 *
 * Tests the inline logic from PATCH /api/appointments/:id:
 *
 *   - Receptionist CAN set status to "ongoing" from any other status
 *     (this is the patient check-in action).
 *   - Receptionist CANNOT change status away from "ongoing" when an encounter
 *     already exists for the appointment; returns 403 "Үзлэг эхэлсэн байна".
 *   - Receptionist CAN change status away from "ongoing" when NO encounter
 *     exists yet (e.g. doctor portal opened the encounter tab but hasn't saved).
 *   - Non-receptionist roles are not subject to this restriction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline logic mirroring the relevant block in routes/appointments.js
// ---------------------------------------------------------------------------

/**
 * Simulates the receptionist status-change guard.
 *
 * @param {object} params
 * @param {string} params.requesterRole   - e.g. "receptionist", "admin", "doctor"
 * @param {string} params.existingStatus  - current status in DB (e.g. "ongoing")
 * @param {string} params.normalizedStatus - requested new status after normalization
 * @param {number} params.encounterCount  - number of encounters for this appointment
 * @returns {{ blocked: boolean, error?: string }}
 */
function applyReceptionistStatusGuard({ requesterRole, existingStatus, normalizedStatus, encounterCount }) {
  if (
    requesterRole === "receptionist" &&
    existingStatus === "ongoing" &&
    normalizedStatus !== "ongoing"
  ) {
    if (encounterCount > 0) {
      return { blocked: true, error: "Үзлэг эхэлсэн байна" };
    }
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Tests: receptionist check-in (set to ongoing)
// ---------------------------------------------------------------------------

describe("receptionist — setting status to 'ongoing' (check-in)", () => {
  it("allows receptionist to set status to ongoing from booked", () => {
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "booked",
      normalizedStatus: "ongoing",
      encounterCount: 0,
    });
    assert.equal(result.blocked, false);
  });

  it("allows receptionist to set status to ongoing from confirmed", () => {
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "confirmed",
      normalizedStatus: "ongoing",
      encounterCount: 0,
    });
    assert.equal(result.blocked, false);
  });

  it("allows receptionist to set status to ongoing from online", () => {
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "online",
      normalizedStatus: "ongoing",
      encounterCount: 0,
    });
    assert.equal(result.blocked, false);
  });

  it("allows receptionist to set status to ongoing even when encounter exists (re-check-in edge case)", () => {
    // Setting TO ongoing is always allowed; only setting AWAY from ongoing is guarded.
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "booked",
      normalizedStatus: "ongoing",
      encounterCount: 1,
    });
    assert.equal(result.blocked, false);
  });
});

// ---------------------------------------------------------------------------
// Tests: receptionist trying to change status AWAY from ongoing
// ---------------------------------------------------------------------------

describe("receptionist — changing status away from 'ongoing'", () => {
  it("blocks when encounter exists — returns Үзлэг эхэлсэн байна", () => {
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "ongoing",
      normalizedStatus: "booked",
      encounterCount: 1,
    });
    assert.equal(result.blocked, true);
    assert.equal(result.error, "Үзлэг эхэлсэн байна");
  });

  it("blocks when multiple encounters exist", () => {
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "ongoing",
      normalizedStatus: "confirmed",
      encounterCount: 3,
    });
    assert.equal(result.blocked, true);
    assert.equal(result.error, "Үзлэг эхэлсэн байна");
  });

  it("allows when no encounter exists yet", () => {
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "ongoing",
      normalizedStatus: "booked",
      encounterCount: 0,
    });
    assert.equal(result.blocked, false);
  });

  it("allows setting ongoing → ongoing (no-op) regardless of encounters", () => {
    const result = applyReceptionistStatusGuard({
      requesterRole: "receptionist",
      existingStatus: "ongoing",
      normalizedStatus: "ongoing",
      encounterCount: 5,
    });
    assert.equal(result.blocked, false);
  });
});

// ---------------------------------------------------------------------------
// Tests: non-receptionist roles are NOT subject to this guard
// ---------------------------------------------------------------------------

describe("non-receptionist roles — not subject to this guard", () => {
  for (const role of ["admin", "super_admin", "doctor", "nurse"]) {
    it(`${role} can change status away from ongoing regardless of encounters`, () => {
      const result = applyReceptionistStatusGuard({
        requesterRole: role,
        existingStatus: "ongoing",
        normalizedStatus: "completed",
        encounterCount: 10,
      });
      assert.equal(result.blocked, false);
    });
  }
});
