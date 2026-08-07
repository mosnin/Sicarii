// Tests for the social DISCOVERY path.
//
// The load-bearing assertion in this file is the one about contacts: a
// query-based social result must never create or update a Contact or an Entity,
// because the provider returns no confidence, no match score, no candidate list
// and no verification flag, so attaching result[0] to a person is exactly the
// same-name-stranger bug. That is enforced structurally (this module has no
// code route to those tables), and both proofs are here: a source scan and a
// runtime run against a prisma whose contact/entity writers throw.
//
// The rest: dedupe on postUrl, tenant isolation, honest scope refusals
// (LinkedIn cannot be searched at all, Facebook has no group discovery), and
// intent classification that stays inside what the post text actually says.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const OWNER = "user-A";
const ATTACKER = "user-B";
const MONITOR_ID = "mon-1";

const db = vi.hoisted(() => {
  const forbid = (name: string) =>
    vi.fn(() => {
      throw new Error(`ISOLATION BREACH: ${name} was reached from the discovery path`);
    });
  return {
    forbid,
    monitorFindFirst: vi.fn(),
    monitorFindMany: vi.fn(),
    monitorUpdate: vi.fn(),
    opportunityCreateMany: vi.fn(),
    opportunityFindMany: vi.fn(),
    opportunityUpdateMany: vi.fn(),
    contactCreate: forbid("contact.create"),
    contactUpdate: forbid("contact.update"),
    contactUpsert: forbid("contact.upsert"),
    contactFindFirst: forbid("contact.findFirst"),
    entityCreate: forbid("entity.create"),
    entityUpdate: forbid("entity.update"),
    entityUpsert: forbid("entity.upsert"),
    entityFindFirst: forbid("entity.findFirst"),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialMonitor: {
      findFirst: db.monitorFindFirst,
      findMany: db.monitorFindMany,
      update: db.monitorUpdate,
    },
    socialOpportunity: {
      createMany: db.opportunityCreateMany,
      findMany: db.opportunityFindMany,
      updateMany: db.opportunityUpdateMany,
    },
    // If the discovery path ever reaches these, the test fails loudly.
    contact: {
      create: db.contactCreate,
      update: db.contactUpdate,
      upsert: db.contactUpsert,
      findFirst: db.contactFindFirst,
      createMany: db.contactCreate,
      updateMany: db.contactUpdate,
    },
    entity: {
      create: db.entityCreate,
      update: db.entityUpdate,
      upsert: db.entityUpsert,
      findFirst: db.entityFindFirst,
      createMany: db.entityCreate,
      updateMany: db.entityUpdate,
    },
  },
}));

const credits = vi.hoisted(() => ({ ensureCredits: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  ensureCredits: credits.ensureCredits,
  spendCredits: credits.spendCredits,
}));

const provider = vi.hoisted(() => ({
  submitTask: vi.fn(),
  enqueueSocqPoll: vi.fn(),
  resolveEndpoint: vi.fn(),
}));
vi.mock("@/lib/socq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/socq")>();
  return {
    ...actual,
    submitTask: provider.submitTask,
    enqueueSocqPoll: provider.enqueueSocqPoll,
    resolveEndpoint: provider.resolveEndpoint,
  };
});

const llm = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock("ai", () => ({ generateObject: llm.generateObject }));
vi.mock("@ai-sdk/openai", () => ({ openai: (m: string) => ({ model: m }) }));

import {
  MONITOR_RESULTS_CEILING,
  applyDiscoveryItems,
  judgeIntent,
  nextRunFor,
  resolveMonitorEndpoint,
  runSocialMonitor,
} from "@/lib/social-discover";
import { normalizeItem, type SocqItem } from "@/lib/socq";

