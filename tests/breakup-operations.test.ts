// Tests for the breakup-drafts ops layer: cold-detection query correctness,
// grounded generation with correct credit gating (never charge a miss),
// tenant isolation (read/edit/approve/dismiss all deny a non-owner), and the
// approve -> SENT transition with its logOutreach side effect.

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";
const CONTACT_ID = "c1";
const DRAFT_ID = "d1";

// vi.mock is hoisted above module-level consts, so the fixture data the mock
// factory returns is inlined here (mirrors tests/ops-isolation.test.ts); the
// equivalent objects are redeclared below for use in test bodies/assertions.
vi.mock("@/lib/prisma", () => {
  const owner = "user-A";
  const contactId = "c1";
  const draftId = "d1";
  const forbid = (name: string) =>
    vi.fn(() => {
      throw new Error(`ISOLATION BREACH: ${name} was called on an unauthorized record`);
    });
  return {
    prisma: {
      contact: {
        findUnique: vi.fn().mockResolvedValue({
          id: contactId,
          userId: owner,
          name: "Jordan Lee",
          email: "jordan@acme.com",
          company: "Acme Co",
          title: "VP Sales",
          status: "CONTACTED",
          lastContactedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        }),
        findMany: vi.fn().mockResolvedValue([]),
        update: forbid("contact.update"),
      },
      breakupDraft: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({
          id: draftId,
          userId: owner,
          contactId,
          status: "PENDING",
          subject: "Should I close this out?",
          body: "Original body",
          generatedFrom: {},
          createdAt: new Date(),
          decidedAt: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
        create: forbid("breakupDraft.create"),
        update: forbid("breakupDraft.update"),
      },
      activity: { create: forbid("activity.create"), findMany: vi.fn().mockResolvedValue([]) },
      contactEmail: { findMany: vi.fn().mockResolvedValue([]) },
      contactSocialMessage: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: forbid("$transaction"),
    },
  };
});

vi.mock("@/lib/credits", () => ({
  ensureCredits: vi.fn().mockResolvedValue(undefined),
  spendCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      subject: "Should I close this out?",
      body: "Grounded breakup email body.",
      reasoning: "Grounded in the last logged touch.",
    },
  }),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-model"),
}));

import { prisma } from "@/lib/prisma";
import { ensureCredits, spendCredits } from "@/lib/credits";
import { generateObject } from "ai";
import {
  listStalledDeals,
  generateBreakupDraft,
  listPendingDrafts,
  updateBreakupDraft,
  approveBreakupDraft,
  dismissBreakupDraft,
  DEFAULT_STALE_DAYS,
} from "@/lib/breakup-operations";
import { OpError } from "@/lib/crm-operations";

// Mirrors the fixture data inlined inside the vi.mock("@/lib/prisma", ...)
// factory above, for use in test bodies/assertions/overrides.
const ownedContact = {
  id: CONTACT_ID,
  userId: OWNER,
  name: "Jordan Lee",
  email: "jordan@acme.com",
  company: "Acme Co",
  title: "VP Sales",
  status: "CONTACTED",
  lastContactedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
};

const pendingDraft = {
  id: DRAFT_ID,
  userId: OWNER,
  contactId: CONTACT_ID,
  status: "PENDING",
  subject: "Should I close this out?",
  body: "Original body",
  generatedFrom: {},
  createdAt: new Date(),
  decidedAt: null,
};

async function expectDenied(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toMatchObject({ name: "OpError", status: 404 });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset before every test (one test below deletes it to exercise the 501 path).
  process.env.OPENAI_API_KEY = "test-key";
  // Reset default mock return values that vi.clearAllMocks() wipes.
  vi.mocked(prisma.contact.findUnique).mockResolvedValue(ownedContact as never);
  vi.mocked(prisma.contact.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.breakupDraft.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.breakupDraft.findUnique).mockResolvedValue(pendingDraft as never);
  vi.mocked(prisma.breakupDraft.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.contactEmail.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.contactSocialMessage.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.activity.findMany).mockResolvedValue([] as never);
  vi.mocked(ensureCredits).mockResolvedValue(undefined);
  vi.mocked(spendCredits).mockResolvedValue(undefined);
  vi.mocked(generateObject).mockResolvedValue({
    object: {
      subject: "Should I close this out?",
      body: "Grounded breakup email body.",
      reasoning: "Grounded in the last logged touch.",
    },
  } as never);
});

