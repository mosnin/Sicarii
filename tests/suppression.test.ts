// Suppression ops: the opt-out ledger's management surface and the shared
// enforcement check, both userId-scoped.
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { userId: string; email?: string; domain?: string; scope: string; reason: string | null; createdAt: Date };
const contacts: Row[] = [];
const domains: Row[] = [];

function findFirst(rows: Row[], where: Record<string, unknown>) {
  return (
    rows.find((r) => {
      for (const [k, v] of Object.entries(where)) {
        if (k === "userId" && r.userId !== v) return false;
        if (k === "scope" && typeof v === "object" && v && "in" in v) {
          if (!(v as { in: string[] }).in.includes(r.scope)) return false;
        }
        if ((k === "email" || k === "domain") && typeof v === "object" && v && "equals" in v) {
          const target = (v as { equals: string }).equals.toLowerCase();
          if ((r[k as "email" | "domain"] ?? "").toLowerCase() !== target) return false;
        }
      }
      return true;
    }) ?? null
  );
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    suppressedContact: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => findFirst(contacts, where),
      findMany: async ({ where }: { where: { userId: string } }) => contacts.filter((c) => c.userId === where.userId),
      upsert: async ({ where, create, update }: { where: { userId_email: { userId: string; email: string } }; create: Row; update: Partial<Row> }) => {
        const existing = contacts.find((c) => c.userId === where.userId_email.userId && c.email === where.userId_email.email);
        if (existing) return Object.assign(existing, update);
        const row = { ...create, createdAt: new Date() };
        contacts.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string; email: string } }) => {
        const before = contacts.length;
        for (let i = contacts.length - 1; i >= 0; i--) if (contacts[i].userId === where.userId && contacts[i].email === where.email) contacts.splice(i, 1);
        return { count: before - contacts.length };
      },
    },
    suppressedDomain: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => findFirst(domains, where),
      findMany: async ({ where }: { where: { userId: string } }) => domains.filter((d) => d.userId === where.userId),
      upsert: async ({ where, create }: { where: { userId_domain: { userId: string; domain: string } }; create: Row }) => {
        const row = { ...create, createdAt: new Date() };
        domains.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string; domain: string } }) => {
        const before = domains.length;
        for (let i = domains.length - 1; i >= 0; i--) if (domains[i].userId === where.userId && domains[i].domain === where.domain) domains.splice(i, 1);
        return { count: before - domains.length };
      },
    },
  },
}));

import { addSuppression, removeSuppression, checkSuppressed, assertNotSuppressed } from "@/lib/suppression";

beforeEach(() => {
  contacts.length = 0;
  domains.length = 0;
});

describe("suppression", () => {
  it("blocks an outbound send to a suppressed email (case-insensitive)", async () => {
    await addSuppression("u1", { email: "Jane@Acme.com", scope: "ALL" });
    expect((await checkSuppressed("u1", "jane@acme.com", "outbound")).suppressed).toBe(true);
    await expect(assertNotSuppressed("u1", "JANE@ACME.COM", "outbound")).rejects.toMatchObject({ status: 409 });
  });

  it("blocks a whole suppressed domain", async () => {
    await addSuppression("u1", { domain: "spam-target.com" });
    expect((await checkSuppressed("u1", "anyone@spam-target.com")).matched).toBe("domain");
  });

  it("respects scope direction: an INBOUND-only suppression does not block an outbound send", async () => {
    await addSuppression("u1", { email: "a@b.com", scope: "INBOUND" });
    expect((await checkSuppressed("u1", "a@b.com", "outbound")).suppressed).toBe(false);
    expect((await checkSuppressed("u1", "a@b.com", "inbound")).suppressed).toBe(true);
  });

  it("is tenant-scoped: one tenant's suppression never affects another", async () => {
    await addSuppression("u1", { email: "shared@x.com" });
    expect((await checkSuppressed("u2", "shared@x.com")).suppressed).toBe(false);
  });

  it("rejects supplying both or neither of email and domain", async () => {
    await expect(addSuppression("u1", {})).rejects.toMatchObject({ status: 400 });
    await expect(addSuppression("u1", { email: "a@b.com", domain: "b.com" })).rejects.toMatchObject({ status: 400 });
  });

  it("remove reports whether a row was actually removed", async () => {
    await addSuppression("u1", { email: "gone@x.com" });
    expect(await removeSuppression("u1", { email: "gone@x.com" })).toEqual({ removed: true });
    expect(await removeSuppression("u1", { email: "never@x.com" })).toEqual({ removed: false });
  });
});