function item(overrides: Record<string, unknown>): SocqItem {
  return normalizeItem(overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
  credits.ensureCredits.mockResolvedValue(undefined);
  credits.spendCredits.mockResolvedValue(undefined);
  process.env.SOCQ_API_KEY = "sk-test";
  process.env.SOCQ_ENABLED = "true";
  process.env.OPENAI_API_KEY = "sk-openai-test";

  provider.resolveEndpoint.mockResolvedValue({
    platform: "x",
    resource: "search",
    publicId: "x/search",
    confirmed: true,
    capability: null,
  });
  provider.submitTask.mockResolvedValue({
    taskRowId: "row-1",
    socqTaskId: "socq-1",
    status: "QUEUED",
    idempotencyKey: "scalar-abc",
    resultsLimit: 25,
    replayed: false,
  });
  db.opportunityCreateMany.mockResolvedValue({ count: 0 });
  db.opportunityFindMany.mockResolvedValue([]);
  db.opportunityUpdateMany.mockResolvedValue({ count: 1 });
  db.monitorUpdate.mockResolvedValue({});
});

/* ------------------- the rule: discovery never writes people ------------- */

describe("the discovery path cannot write a contact or an entity", () => {
  it("has no code route to those tables at all (source proof)", () => {
    const file = path.join(process.cwd(), "src/lib/social-discover.ts");
    const source = readFileSync(file, "utf8")
      // Strip comments first: this file talks ABOUT prisma.contact at length,
      // and the point of the scan is what the code does, not what it says.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(source).not.toMatch(/prisma\s*\.\s*contact\b/);
    expect(source).not.toMatch(/prisma\s*\.\s*entity\b/);
    // Nor through the ops layer's writers.
    expect(source).not.toMatch(/createContact|updateContact|createEntity|updateEntity/);
  });

  it("writes only opportunities when a discovery result lands (runtime proof)", async () => {
    db.opportunityCreateMany.mockResolvedValue({ count: 2 });
    const result = await applyDiscoveryItems(OWNER, {
      monitorId: MONITOR_ID,
      platform: "X",
      items: [
        item({ url: "https://x.com/a/status/1", text: "who has a good CRM?", author: { name: "Ada" } }),
        item({ url: "https://x.com/b/status/2", text: "switching off our CRM", author: { name: "Ada" } }),
      ],
    });

    expect(result.created).toBe(2);
    expect(db.opportunityCreateMany).toHaveBeenCalledTimes(1);
    // The forbidding mocks would have thrown; assert they were never touched.
    expect(db.contactCreate).not.toHaveBeenCalled();
    expect(db.contactUpdate).not.toHaveBeenCalled();
    expect(db.contactUpsert).not.toHaveBeenCalled();
    expect(db.entityCreate).not.toHaveBeenCalled();
    expect(db.entityUpdate).not.toHaveBeenCalled();
  });

  it("stores the author blob raw and never lifts a name out of it onto a record", async () => {
    db.opportunityCreateMany.mockResolvedValue({ count: 1 });
    await applyDiscoveryItems(OWNER, {
      monitorId: MONITOR_ID,
      platform: "X",
      items: [item({ url: "https://x.com/a/1", text: "hi", author: { name: "Ada Lovelace", id: 7 } })],
    });
    const rows = db.opportunityCreateMany.mock.calls[0][0].data;
    expect(rows[0].authorRaw).toEqual({ name: "Ada Lovelace", id: 7 });
    expect(rows[0]).not.toHaveProperty("contactId");
  });
});

/* ------------------------------- dedupe ---------------------------------- */

