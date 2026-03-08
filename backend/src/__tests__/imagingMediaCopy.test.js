/**
 * Unit tests for the imaging-only XRAY media copy helpers.
 *
 * Tests buildMediaDedupeKey and filterNewMedia which are pure functions
 * used by copyXrayMediaToCanonical (the Prisma-backed helper called from
 * POST /api/appointments/:id/imaging/transition-to-ready).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildMediaDedupeKey,
  filterNewMedia,
} from "../utils/imagingMediaCopy.js";

// ---------------------------------------------------------------------------
// buildMediaDedupeKey
// ---------------------------------------------------------------------------

describe("buildMediaDedupeKey", () => {
  it("combines type, filePath, and toothCode", () => {
    const key = buildMediaDedupeKey({
      type: "XRAY",
      filePath: "/media/img.png",
      toothCode: "11",
    });
    assert.equal(key, "XRAY::/media/img.png::11");
  });

  it("treats null toothCode as empty string", () => {
    const key = buildMediaDedupeKey({
      type: "XRAY",
      filePath: "/media/img.png",
      toothCode: null,
    });
    assert.equal(key, "XRAY::/media/img.png::");
  });

  it("treats undefined toothCode as empty string", () => {
    const key = buildMediaDedupeKey({
      type: "XRAY",
      filePath: "/media/img.png",
    });
    assert.equal(key, "XRAY::/media/img.png::");
  });

  it("two rows with same data produce the same key", () => {
    const a = buildMediaDedupeKey({ type: "XRAY", filePath: "/media/x.png", toothCode: "12" });
    const b = buildMediaDedupeKey({ type: "XRAY", filePath: "/media/x.png", toothCode: "12" });
    assert.equal(a, b);
  });

  it("different filePaths produce different keys", () => {
    const a = buildMediaDedupeKey({ type: "XRAY", filePath: "/media/a.png", toothCode: null });
    const b = buildMediaDedupeKey({ type: "XRAY", filePath: "/media/b.png", toothCode: null });
    assert.notEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// filterNewMedia
// ---------------------------------------------------------------------------

describe("filterNewMedia – no existing canonical media", () => {
  it("returns all candidates when canonical is empty", () => {
    const candidates = [
      { type: "XRAY", filePath: "/media/a.png", toothCode: null },
      { type: "XRAY", filePath: "/media/b.png", toothCode: "11" },
    ];
    const result = filterNewMedia([], candidates);
    assert.deepEqual(result, candidates);
  });
});

describe("filterNewMedia – deduplication against canonical", () => {
  it("excludes candidates already in canonical", () => {
    const canonical = [
      { type: "XRAY", filePath: "/media/a.png", toothCode: null },
    ];
    const candidates = [
      { type: "XRAY", filePath: "/media/a.png", toothCode: null }, // duplicate
      { type: "XRAY", filePath: "/media/b.png", toothCode: null }, // new
    ];
    const result = filterNewMedia(canonical, candidates);
    assert.equal(result.length, 1);
    assert.equal(result[0].filePath, "/media/b.png");
  });

  it("returns empty array when all candidates are duplicates", () => {
    const canonical = [
      { type: "XRAY", filePath: "/media/a.png", toothCode: "11" },
      { type: "XRAY", filePath: "/media/b.png", toothCode: null },
    ];
    const candidates = [
      { type: "XRAY", filePath: "/media/a.png", toothCode: "11" },
      { type: "XRAY", filePath: "/media/b.png", toothCode: null },
    ];
    const result = filterNewMedia(canonical, candidates);
    assert.equal(result.length, 0);
  });

  it("treats null and undefined toothCode as the same (no duplicate)", () => {
    const canonical = [
      { type: "XRAY", filePath: "/media/a.png", toothCode: null },
    ];
    const candidates = [
      { type: "XRAY", filePath: "/media/a.png" }, // toothCode undefined → same key
    ];
    const result = filterNewMedia(canonical, candidates);
    assert.equal(result.length, 0);
  });
});

describe("filterNewMedia – intra-candidate deduplication", () => {
  it("skips duplicate rows within candidates themselves", () => {
    const candidates = [
      { type: "XRAY", filePath: "/media/a.png", toothCode: null },
      { type: "XRAY", filePath: "/media/a.png", toothCode: null }, // same as above
      { type: "XRAY", filePath: "/media/b.png", toothCode: null },
    ];
    const result = filterNewMedia([], candidates);
    assert.equal(result.length, 2);
    assert.equal(result[0].filePath, "/media/a.png");
    assert.equal(result[1].filePath, "/media/b.png");
  });
});

describe("filterNewMedia – preserves extra fields", () => {
  it("returned rows include original fields like id and encounterId", () => {
    const candidates = [
      { id: 42, encounterId: 5, type: "XRAY", filePath: "/media/x.png", toothCode: null },
    ];
    const result = filterNewMedia([], candidates);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 42);
    assert.equal(result[0].encounterId, 5);
  });
});
