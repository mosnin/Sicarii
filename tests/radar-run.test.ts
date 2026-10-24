// One intent-monitor cycle: debit the Exa search BEFORE the paid call, then
// optionally auto-add extracted companies/people (never the publisher
// articles themselves — that lives in radar-extract). A miss here either
// runs unpaid Exa traffic or dumps TechCrunch into the CRM when autoAdd is
// off / credits are gone.
//
// #78 covers monitor create/delete. This file covers the shared run path
// used by Inngest and "Run now".

import { describe, it, expect, vi, beforeEach } from "vitest";

const spendCredits = vi.fn();
vi.mock("@/lib/credits", () => ({ spendCredits: (...a: unknown[]) => spendCredits(...a) }));

const exaIntentSearch = vi.fn();
vi.mock("@/lib/exa", () => ({
  exaIntentSearch: (...a: unknown[]) => exaIntentSearch(...a),
}));

const extractAndAddToCrm = vi.fn();
vi.mock("@/lib/radar-extract", () => ({
  extractAndAddToCrm: (...a: unknown[]) => extractAndAddToCrm(...a),
}));

const monitorRunCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    monitorRun: {
      create: (...a: unknown[]) => monitorRunCreate(...a),
    },
  },
}));

import { runIntentMonitorOnce } from "@/lib/radar-run";
import { OpError } from "@/lib/crm-operations";

const MONITOR = {
  id: "mon-1",
  userId: "user-1",
  query: "companies buying payroll software",
  autoAdd: false,
};

const RESULTS = [
  { title: "Acme hires", url: "https://news.example/acme", summary: "hiring", highlights: ["payroll"] },
  { title: "No url row", url: "", summary: "drop me" },
  { title: "Beta raises", url: "https://news.example/beta", highlights: ["series A"] },
];

beforeEach(() => {
  vi.clearAllMocks();
  spendCredits.mockResolvedValue(undefined);
  exaIntentSearch.mockResolvedValue(RESULTS);
  extractAndAddToCrm.mockResolvedValue({
    entitiesAdded: 2,
    contactsAdded: 1,
    created: [{ kind: "entity", id: "e1", name: "Acme" }],
  });
  monitorRunCreate.mockResolvedValue({ id: "run-1" });
});

describe("runIntentMonitorOnce metering and auto-add", () => {
  it("debits monitor_run BEFORE the Exa search", async () => {
    const order: string[] = [];
    spendCredits.mockImplementation(async () => {
      order.push("spend");
    });
    exaIntentSearch.mockImplementation(async () => {
      order.push("exa");
      return RESULTS;
    });

    await runIntentMonitorOnce(MONITOR);
    expect(spendCredits).toHaveBeenCalledWith("user-1", "monitor_run", { ref: "mon-1" });
    expect(order).toEqual(["spend", "exa"]);
  });

  it("does not search or record a run when the user is out of credits", async () => {
    spendCredits.mockRejectedValue(new OpError("Out of credits", 402));
    await expect(runIntentMonitorOnce(MONITOR)).rejects.toMatchObject({ status: 402 });
    expect(exaIntentSearch).not.toHaveBeenCalled();
    expect(extractAndAddToCrm).not.toHaveBeenCalled();
    expect(monitorRunCreate).not.toHaveBeenCalled();
  });

  it("does not extract into the CRM when autoAdd is off", async () => {
    const result = await runIntentMonitorOnce({ ...MONITOR, autoAdd: false });
    expect(extractAndAddToCrm).not.toHaveBeenCalled();
    expect(result).toEqual({ found: 2, added: 0, runId: "run-1", created: [] });
    expect(monitorRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        monitorId: "mon-1",
        found: 2,
        added: 0,
        addedToCrm: false,
      }),
    });
  });

  it("auto-adds via extractAndAddToCrm (not the article publishers) and records added", async () => {
    const result = await runIntentMonitorOnce({ ...MONITOR, autoAdd: true });
    expect(extractAndAddToCrm).toHaveBeenCalledWith(
      "user-1",
      expect.arrayContaining([
        expect.objectContaining({ url: "https://news.example/acme" }),
        expect.objectContaining({ url: "https://news.example/beta" }),
      ]),
    );
    const passed = extractAndAddToCrm.mock.calls[0][1] as { url: string }[];
    expect(passed.every((item) => item.url)).toBe(true);
    expect(result.added).toBe(3);
    expect(result.created).toEqual([{ kind: "entity", id: "e1", name: "Acme" }]);
    expect(monitorRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ added: 3, addedToCrm: true, found: 2 }),
    });
  });

  it("drops result rows without a url so found never counts empties", async () => {
    exaIntentSearch.mockResolvedValue([
      { title: "nope", url: "" },
      { title: "ok", url: "https://ok.example" },
    ]);
    const result = await runIntentMonitorOnce(MONITOR);
    expect(result.found).toBe(1);
  });
});
