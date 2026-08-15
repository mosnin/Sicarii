import { afterEach, describe, expect, it, vi } from "vitest";
import { adminEmails, isPlatformAdmin } from "@/lib/admin";
import { contactWhere, parseListRules } from "@/lib/crm-lists";

describe("isPlatformAdmin", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("treats role=admin as staff", () => {
    expect(isPlatformAdmin({ role: "admin", email: "a@b.com" })).toBe(true);
  });

  it("does not treat workspace admin role strings as platform admin", () => {
    expect(isPlatformAdmin({ role: "member", email: "a@b.com" })).toBe(false);
    expect(isPlatformAdmin({ role: "team", email: "a@b.com" })).toBe(false);
  });

  it("matches ADMIN_EMAILS case-insensitively", () => {
    process.env.ADMIN_EMAILS = "Founder@Scalar.dev, other@x.com";
    expect(isPlatformAdmin({ role: "member", email: "founder@scalar.dev" })).toBe(true);
    expect(isPlatformAdmin({ role: "member", email: "nope@x.com" })).toBe(false);
  });

  it("parses the env list without empty slots", () => {
    process.env.ADMIN_EMAILS = " a@b.com, ,C@D.com ";
    expect(adminEmails()).toEqual(["a@b.com", "c@d.com"]);
  });
});

describe("contactWhere / list rules", () => {
  it("always scopes to userId", () => {
    expect(contactWhere("u1")).toEqual({ userId: "u1" });
  });

  it("applies status, tag, industry, search, and list membership", () => {
    const where = contactWhere("u1", {
      status: "QUALIFIED",
      tag: "fintech",
      industry: "Finance",
      q: "ada",
      listId: "11111111-1111-1111-1111-111111111111",
    });
    expect(where.userId).toBe("u1");
    expect(where.status).toBe("QUALIFIED");
    expect(where.tags).toEqual({ has: "fintech" });
    expect(where.entity).toEqual({ industry: { equals: "Finance", mode: "insensitive" } });
    expect(where.segments).toEqual({
      some: { segmentId: "11111111-1111-1111-1111-111111111111" },
    });
    expect(where.OR).toBeTruthy();
  });

  it("ignores an unknown status so it cannot be used as an injection", () => {
    expect(contactWhere("u1", { status: "DROP TABLE" }).status).toBeUndefined();
  });

  it("parseListRules keeps only known keys", () => {
    expect(parseListRules({ status: "NEW", extra: "nope", industry: "SaaS" })).toEqual({
      status: "NEW",
      industry: "SaaS",
    });
    expect(parseListRules(null)).toBeNull();
    expect(parseListRules("x")).toBeNull();
  });
});