describe("opportunity dedupe on postUrl", () => {
  it("collapses duplicates inside one batch and lets the unique index settle the rest", async () => {
    db.opportunityCreateMany.mockResolvedValue({ count: 1 });
    const result = await applyDiscoveryItems(OWNER, {
      monitorId: MONITOR_ID,
      platform: "X",
      items: [
        item({ url: "https://x.com/a/1", text: "one" }),
        item({ url: "https://x.com/a/1", text: "one again" }),
        item({ url: "https://x.com/a/2", text: "two" }),
      ],
    });

    const call = db.opportunityCreateMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((r: { postUrl: string }) => r.postUrl)).toEqual([
      "https://x.com/a/1",
      "https://x.com/a/2",
    ]);
    // The index rejected one of the two we sent; it is a duplicate, not a loss.
    expect(result.created).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("skips a result with no URL, since there is no dedupe key and nothing to open", async () => {
    const result = await applyDiscoveryItems(OWNER, {
      monitorId: MONITOR_ID,
      platform: "X",
      items: [item({ text: "no link here" })],
    });
    expect(result.skipped).toBe(1);
    expect(db.opportunityCreateMany).not.toHaveBeenCalled();
  });

  it("does not charge a run that produced nothing new", async () => {
    db.opportunityCreateMany.mockResolvedValue({ count: 0 });
    await applyDiscoveryItems(OWNER, {
      monitorId: MONITOR_ID,
      platform: "X",
      items: [item({ url: "https://x.com/a/1", text: "seen before" })],
    });
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });
});

/* --------------------------- userId isolation ---------------------------- */

describe("userId isolation", () => {
  it("scopes the monitor read by tenant in the same query as the read", async () => {
    db.monitorFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.userId === OWNER
        ? {
            id: MONITOR_ID, userId: OWNER, name: "CRM chatter", platform: "X",
            query: "crm", sourceUrls: [], resultsLimit: 25, publishedWithin: null,
            active: true, frequency: "daily", nextRunAt: null,
          }
        : null,
    );

    await expect(runSocialMonitor(ATTACKER, MONITOR_ID)).rejects.toMatchObject({ status: 404 });
    expect(db.monitorFindFirst).toHaveBeenCalledWith({ where: { id: MONITOR_ID, userId: ATTACKER } });
    expect(provider.submitTask).not.toHaveBeenCalled();
  });

  it("scopes the intent write by tenant so a postUrl can never reach another account's row", async () => {
    db.opportunityCreateMany.mockResolvedValue({ count: 1 });
    db.opportunityFindMany.mockResolvedValue([{ postUrl: "https://x.com/a/1", text: "need a CRM" }]);
    llm.generateObject.mockResolvedValue({
      object: { scores: [{ index: 0, intentScore: 90, intentReason: "asks for a CRM recommendation" }] },
    });

    await applyDiscoveryItems(OWNER, {
      monitorId: MONITOR_ID,
      platform: "X",
      items: [item({ url: "https://x.com/a/1", text: "need a CRM" })],
    });

    expect(db.opportunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: OWNER }) }),
    );
    expect(db.opportunityUpdateMany).toHaveBeenCalledWith({
      where: { userId: OWNER, postUrl: "https://x.com/a/1" },
      data: { intentScore: 90, intentReason: "asks for a CRM recommendation" },
    });
  });
});

/* ----------------------------- honest scope ------------------------------ */

