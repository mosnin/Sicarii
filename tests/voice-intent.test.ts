// Voice intent bridge: the heuristic classifier routes each spoken phrase to
// the correct CRM op (mocked here), and the resulting speech is short, plain
// prose grounded in the mocked data - never markdown, never fabricated.

import { describe, it, expect, vi, beforeEach } from "vitest";

const listDueFollowups = vi.fn();
const listContacts = vi.fn();
const searchCrm = vi.fn();
const computePulse = vi.fn();
const userFindUnique = vi.fn();

vi.mock("@/lib/crm-operations", () => ({
  listDueFollowups: (...args: unknown[]) => listDueFollowups(...args),
  listContacts: (...args: unknown[]) => listContacts(...args),
  searchCrm: (...args: unknown[]) => searchCrm(...args),
}));
vi.mock("@/lib/pulse", () => ({
  computePulse: (...args: unknown[]) => computePulse(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => userFindUnique(...args) } },
}));

import { classifyVoiceIntent, voiceIntent } from "@/lib/voice-intent";

const USER = "user-1";

function assertPlainSpeech(speech: string) {
  expect(typeof speech).toBe("string");
  expect(speech.length).toBeGreaterThan(0);
  // No markdown: no bullets, no headers, no bold/italic markers, no links.
  expect(speech).not.toMatch(/[*_#`[\]]/);
}

describe("classifyVoiceIntent", () => {
  const cases: [string, string][] = [
    ["who do I need to follow up with today", "followups"],
    ["who's overdue for a follow-up", "followups"],
    ["I need to chase a few people", "followups"],
    ["what happened while I was away", "pulse"],
    ["what did my agent do while I was away", "pulse"],
    ["catch me up", "pulse"],
    ["what's hot in my pipeline", "pipeline_hot"],
    ["show me the best leads", "pipeline_hot"],
    ["who is jane at acme", "search"],
    ["tell me about acme corp", "search"],
    ["do we have anyone from stripe", "search"],
    ["what's the weather like", "unknown"],
    ["", "unknown"],
  ];

  it.each(cases)("classifies %j as %s", (text, expected) => {
    expect(classifyVoiceIntent(text).intent).toBe(expected);
  });

  it("extracts a search query with the trigger phrase stripped", () => {
    const r = classifyVoiceIntent("who is jane at acme");
    expect(r.intent).toBe("search");
    expect(r.query).toBe("jane at acme");
  });
});

describe("voiceIntent (the bridge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes a follow-up request to listDueFollowups, scoped to the caller's userId", async () => {
    listDueFollowups.mockResolvedValue([
      { id: "c1", name: "Jane Doe", email: "jane@acme.com", company: "Acme", status: "CONTACTED", lastContactedAt: null },
      { id: "c2", name: "John Roe", email: "john@beta.com", company: "Beta", status: "CONTACTED", lastContactedAt: null },
    ]);

    const { speech, intent } = await voiceIntent(USER, "who do I need to follow up with today");

    expect(intent).toBe("followups");
    expect(listDueFollowups).toHaveBeenCalledWith(USER, expect.objectContaining({ limit: expect.any(Number) }));
    expect(listContacts).not.toHaveBeenCalled();
    expect(searchCrm).not.toHaveBeenCalled();
    expect(computePulse).not.toHaveBeenCalled();
    assertPlainSpeech(speech);
    expect(speech).toContain("2 follow-ups");
    expect(speech).toContain("Jane Doe");
    expect(speech).toContain("John Roe");
  });

  it("never brags an empty follow-up list", async () => {
    listDueFollowups.mockResolvedValue([]);
    const { speech } = await voiceIntent(USER, "who needs a follow up");
    assertPlainSpeech(speech);
    expect(speech.toLowerCase()).toContain("no follow-ups due");
  });

  it("routes a pulse request to computePulse using the user's lastSeenAt", async () => {
    const since = new Date("2026-07-10T00:00:00Z");
    userFindUnique.mockResolvedValue({ lastSeenAt: since });
    computePulse.mockResolvedValue({ companies: 3, enriched: 2, inMarket: 1, best: { name: "Acme", domain: "acme.com" } });

    const { speech, intent } = await voiceIntent(USER, "what did my agent do while I was away");

    expect(intent).toBe("pulse");
    expect(userFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER } }));
    expect(computePulse).toHaveBeenCalledWith(USER, since);
    assertPlainSpeech(speech);
    expect(speech).toContain("3 new compan");
    expect(speech).toContain("Acme");
  });

  it("falls back to a 7-day window when lastSeenAt is null, and never brags an empty pulse", async () => {
    userFindUnique.mockResolvedValue({ lastSeenAt: null });
    computePulse.mockResolvedValue(null);

    const { speech } = await voiceIntent(USER, "catch me up");

    expect(computePulse).toHaveBeenCalledWith(USER, expect.any(Date));
    assertPlainSpeech(speech);
    expect(speech.toLowerCase()).toContain("nothing new");
  });

  it("routes a pipeline-hot request to listContacts scoped to the caller", async () => {
    listContacts.mockResolvedValueOnce([
      { id: "c1", name: "Big Fish", company: "Whale Co", status: "QUALIFIED" },
    ]);

    const { speech, intent } = await voiceIntent(USER, "what's hot in my pipeline");

    expect(intent).toBe("pipeline_hot");
    expect(listContacts).toHaveBeenCalledWith(USER, expect.objectContaining({ status: "QUALIFIED" }));
    assertPlainSpeech(speech);
    expect(speech).toContain("Big Fish");
    expect(speech).toContain("qualified");
  });

  it("falls back to REPLIED contacts when nothing is QUALIFIED yet", async () => {
    listContacts.mockResolvedValueOnce([]); // QUALIFIED query
    listContacts.mockResolvedValueOnce([
      { id: "c2", name: "Warm Lead", company: "Warm Co", status: "REPLIED" },
    ]);

    const { speech } = await voiceIntent(USER, "what's hot right now");

    expect(listContacts).toHaveBeenNthCalledWith(1, USER, expect.objectContaining({ status: "QUALIFIED" }));
    expect(listContacts).toHaveBeenNthCalledWith(2, USER, expect.objectContaining({ status: "REPLIED" }));
    expect(speech).toContain("Warm Lead");
    expect(speech).toContain("replied");
  });

  it("routes a named lookup to searchCrm, scoped to the caller, with the trigger phrase stripped", async () => {
    searchCrm.mockResolvedValue({
      entities: [{ id: "e1", name: "Acme Corp" }],
      contacts: [{ id: "c1", name: "Jane Doe" }],
    });

    const { speech, intent } = await voiceIntent(USER, "who is jane at acme");

    expect(intent).toBe("search");
    expect(searchCrm).toHaveBeenCalledWith(USER, "jane at acme");
    assertPlainSpeech(speech);
    expect(speech).toContain("2 matches");
    expect(speech).toContain("Jane Doe");
  });

  it("gives an honest miss when search finds nothing (never fabricates a match)", async () => {
    searchCrm.mockResolvedValue({ entities: [], contacts: [] });
    const { speech } = await voiceIntent(USER, "do we have anyone named zorblax");
    assertPlainSpeech(speech);
    expect(speech.toLowerCase()).toContain("couldn't find");
  });

  it("gives a helpful menu on an unrecognized request, without calling any CRM op", async () => {
    const { speech, intent } = await voiceIntent(USER, "what's the weather like");
    expect(intent).toBe("unknown");
    assertPlainSpeech(speech);
    expect(listDueFollowups).not.toHaveBeenCalled();
    expect(listContacts).not.toHaveBeenCalled();
    expect(searchCrm).not.toHaveBeenCalled();
    expect(computePulse).not.toHaveBeenCalled();
  });

  it("gives a clarifying prompt on empty input, without calling any CRM op", async () => {
    const { speech, intent } = await voiceIntent(USER, "");
    expect(intent).toBe("unknown");
    assertPlainSpeech(speech);
    expect(listDueFollowups).not.toHaveBeenCalled();
  });

  it("degrades to a safe spoken fallback (never throws) when the underlying op fails", async () => {
    listDueFollowups.mockRejectedValue(new Error("db exploded"));
    const { speech } = await voiceIntent(USER, "who do I need to follow up with");
    assertPlainSpeech(speech);
    expect(speech.toLowerCase()).toContain("try again");
  });

  it("caps input length defensively (does not throw on a huge transcript)", async () => {
    listDueFollowups.mockResolvedValue([]);
    const huge = "follow up ".repeat(1000);
    await expect(voiceIntent(USER, huge)).resolves.toBeDefined();
  });
});
