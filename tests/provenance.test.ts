// Tests for provenance write helpers and staleness logic.
// These tests run against the pure logic only (no DB) - the DB-touching
// functions are tested via mocks so the suite can run without a live Postgres.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Pure helpers re-exported for testing ──────────────────────────────────────

// We test the staleness predicate and the confidence constants directly.
import { CONFIDENCE, STALE_AFTER_DAYS } from "@/lib/provenance";

// ── Mock the prisma module ────────────────────────────────────────────────────

const mockUpsert = vi.fn().mockResolvedValue({});
const mockUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const mockFindMany = vi.fn().mockResolvedValue([]);
const mockUpdate = vi.fn().mockResolvedValue({});
const mockFindUnique = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fieldProvenance: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// Re-import AFTER mocking so the module picks up the mock.
import {
  recordProvenance,
  recordProvenanceBulk,
  getProvenanceMap,
  markStaleProvenance,
} from "@/lib/provenance";

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockUpdateMany.mockResolvedValue({ count: 0 });
  mockFindMany.mockResolvedValue([]);
  mockUpdate.mockResolvedValue({});
  mockFindUnique.mockResolvedValue(null);
});

// ── CONFIDENCE constants ───────────────────────────────────────────────────────

describe("CONFIDENCE presets", () => {
  it("each preset is between 1 and 100", () => {
    for (const [k, v] of Object.entries(CONFIDENCE)) {
      expect(v, k).toBeGreaterThanOrEqual(1);
      expect(v, k).toBeLessThanOrEqual(100);
    }
  });

  it("manual is the highest confidence (user-entered data is authoritative)", () => {
    expect(CONFIDENCE.manual).toBeGreaterThan(CONFIDENCE.explorium);
    expect(CONFIDENCE.manual).toBeGreaterThan(CONFIDENCE.pipe0);
    expect(CONFIDENCE.manual).toBeGreaterThan(CONFIDENCE.exa);
  });

  it("commercial providers rank above neural search (explorium/pipe0 > exa)", () => {
    expect(CONFIDENCE.explorium).toBeGreaterThanOrEqual(CONFIDENCE.exa);
    expect(CONFIDENCE.pipe0).toBeGreaterThanOrEqual(CONFIDENCE.exa);
  });
});

// ── STALE_AFTER_DAYS constant ──────────────────────────────────────────────────

describe("STALE_AFTER_DAYS", () => {
  it("is a positive number of days", () => {
    expect(STALE_AFTER_DAYS).toBeGreaterThan(0);
    expect(Number.isInteger(STALE_AFTER_DAYS)).toBe(true);
  });
});

// ── recordProvenance ───────────────────────────────────────────────────────────

describe("recordProvenance", () => {
  it("calls prisma upsert with the correct key", async () => {
    await recordProvenance({
      recordType: "contact",
      recordId: "cid-1",
      field: "email",
      source: "pipe0",
      value: "jane@example.com",
    });
    expect(mockUpsert).toHaveBeenCalledOnce();
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where.recordType_recordId_field).toEqual({
      recordType: "contact",
      recordId: "cid-1",
      field: "email",
    });
    expect(call.create.source).toBe("pipe0");
    expect(call.create.confidence).toBe(CONFIDENCE.pipe0);
    expect(call.create.valueSnapshot).toBe("jane@example.com");
  });

  it("uses a default confidence of 80 for unknown sources", async () => {
    await recordProvenance({
      recordType: "entity",
      recordId: "eid-1",
      field: "industry",
      source: "some-new-provider",
    });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.confidence).toBe(80);
  });

  it("respects an explicit confidence override", async () => {
    await recordProvenance({
      recordType: "contact",
      recordId: "cid-2",
      field: "phone",
      source: "exa",
      confidence: 55,
      value: "+15559991234",
    });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.confidence).toBe(55);
  });

  it("truncates long values to 500 chars in the snapshot", async () => {
    const longValue = "x".repeat(600);
    await recordProvenance({
      recordType: "entity",
      recordId: "eid-2",
      field: "description",
      source: "explorium",
      value: longValue,
    });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.valueSnapshot?.length).toBe(500);
    expect(call.create.valueSnapshot?.endsWith("...")).toBe(true);
  });

  it("stores undefined snapshot for null/empty values", async () => {
    await recordProvenance({
      recordType: "contact",
      recordId: "cid-3",
      field: "linkedin",
      source: "explorium",
      value: null,
    });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.valueSnapshot).toBeUndefined();
  });

  it("never throws even when prisma fails (best-effort)", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      recordProvenance({ recordType: "contact", recordId: "x", field: "email", source: "exa" }),
    ).resolves.toBeUndefined();
  });
});

