// Owner/admin plan-cap bypass: unlimited credits and monitors for the
// application owner, without weakening tenant isolation.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
const ledgerCreate = vi.fn();
const executeRaw = vi.fn();
const contactFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
    contact: { findUnique: (...a: unknown[]) => contactFindUnique(...a) },
    creditLedger: { create: (...a: unknown[]) => ledgerCreate(...a) },
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
  },
}));

import {
  isOwnerAdmin,
  ownerEmails,
  roleForEmail,
  isMonitorCapReached,
  monitorCapFor,
} from "@/lib/admin";
import { hasCredits, ensureCredits, ensureCreditsForCount, spendCredits } from "@/lib/credits";
import { getContact, OpError } from "@/lib/crm-operations";

const OWNER_ENV = { OWNER_EMAILS: "owner@scalar.test, alt@scalar.test" };

beforeEach(() => {
  findUnique.mockReset();
  updateMany.mockReset();
  ledgerCreate.mockReset();
  contactFindUnique.mockReset();
  executeRaw.mockReset().mockResolvedValue(0);
});

afterEach(() => {
  delete process.env.OWNER_EMAILS;
  delete process.env.OWNER_EMAIL;
});

describe("isOwnerAdmin", () => {
  it("matches role=admin even without an owner email", () => {
    expect(isOwnerAdmin({ role: "admin", email: "anyone@example.com" }, {})).toBe(true);
  });

  it("matches an OWNER_EMAILS address regardless of stored role", () => {
    expect(isOwnerAdmin({ role: "member", email: "Owner@Scalar.test" }, OWNER_ENV)).toBe(true);
    expect(isOwnerAdmin({ role: "member", email: "alt@scalar.test" }, OWNER_ENV)).toBe(true);
  });

  it("does not treat a team workspace admin as the application owner", () => {
    // Workspace rows have empty email and role member; Clerk org admin lives
    // on TeamMember, not User.role.
    expect(isOwnerAdmin({ role: "member", email: "" }, OWNER_ENV)).toBe(false);
    expect(isOwnerAdmin({ role: "member", email: "customer@acme.com" }, OWNER_ENV)).toBe(false);
  });

  it("parses comma-separated OWNER_EMAILS and the OWNER_EMAIL alias", () => {
    expect(ownerEmails(OWNER_ENV)).toEqual(["owner@scalar.test", "alt@scalar.test"]);
    expect(ownerEmails({ OWNER_EMAIL: "solo@scalar.test" })).toEqual(["solo@scalar.test"]);
  });

  it("stamps role=admin only for owner emails", () => {
    expect(roleForEmail("owner@scalar.test", "member", OWNER_ENV)).toBe("admin");
    expect(roleForEmail("customer@acme.com", "member", OWNER_ENV)).toBe("member");
  });
});

describe("monitor cap bypass", () => {
  it("is unlimited for an owner admin and numeric for everyone else", () => {
    expect(monitorCapFor({ role: "admin" }, 0)).toBeNull();
    expect(monitorCapFor({ role: "member", email: "owner@scalar.test" }, 0, OWNER_ENV)).toBeNull();
    expect(isMonitorCapReached({ role: "admin" }, 99, 0)).toBe(false);
    expect(isMonitorCapReached({ role: "member", email: "customer@acme.com" }, 0, 0)).toBe(true);
    expect(isMonitorCapReached({ role: "member" }, 1, 1)).toBe(true);
    expect(isMonitorCapReached({ role: "member" }, 0, 1)).toBe(false);
  });
});

describe("credit meter bypass", () => {
  it("lets an owner admin through with a zero balance and never debits", async () => {
    findUnique.mockResolvedValue({
      creditsRemaining: 0,
      role: "admin",
      email: "owner@scalar.test",
    });

    await expect(hasCredits("owner-1", "find_companies")).resolves.toBe(true);
    await expect(ensureCredits("owner-1", "find_companies")).resolves.toBeUndefined();
    await expect(ensureCreditsForCount("owner-1", "find_companies", 8)).resolves.toBeUndefined();
    await expect(spendCredits("owner-1", "find_companies", { ref: "c1" })).resolves.toBeUndefined();

    expect(updateMany).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
  });

  it("still gates a regular member with a zero balance", async () => {
    findUnique.mockResolvedValue({
      creditsRemaining: 0,
      role: "member",
      email: "customer@acme.com",
    });

    await expect(hasCredits("user-1", "find_companies")).resolves.toBe(false);
    await expect(ensureCredits("user-1", "find_companies")).rejects.toMatchObject({ status: 402 });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(spendCredits("user-1", "find_companies")).rejects.toMatchObject({ status: 402 });
  });
});

describe("tenant isolation is not weakened", () => {
  it("getContact still 404s when the contact belongs to someone else, even for an admin caller", async () => {
    contactFindUnique.mockResolvedValue({
      id: "c1",
      userId: "user-A",
      emails: [],
      socialMessages: [],
      segments: [],
      pipelineEntries: [],
      entity: null,
    });

    await expect(getContact("admin-owner", "c1")).rejects.toBeInstanceOf(OpError);
    await expect(getContact("admin-owner", "c1")).rejects.toMatchObject({ status: 404 });
  });
});