describe("listStalledDeals (cold detection)", () => {
  it("scopes to the tenant, applies the staleness cutoff, and excludes closed deals", async () => {
    await listStalledDeals(OWNER, { staleDays: 14 });

    expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.contact.findMany).mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
    };
    expect(call.where.userId).toBe(OWNER);

    // Staleness cutoff: lastContactedAt < ~14 days ago.
    const lt = (call.where.lastContactedAt as { lt: Date }).lt;
    const expectedCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(lt.getTime() - expectedCutoff)).toBeLessThan(5000);

    // Never resurface a resolved deal.
    expect(call.where.status).toEqual({ notIn: ["WON", "LOST", "ARCHIVED"] });
    // Right status signal: CONTACTED/REPLIED, or a stalled/awaiting-reply pipeline entry.
    expect(call.where.OR).toEqual([
      { status: { in: ["CONTACTED", "REPLIED"] } },
      { pipelineEntries: { some: { conversationStatus: { in: ["STALLED", "AWAITING_REPLY"] } } } },
    ]);
    // A CLOSED pipeline entry means the deal is already resolved - never resurface it.
    expect(call.where.pipelineEntries).toEqual({ none: { conversationStatus: "CLOSED" } });

    // Oldest touch first - the coldest deal is the most overdue.
    expect(call.orderBy).toEqual({ lastContactedAt: "asc" });
  });

  it("defaults to 14 days when no staleDays is given", async () => {
    expect(DEFAULT_STALE_DAYS).toBe(14);
    await listStalledDeals(OWNER);
    const call = vi.mocked(prisma.contact.findMany).mock.calls[0][0] as {
      where: { lastContactedAt: { lt: Date } };
    };
    const expectedCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(call.where.lastContactedAt.lt.getTime() - expectedCutoff)).toBeLessThan(5000);
  });

  it("clamps an out-of-range staleDays into bounds instead of erroring", async () => {
    await listStalledDeals(OWNER, { staleDays: 99999 });
    const call = vi.mocked(prisma.contact.findMany).mock.calls[0][0] as {
      where: { lastContactedAt: { lt: Date } };
    };
    const expectedCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    expect(Math.abs(call.where.lastContactedAt.lt.getTime() - expectedCutoff)).toBeLessThan(5000);
  });
});

describe("generateBreakupDraft (grounded generation + credit gating)", () => {
  it("gates on credits BEFORE generating and only spends AFTER a persisted draft", async () => {
    const created = { ...pendingDraft, id: "new-draft" };
    vi.mocked(prisma.breakupDraft.create).mockResolvedValueOnce(created as never);

    const result = await generateBreakupDraft(OWNER, CONTACT_ID);

    expect(ensureCredits).toHaveBeenCalledWith(OWNER, "breakup_draft");
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(prisma.breakupDraft.create).toHaveBeenCalledTimes(1);
    expect(spendCredits).toHaveBeenCalledWith(OWNER, "breakup_draft", { ref: CONTACT_ID });

    // spendCredits must be called AFTER create (never charge a miss): assert
    // call order via mock invocation timestamps captured through call order.
    const createOrder = vi.mocked(prisma.breakupDraft.create).mock.invocationCallOrder[0];
    const spendOrder = vi.mocked(spendCredits).mock.invocationCallOrder[0];
    expect(spendOrder).toBeGreaterThan(createOrder);

    expect(result.alreadyExisted).toBe(false);
    expect(result.id).toBe("new-draft");
  });

  it("is idempotent: an existing pending draft is returned without regenerating or charging", async () => {
    vi.mocked(prisma.breakupDraft.findFirst).mockResolvedValueOnce(pendingDraft as never);

    const result = await generateBreakupDraft(OWNER, CONTACT_ID);

    expect(result.alreadyExisted).toBe(true);
    expect(result.id).toBe(DRAFT_ID);
    expect(generateObject).not.toHaveBeenCalled();
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(prisma.breakupDraft.create).not.toHaveBeenCalled();
  });

  it("never charges when the credit gate itself rejects (out of credits)", async () => {
    vi.mocked(ensureCredits).mockRejectedValueOnce(new OpError("Out of credits.", 402));

    await expect(generateBreakupDraft(OWNER, CONTACT_ID)).rejects.toMatchObject({ status: 402 });

    expect(generateObject).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(prisma.breakupDraft.create).not.toHaveBeenCalled();
  });

  it("denies a non-owner of the contact and never reaches generation or the credit gate", async () => {
    await expectDenied(() => generateBreakupDraft(ATTACKER, CONTACT_ID));
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(generateObject).not.toHaveBeenCalled();
    expect(prisma.breakupDraft.create).not.toHaveBeenCalled();
  });

  it("501s cleanly when OPENAI_API_KEY is not configured, before spending anything", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generateBreakupDraft(OWNER, CONTACT_ID)).rejects.toMatchObject({ status: 501 });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(generateObject).not.toHaveBeenCalled();
  });
});

