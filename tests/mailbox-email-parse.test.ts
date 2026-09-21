import { describe, it, expect } from "vitest";
import { parseRawEmail } from "../workers/src/email";
import { handleScheduled, queueNameFor } from "../workers/src/index";
import type { Env, MailboxJob } from "../workers/src/types";

describe("parseRawEmail", () => {
  it("reads headers and a plain body", () => {
    const raw = [
      "From: Jordan Lee <jordan@target.com>",
      "To: alex@acme.com",
      "Subject: Re: quick question",
      "",
      "Thursday works.",
    ].join("\r\n");
    expect(parseRawEmail(raw)).toMatchObject({
      from: "Jordan Lee <jordan@target.com>",
      to: "alex@acme.com",
      subject: "Re: quick question",
      text: "Thursday works.",
    });
  });

  it("strips a simple HTML body", () => {
    const raw = "Content-Type: text/html; charset=utf-8\n\n<p>Hello&nbsp;there</p>";
    expect(parseRawEmail(raw, { from: "a@x.com", to: "b@y.com" }).text).toBe("Hello there");
  });
});

describe("worker fan-out", () => {
  it("queues warmup-one onto send and fulfill-one onto fulfill", () => {
    expect(queueNameFor({ type: "warmup-one", mailboxId: "m" })).toBe("SEND_QUEUE");
    expect(queueNameFor({ type: "inbound-email", from: "a@x.com", to: "b@y.com", text: "x" })).toBe("INBOUND_QUEUE");
    expect(queueNameFor({ type: "fulfill-one", mailboxId: "m" })).toBe("FULFILL_QUEUE");
  });

  it("fans a warmup cron into one send-queue message per mailbox", async () => {
    const sent: MailboxJob[] = [];
    const originCalls: MailboxJob[] = [];
    const env = {
      ORIGIN_URL: "https://app.example",
      WORKER_SECRET: "s",
      SEND_QUEUE: { send: async (job: MailboxJob) => { sent.push(job); } },
      INBOUND_QUEUE: { send: async () => undefined },
      FULFILL_QUEUE: { send: async (job: MailboxJob) => { sent.push(job); } },
    } as unknown as Env;

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { job: MailboxJob };
      originCalls.push(body.job);
      return new Response(JSON.stringify({ mailboxIds: ["m1", "m2"] }), { status: 200 });
    }) as typeof fetch;

    const warmup = await handleScheduled("20 * * * *", env);
    expect(warmup).toEqual({ enqueued: 2, type: "warmup-one" });
    expect(sent).toEqual([
      { type: "warmup-one", mailboxId: "m1" },
      { type: "warmup-one", mailboxId: "m2" },
    ]);

    sent.length = 0;
    const fulfill = await handleScheduled("*/10 * * * *", env);
    expect(fulfill).toEqual({ enqueued: 2, type: "fulfill-one" });
    globalThis.fetch = origFetch;
  });
});
