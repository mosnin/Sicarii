// The Exa monitor callback writes into a user's CRM from a public URL.
// Identity is the ?t= token; the body is never trusted for userId. An
// unknown monitor, a missing token, or an oversized batch must not ingest.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const findFirst = vi.fn();
const createRun = vi.fn();
const updateMonitor = vi.fn();
const extractAndAddToCrm = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    intentMonitor: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      update: (...args: unknown[]) => updateMonitor(...args),
    },
    monitorRun: {
      create: (...args: unknown[]) => createRun(...args),
    },
  },
}));

vi.mock("@/lib/radar-extract", () => ({
  extractAndAddToCrm: (...args: unknown[]) => extractAndAddToCrm(...args),
}));

vi.mock("@/lib/exa", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/exa")>();
  return {
    ...actual,
    exaWebhookTokenValid: (provided: string | null | undefined) => provided === "valid-token",
  };
});

import { POST } from "@/app/api/webhooks/exa/route";

function req(body: unknown, token?: string | null, rawBody?: string) {
  const url = new URL("https://scalar.test/api/webhooks/exa");
  if (token) url.searchParams.set("t", token);
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
}

const MONITOR = {
  id: "im_1",
  userId: "user-A",
  exaMonitorId: "exa_1",
  autoAdd: true,
};

describe("POST /api/webhooks/exa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(MONITOR);
    createRun.mockResolvedValue({ id: "run_1" });
    updateMonitor.mockResolvedValue({});
    extractAndAddToCrm.mockResolvedValue({ entitiesAdded: 1, contactsAdded: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing or wrong token before reading CRM state", async () => {
    const missing = await POST(req({ monitor_id: "exa_1", results: [{ url: "https://a.com" }] }, null));
    expect(missing.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(extractAndAddToCrm).not.toHaveBeenCalled();

    const wrong = await POST(req({ monitor_id: "exa_1" }, "forged"));
    expect(wrong.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects unparseable JSON as 400", async () => {
    const res = await POST(req(undefined, "valid-token", "{ not json"));
    expect(res.status).toBe(400);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("acks an unknown monitor without writing a run or extracting", async () => {
    findFirst.mockResolvedValue(null);
    const res = await POST(req({ monitor_id: "ghost", results: [{ url: "https://a.com" }] }, "valid-token"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, ingested: 0, reason: "unmatched monitor" });
    expect(extractAndAddToCrm).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
  });

  it("records a run but does not extract when autoAdd is off", async () => {
    findFirst.mockResolvedValue({ ...MONITOR, autoAdd: false });
    const res = await POST(
      req(
        {
          monitor_id: "exa_1",
          results: [{ url: "https://acme.com/news", title: "Acme raised", summary: "series A" }],
        },
        "valid-token",
      ),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, found: 1, ingested: 0 });
    expect(extractAndAddToCrm).not.toHaveBeenCalled();
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-A",
          monitorId: "im_1",
          found: 1,
          added: 0,
          addedToCrm: false,
        }),
      }),
    );
  });

  it("extracts only url-bearing items and scopes the write to the monitor's user", async () => {
    const res = await POST(
      req(
        {
          monitor_id: "exa_1",
          results: [
            { url: "https://acme.com", title: "Acme", summary: "widgets" },
            { title: "no url — dropped" },
          ],
        },
        "valid-token",
      ),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, found: 1, ingested: 2 });
    expect(extractAndAddToCrm).toHaveBeenCalledWith("user-A", [
      { title: "Acme", url: "https://acme.com", summary: "widgets" },
    ]);
    expect(updateMonitor).toHaveBeenCalledWith({
      where: { id: "im_1" },
      data: { lastRunAt: expect.any(Date) },
    });
  });

  it("caps the batch at 100 so an oversized payload cannot fan out unbounded extract", async () => {
    const results = Array.from({ length: 150 }, (_, i) => ({
      url: `https://ex.com/${i}`,
      title: `t${i}`,
    }));
    await POST(req({ monitor_id: "exa_1", results }, "valid-token"));
    const items = extractAndAddToCrm.mock.calls[0][1] as unknown[];
    expect(items).toHaveLength(100);
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ found: 100 }) }),
    );
  });
});