describe("scope refusals are honest about what SocQ cannot do", () => {
  it("refuses a LinkedIn keyword watch, because there is no LinkedIn search at all", async () => {
    await expect(
      resolveMonitorEndpoint({ platform: "LINKEDIN", query: "crm", sourceUrls: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a Facebook keyword watch and points at group URLs instead", async () => {
    await expect(
      resolveMonitorEndpoint({ platform: "FACEBOOK", query: "crm", sourceUrls: [] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      resolveMonitorEndpoint({ platform: "FACEBOOK", query: "crm", sourceUrls: [] }),
    ).rejects.toThrow(/group discovery/i);
  });

  it("allows a Facebook watch when the operator supplies the group URLs", async () => {
    provider.resolveEndpoint.mockResolvedValue({
      platform: "facebook", resource: "group-posts", publicId: "facebook/group-posts",
      confirmed: true, capability: null,
    });
    const endpoint = await resolveMonitorEndpoint({
      platform: "FACEBOOK",
      query: null,
      sourceUrls: ["https://facebook.com/groups/crm-folks"],
    });
    expect(endpoint.publicId).toBe("facebook/group-posts");
    expect(endpoint.input).toEqual({ urls: ["https://facebook.com/groups/crm-folks"] });
  });

  it("refuses a monitor with neither a query nor URLs", async () => {
    await expect(
      resolveMonitorEndpoint({ platform: "X", query: null, sourceUrls: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

/* ------------------------------ monitor runs ----------------------------- */

describe("running a monitor", () => {
  beforeEach(() => {
    db.monitorFindFirst.mockResolvedValue({
      id: MONITOR_ID, userId: OWNER, name: "CRM chatter", platform: "X",
      query: "crm", sourceUrls: [], resultsLimit: 5000, publishedWithin: "7d",
      active: true, frequency: "daily", nextRunAt: null,
    });
  });

  it("bounds results_limit to the monitor ceiling however greedy the row is", async () => {
    const run = await runSocialMonitor(OWNER, MONITOR_ID);
    expect(run.resultsLimit).toBe(MONITOR_RESULTS_CEILING);
    expect(provider.submitTask.mock.calls[0][1].resultsLimit).toBe(MONITOR_RESULTS_CEILING);
    expect(provider.submitTask.mock.calls[0][1].resultsLimitCeiling).toBe(MONITOR_RESULTS_CEILING);
  });

  it("gates on credits before the paid call and salts idempotency per cycle", async () => {
    await runSocialMonitor(OWNER, MONITOR_ID);
    expect(credits.ensureCredits).toHaveBeenCalledWith(OWNER, "monitor_run");
    expect(provider.submitTask.mock.calls[0][1].idempotencySalt).toContain(MONITOR_ID);
  });

  it("queues a poll rather than waiting on the provider", async () => {
    await runSocialMonitor(OWNER, MONITOR_ID);
    expect(provider.enqueueSocqPoll).toHaveBeenCalledTimes(1);
    const [, payload, opts] = provider.enqueueSocqPoll.mock.calls[0];
    expect(payload.mode).toBe("discover");
    expect(payload.monitorId).toBe(MONITOR_ID);
    expect(opts.reason).toBeTruthy();
  });

  it("advances the schedule so a monitor cannot run twice in a cycle", async () => {
    const now = new Date("2026-08-07T12:00:00Z");
    await runSocialMonitor(OWNER, MONITOR_ID, { now });
    expect(db.monitorUpdate).toHaveBeenCalledWith({
      where: { id: MONITOR_ID },
      data: { lastRunAt: now, nextRunAt: nextRunFor(now, "daily") },
    });
  });
});

/* --------------------------- intent classification ----------------------- */

describe("intent classification stays inside the post text", () => {
  it("scores an empty post zero instead of guessing", async () => {
    const judged = await judgeIntent([{ postUrl: "https://x.com/a/1", text: "   " }]);
    expect(judged).toEqual([
      { postUrl: "https://x.com/a/1", intentScore: 0, intentReason: expect.stringContaining("No post text") },
    ]);
    expect(llm.generateObject).not.toHaveBeenCalled();
  });

  it("clamps a model score into 0..100 and never trusts it blindly", async () => {
    llm.generateObject.mockResolvedValue({
      object: { scores: [{ index: 0, intentScore: 4000, intentReason: "wildly confident" }] },
    });
    const judged = await judgeIntent([{ postUrl: "https://x.com/a/1", text: "need a CRM" }]);
    expect(judged[0].intentScore).toBe(100);
  });

  it("tells the model, in the prompt, that the post text is the only evidence and the author is unknown", async () => {
    llm.generateObject.mockResolvedValue({ object: { scores: [] } });
    await judgeIntent([{ postUrl: "https://x.com/a/1", text: "need a CRM" }]);
    const prompt: string = llm.generateObject.mock.calls[0][0].prompt;
    expect(prompt).toMatch(/ONLY evidence/i);
    expect(prompt).toMatch(/know NOTHING about who wrote/i);
    expect(prompt).toMatch(/Never invent/i);
  });

  it("keeps the opportunity when classification fails", async () => {
    db.opportunityCreateMany.mockResolvedValue({ count: 1 });
    db.opportunityFindMany.mockResolvedValue([{ postUrl: "https://x.com/a/1", text: "need a CRM" }]);
    llm.generateObject.mockRejectedValue(new Error("model unavailable"));

    const result = await applyDiscoveryItems(OWNER, {
      monitorId: MONITOR_ID,
      platform: "X",
      items: [item({ url: "https://x.com/a/1", text: "need a CRM" })],
    });
    expect(result.created).toBe(1);
    expect(result.classified).toBe(0);
  });
});
