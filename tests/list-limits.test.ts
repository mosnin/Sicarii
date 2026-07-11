// List sizing contract for the shared ops layer (Codex audit 2026-07-11).
//
// Live finding: list_entities / list_contacts ignored client limits (a
// hardcoded take: 200 dumped the whole CRM regardless of {limit: 1}), and the
// `search` param from older agent docs was silently dropped. These tests pin
// the repaired contract: the caller's limit is enforced (clamped to 1..200,
// default 50) and the query actually filters.

import { describe, it, expect, vi, beforeEach } from "vitest";

const entityFindMany = vi.fn().mockResolvedValue([]);
const contactFindMany = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: { findMany: (...a: unknown[]) => entityFindMany(...a) },
    contact: { findMany: (...a: unknown[]) => contactFindMany(...a) },
  },
}));

import {
  listEntities,
  listContacts,
  clampListLimit,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} from "@/lib/crm-operations";

beforeEach(() => {
  entityFindMany.mockClear();
  contactFindMany.mockClear();
});

describe("clampListLimit", () => {
  it("defaults when unset or not finite", () => {
    expect(clampListLimit()).toBe(DEFAULT_LIST_LIMIT);
    expect(clampListLimit(undefined)).toBe(DEFAULT_LIST_LIMIT);
    expect(clampListLimit(Number.NaN)).toBe(DEFAULT_LIST_LIMIT);
    expect(clampListLimit(Infinity)).toBe(DEFAULT_LIST_LIMIT);
  });
  it("clamps to 1..MAX and truncates", () => {
    expect(clampListLimit(1)).toBe(1);
    expect(clampListLimit(0)).toBe(1);
    expect(clampListLimit(-5)).toBe(1);
    expect(clampListLimit(2.9)).toBe(2);
    expect(clampListLimit(MAX_LIST_LIMIT)).toBe(MAX_LIST_LIMIT);
    expect(clampListLimit(9999)).toBe(MAX_LIST_LIMIT);
  });
});

describe("listEntities", () => {
  it("passes the caller's limit through as take", async () => {
    await listEntities("u1", undefined, 1);
    expect(entityFindMany).toHaveBeenCalledTimes(1);
    expect(entityFindMany.mock.calls[0][0].take).toBe(1);
  });
  it("accepts limit as the third positional arg (the agent/MCP call shape)", async () => {
    // Both the MCP tool and the in-app agent tool call listEntities(userId,
    // query, limit) positionally; a handler that drops the third arg (the bug
    // Codex found) would silently fall back to the default. Pin the shape.
    await listEntities("u1", "acme", 7);
    expect(entityFindMany.mock.calls[0][0].take).toBe(7);
  });
  it("defaults take when no limit is given", async () => {
    await listEntities("u1");
    expect(entityFindMany.mock.calls[0][0].take).toBe(DEFAULT_LIST_LIMIT);
  });
  it("caps take at the ceiling", async () => {
    await listEntities("u1", undefined, 100000);
    expect(entityFindMany.mock.calls[0][0].take).toBe(MAX_LIST_LIMIT);
  });
  it("applies the query as a filter and always scopes by userId", async () => {
    await listEntities("u1", "acme", 5);
    const where = entityFindMany.mock.calls[0][0].where;
    expect(where.userId).toBe("u1");
    expect(where.OR).toBeDefined();
    expect(JSON.stringify(where.OR)).toContain("acme");
  });
  it("omits the filter when no query is given", async () => {
    await listEntities("u1");
    expect(entityFindMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});

describe("listContacts", () => {
  it("passes the caller's limit through as take", async () => {
    await listContacts("u1", { limit: 1 });
    expect(contactFindMany.mock.calls[0][0].take).toBe(1);
  });
  it("defaults take when no limit is given", async () => {
    await listContacts("u1", {});
    expect(contactFindMany.mock.calls[0][0].take).toBe(DEFAULT_LIST_LIMIT);
  });
  it("caps take at the ceiling", async () => {
    await listContacts("u1", { limit: 100000 });
    expect(contactFindMany.mock.calls[0][0].take).toBe(MAX_LIST_LIMIT);
  });
  it("applies the query as a filter and always scopes by userId", async () => {
    await listContacts("u1", { q: "__codex_audit_no_match__", limit: 10 });
    const where = contactFindMany.mock.calls[0][0].where;
    expect(where.userId).toBe("u1");
    expect(JSON.stringify(where.OR)).toContain("__codex_audit_no_match__");
  });
  it("ignores an unknown status value instead of filtering wrong", async () => {
    await listContacts("u1", { status: "NOT_A_STATUS" });
    expect(contactFindMany.mock.calls[0][0].where.status).toBeUndefined();
  });
});
