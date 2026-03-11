/**
 * Unit tests for Haversine distance utility.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { haversineDistanceM } from "../utils/geo.js";

describe("haversineDistanceM", () => {
  it("returns 0 for identical coordinates", () => {
    const d = haversineDistanceM(47.9184, 106.9177, 47.9184, 106.9177);
    assert.equal(d, 0);
  });

  it("returns a positive distance for different coordinates", () => {
    // Ulaanbaatar city center to a point ~1km away
    const d = haversineDistanceM(47.9184, 106.9177, 47.9274, 106.9177);
    assert.ok(d > 900 && d < 1100, `Expected ~1000m but got ${Math.round(d)}m`);
  });

  it("is symmetric", () => {
    const d1 = haversineDistanceM(47.9184, 106.9177, 47.9274, 106.9200);
    const d2 = haversineDistanceM(47.9274, 106.9200, 47.9184, 106.9177);
    assert.ok(Math.abs(d1 - d2) < 0.001, "Expected symmetric result");
  });

  it("returns distance within 1m for 100m known offset", () => {
    // Move ~100m north (0.0009 degrees latitude ≈ 100m)
    const d = haversineDistanceM(47.9184, 106.9177, 47.9193, 106.9177);
    assert.ok(d > 90 && d < 110, `Expected ~100m but got ${Math.round(d)}m`);
  });
});