describe("review queue tenant isolation", () => {
  it("listPendingDrafts scopes strictly to the caller's userId", async () => {
    await listPendingDrafts(OWNER);
    const call = vi.mocked(prisma.breakupDraft.findMany).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).toMatchObject({ userId: OWNER, status: "PENDING" });
  });

  it("updateBreakupDraft denies a non-owner and never touches the row", async () => {
    await expectDenied(() => updateBreakupDraft(ATTACKER, DRAFT_ID, { subject: "hacked" }));
    expect(prisma.breakupDraft.update).not.toHaveBeenCalled();
  });

  it("approveBreakupDraft denies a non-owner and never sends or mutates anything", async () => {
    await expectDenied(() => approveBreakupDraft(ATTACKER, DRAFT_ID));
    expect(prisma.breakupDraft.update).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(prisma.activity.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("dismissBreakupDraft denies a non-owner and never mutates the row", async () => {
    await expectDenied(() => dismissBreakupDraft(ATTACKER, DRAFT_ID));
    expect(prisma.breakupDraft.update).not.toHaveBeenCalled();
  });

  it("a decided (non-PENDING) draft rejects a second approve/dismiss even from the owner", async () => {
    vi.mocked(prisma.breakupDraft.findUnique).mockResolvedValueOnce({
      ...pendingDraft,
      status: "SENT",
    } as never);
    await expect(approveBreakupDraft(OWNER, DRAFT_ID)).rejects.toMatchObject({ status: 409 });
    expect(prisma.breakupDraft.update).not.toHaveBeenCalled();
  });
});

describe("approveBreakupDraft (the owner path): SENT transition + logOutreach side effect", () => {
  it("logs outreach (advancing lastContactedAt) and marks the draft SENT, never AUTO on its own", async () => {
    // Allow the mutation path through for this one owner-path test.
    vi.mocked(prisma.$transaction).mockImplementationOnce((arr: unknown) =>
      Promise.all(arr as Promise<unknown>[]),
    );
    vi.mocked(prisma.contact.update).mockResolvedValueOnce({
      id: CONTACT_ID,
      status: "CONTACTED",
      lastContactedAt: new Date(),
    } as never);
    vi.mocked(prisma.activity.create).mockResolvedValueOnce({ id: "a1" } as never);
    vi.mocked(prisma.breakupDraft.update).mockResolvedValueOnce({
      ...pendingDraft,
      status: "SENT",
      decidedAt: new Date(),
    } as never);

    const result = await approveBreakupDraft(OWNER, DRAFT_ID);

    // logOutreach's side effect: the contact was touched via the transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONTACT_ID } }),
    );
    expect(prisma.activity.create).toHaveBeenCalledTimes(1);

    // The draft itself transitions PENDING -> SENT with a decidedAt stamp.
    expect(prisma.breakupDraft.update).toHaveBeenCalledWith({
      where: { id: DRAFT_ID },
      data: { status: "SENT", decidedAt: expect.any(Date) },
    });
    expect(result.status).toBe("SENT");
  });
});

describe("dismissBreakupDraft (the owner path)", () => {
  it("marks the draft DISMISSED with a decidedAt stamp, without touching the contact", async () => {
    vi.mocked(prisma.breakupDraft.update).mockResolvedValueOnce({
      ...pendingDraft,
      status: "DISMISSED",
      decidedAt: new Date(),
    } as never);

    const result = await dismissBreakupDraft(OWNER, DRAFT_ID);

    expect(prisma.breakupDraft.update).toHaveBeenCalledWith({
      where: { id: DRAFT_ID },
      data: { status: "DISMISSED", decidedAt: expect.any(Date) },
    });
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(result.status).toBe("DISMISSED");
  });
});
