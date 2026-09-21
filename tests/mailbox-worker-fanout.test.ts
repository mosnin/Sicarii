import { describe, it, expect, vi } from "vitest";
import { handleScheduled } from "../workers/src/index";
import type { Env, MailboxJob } from "../workers/src/types";

function envWithLists(pages: Record<string, { ids: string[]; nextCursor: string | null }>): Env {
  const sent: MailboxJob[] = [];
  const queue = {
    send: async (job: MailboxJob) => {
      sent.push(job);
    },
  };
  return {
    ORIGIN_URL: "https://origin.test",
    WORKER_SECRET: "secret",
    SEND_QUEUE: queue,
    INBOUND_QUEUE: queue,
    FULFILL_QUEUE: queue,
    _sent: sent,
    fetchImpl: pages,
  } as unknown as Env;
}

describe("worker list fan-out", () => {
  it("enqueues at most one page of ones plus a next list cursor", async () => {
    const pages = {
      "warmup-list": { ids: ["m1", "m2"], nextCursor: "cur-2" },
      "send-slot-list": { ids: ["j1"], nextCursor: null },
      "dns-list": { ids: [], nextCursor: null },
    };
    const env = envWithLists(pages);
    const sent = (env as unknown as { _sent: MailboxJob[] })._sent;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const job = JSON.parse(init?.body ?? "{}").job as { type: string };
        const page = pages[job.type as keyof typeof pages] ?? { ids: [], nextCursor: null };
        return new Response(JSON.stringify({ ok: true, result: page }), { status: 200 });
      }),
    );

    const result = await handleScheduled("20 * * * *", env);
    expect(Array.isArray(result)).toBe(true);
    const types = sent.map((j) => j.type);
    expect(types.filter((t) => t === "warmup-one")).toEqual(["warmup-one", "warmup-one"]);
    expect(types).toContain("send-one");
    expect(sent.some((j) => j.type === "warmup-list" && "cursor" in j && j.cursor === "cur-2")).toBe(true);
    expect(sent.filter((j) => j.type === "warmup-one")).toHaveLength(2);

    vi.unstubAllGlobals();
  });
});
