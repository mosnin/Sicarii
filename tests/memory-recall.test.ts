// recallMemory is raw SQL over memory_chunks. A missing userId predicate is
// a cross-tenant leak: one agent's query would return another account's
// stored facts. storeMemory metering lives in tests/remember-credits.test.ts;
// this file pins the tenant fence and the graceful empty-on-miss paths.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { embedText } = vi.hoisted(() => ({ embedText: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({
  embedText,
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
}));

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRaw, $executeRaw: vi.fn() },
}));

vi.mock("@/lib/credits", () => ({
  ensureCredits: vi.fn(),
  spendCredits: vi.fn(),
}));

import { recallMemory } from "@/lib/memory";

function sqlFromCall(call: unknown[] | undefined): { sql: string; values: unknown[] } {
  if (!call) return { sql: "", values: [] };
  const [strings, ...values] = call;
  const parts = Array.isArray(strings) ? strings : [];
  return { sql: parts.join("?"), values };
}

beforeEach(() => {
  vi.clearAllMocks();
  embedText.mockResolvedValue([0.1, 0.2]);
  queryRaw.mockResolvedValue([]);
});

describe("recallMemory tenant fence", () => {
  it("scopes the similarity query to the calling userId", async () => {
    await recallMemory("user-A", "what did they say about pricing?");
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const { sql, values } = sqlFromCall(queryRaw.mock.calls[0] as unknown[]);
    expect(sql).toMatch(/WHERE\s+"userId"\s*=/);
    expect(values).toContain("user-A");
    expect(values).not.toContain("user-B");
  });

  it("binds a different userId when the caller changes — never a shared unscoped scan", async () => {
    await recallMemory("user-A", "pricing");
    await recallMemory("user-B", "pricing");
    expect(queryRaw).toHaveBeenCalledTimes(2);

    const first = sqlFromCall(queryRaw.mock.calls[0] as unknown[]);
    const second = sqlFromCall(queryRaw.mock.calls[1] as unknown[]);
    expect(first.values).toContain("user-A");
    expect(second.values).toContain("user-B");
    expect(first.sql).toBe(second.sql);
  });

  it("honors the requested limit so recall cannot dump the whole table", async () => {
    await recallMemory("user-A", "pricing", 3);
    const { sql, values } = sqlFromCall(queryRaw.mock.calls[0] as unknown[]);
    expect(sql).toMatch(/LIMIT\s+\?/);
    expect(values).toContain(3);
  });
});

describe("recallMemory miss paths", () => {
  it("returns [] when embeddings are unavailable — no query, no throw", async () => {
    embedText.mockResolvedValue(null);
    await expect(recallMemory("user-A", "anything")).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns [] when the vector query fails — never leaks the error to the agent", async () => {
    queryRaw.mockRejectedValue(new Error("pgvector down"));
    await expect(recallMemory("user-A", "anything")).resolves.toEqual([]);
  });
});
