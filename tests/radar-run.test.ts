// One Radar run: debit monitor_run, search, optionally auto-add, always
// record a MonitorRun. A miss here either re-bills silently or dumps
// article URLs into the CRM without going through extractAndAddToCrm.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { callOrder, spendCredits, exaIntentSearch, extractAndAddToCrm, monitorRunCreate } = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    spendCredits: vi.fn(async () => {
      callOrder.push("spendCredits");
    }),
    exaIntentSearch: vi.fn(async () => {
      callOrder.push("exaIntentSearch");
      return [];
    }),
    extractAndAddToCrm: vi.fn(async () => {
      callOrder.push("extractAndAddToCrm");
      return { entitiesAdded: 0, contactsAdded: 0, created: [] };
    }),
    monitorRunCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      callOrder.push("monitorRun.create");
      return { id: "run-1", ...data };
    }),
  };
});

vi.mock("@/lib/credits", () => ({ spendCredits }));
vi.mock("@/lib/exa", () => ({ exaIntentSearch }));
vi.mock("@/lib/radar-extract", () => ({ extractAndAddToCrm }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    monitorRun: { create: monitorRunCreate },
  },
}));

import { runIntentMonitorOnce } from "@/lib/radar-run";
import { OpError } from "@/lib/op-error";

const MONITOR = { id: "mon-1", userId: "user-1", query: "AI CRM buyers", autoAdd: false };

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  spendCredits.mockImplementation(async () => {
    callOrder.push("spendCredits");
  });
  exaIntentSearch.mockImplementation(async () => {
    callOrder.push("exaIntentSearch");
    return [
      { title: "Acme buys CRM", url: "https://news.example/acme", summary: "Acme is in market" },
      { title: "No url", url: "", highlights: ["drop me"] },
      { title: "Highlights only", url: "https://blog.example/post", highlights: ["one", "two"] },
    ];
  });
  extractAndAddToCrm.mockImplementation(async () => {
    callOrder.push("extractAndAddToCrm");
    return { entitiesAdded: 2, contactsAdded: 1, created: [{ id: "e1", kind: "entity", name: "Acme", domain: "acme.com", url: "https://acme.com" }] };
  });
});

describe("runIntentMonitorOnce", () => {
  it("debits monitor_run before the paid Exa search", async () => {
    await runIntentMonitorOnce(MONITOR);
    expect(spendCredits).toHaveBeenCalledWith("user-1", "monitor_run", { ref: "mon-1" });
    expect(callOrder[0]).toBe("spendCredits");
    expect(callOrder[1]).toBe("exaIntentSearch");
  });

  it("does not search when the meter rejects the debit", async () => {
    spendCredits.mockImplementation(async () => {
      callOrder.push("spendCredits");
      throw new OpError("Out of credits.", 402);
    });
    await expect(runIntentMonitorOnce(MONITOR)).rejects.toMatchObject({ status: 402 });
    expect(exaIntentSearch).not.toHaveBeenCalled();
    expect(monitorRunCreate).not.toHaveBeenCalled();
  });

  it("drops url-less hits and uses highlights when summary is missing", async () => {
    await runIntentMonitorOnce(MONITOR);
    const items = monitorRunCreate.mock.calls[0][0].data.items as Array<{
      title: string;
      url: string;
      summary?: string;
    }>;
    expect(items).toEqual([
      { title: "Acme buys CRM", url: "https://news.example/acme", summary: "Acme is in market" },
      { title: "Highlights only", url: "https://blog.example/post", summary: "one two" },
    ]);
    expect(monitorRunCreate.mock.calls[0][0].data).toMatchObject({
      userId: "user-1",
      monitorId: "mon-1",
      found: 2,
      added: 0,
      addedToCrm: false,
    });
  });

  it("does not extract when autoAdd is off", async () => {
    await runIntentMonitorOnce({ ...MONITOR, autoAdd: false });
    expect(extractAndAddToCrm).not.toHaveBeenCalled();
    expect(callOrder).toEqual(["spendCredits", "exaIntentSearch", "monitorRun.create"]);
  });

  it("auto-adds through extractAndAddToCrm, never the raw article list", async () => {
    const result = await runIntentMonitorOnce({ ...MONITOR, autoAdd: true });
    expect(extractAndAddToCrm).toHaveBeenCalledWith("user-1", [
      { title: "Acme buys CRM", url: "https://news.example/acme", summary: "Acme is in market" },
      { title: "Highlights only", url: "https://blog.example/post", summary: "one two" },
    ]);
    expect(result).toMatchObject({
      found: 2,
      added: 3,
      runId: "run-1",
    });
    expect(result.created).toHaveLength(1);
    expect(monitorRunCreate.mock.calls[0][0].data).toMatchObject({
      added: 3,
      addedToCrm: true,
    });
    expect(callOrder).toEqual([
      "spendCredits",
      "exaIntentSearch",
      "extractAndAddToCrm",
      "monitorRun.create",
    ]);
  });
});