// ── recordProvenanceBulk ───────────────────────────────────────────────────────

describe("recordProvenanceBulk", () => {
  it("calls upsert once per input", async () => {
    await recordProvenanceBulk([
      { recordType: "entity", recordId: "eid-3", field: "industry", source: "explorium" },
      { recordType: "entity", recordId: "eid-3", field: "phone", source: "explorium" },
      { recordType: "entity", recordId: "eid-3", field: "location", source: "explorium" },
    ]);
    expect(mockUpsert).toHaveBeenCalledTimes(3);
  });

  it("resolves even when some upserts fail", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("fail"));
    await expect(
      recordProvenanceBulk([
        { recordType: "entity", recordId: "e", field: "a", source: "explorium" },
        { recordType: "entity", recordId: "e", field: "b", source: "explorium" },
      ]),
    ).resolves.toBeUndefined();
  });
});

// ── getProvenanceMap ───────────────────────────────────────────────────────────

describe("getProvenanceMap", () => {
  it("returns a map keyed by field name", async () => {
    const now = new Date();
    mockFindMany.mockResolvedValueOnce([
      { field: "email", source: "pipe0", confidence: 85, retrievedAt: now, verifiedAt: now, stale: false },
      { field: "phone", source: "explorium", confidence: 90, retrievedAt: now, verifiedAt: null, stale: false },
    ]);
    const map = await getProvenanceMap("contact", "cid-99");
    expect(Object.keys(map)).toEqual(expect.arrayContaining(["email", "phone"]));
    expect(map.email.source).toBe("pipe0");
    expect(map.phone.source).toBe("explorium");
  });

  it("returns an empty object when no rows exist", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const map = await getProvenanceMap("entity", "eid-99");
    expect(map).toEqual({});
  });

  it("returns an empty object when prisma fails (graceful fallback)", async () => {
    mockFindMany.mockRejectedValueOnce(new Error("DB down"));
    const map = await getProvenanceMap("contact", "c-fail");
    expect(map).toEqual({});
  });
});

// ── markStaleProvenance ────────────────────────────────────────────────────────

describe("markStaleProvenance", () => {
  it("updates rows with stale=false and retrievedAt before the cutoff", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 7 });
    const count = await markStaleProvenance();
    expect(count).toBe(7);
    const call = mockUpdateMany.mock.calls[0][0];
    expect(call.where.stale).toBe(false);
    // The cutoff should be in the past (less than now).
    expect(call.where.retrievedAt.lt.getTime()).toBeLessThan(Date.now());
    expect(call.data.stale).toBe(true);
  });

  it("uses a cutoff exactly STALE_AFTER_DAYS days ago", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const before = Date.now();
    await markStaleProvenance();
    const after = Date.now();
    const call = mockUpdateMany.mock.calls[0][0];
    const cutoff = call.where.retrievedAt.lt.getTime();
    const expectedCutoff = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    // cutoff should be approximately (now - STALE_AFTER_DAYS days) within a few ms.
    expect(before - cutoff).toBeGreaterThanOrEqual(expectedCutoff - 100);
    expect(after - cutoff).toBeLessThanOrEqual(expectedCutoff + 100);
  });
});
