import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseMailboxJob, queueForJob, workersBackgroundConfigured } from "@/lib/mailbox-jobs";

describe("mailbox job contract", () => {
  it("routes jobs onto the three worker queues", () => {
    expect(queueForJob({ type: "send-email", userId: "u", contactId: "c", subject: "s", body: "b" })).toBe("send");
    expect(queueForJob({ type: "warmup-one", mailboxId: "m1" })).toBe("send");
    expect(queueForJob({ type: "inbound-email", from: "a@x.com", to: "b@y.com", text: "hi" })).toBe("inbound");
    expect(queueForJob({ type: "fulfill-one", mailboxId: "m1" })).toBe("fulfill");
    expect(queueForJob({ type: "warmup-list" })).toBe("fulfill");
  });

  it("rejects unknown or incomplete jobs", () => {
    expect(() => parseMailboxJob(null)).toThrow(/job is required/);
    expect(() => parseMailboxJob({ type: "nope" })).toThrow(/Unknown job type/);
    expect(() => parseMailboxJob({ type: "warmup-one" })).toThrow(/mailboxId/);
    expect(() => parseMailboxJob({ type: "inbound-email", from: "a@x.com", to: "b@y.com" })).toThrow(/text/);
  });

  it("accepts a well-formed inbound job", () => {
    expect(
      parseMailboxJob({
        type: "inbound-email",
        from: "lead@acme.com",
        to: "alex@scalar.dev",
        text: "thanks",
        subject: "Re: hi",
      }),
    ).toMatchObject({ type: "inbound-email", from: "lead@acme.com" });
  });
});

describe("workersBackgroundConfigured", () => {
  const prevUrl = process.env.WORKERS_URL;
  const prevSecret = process.env.WORKER_SECRET;
  const prevCron = process.env.CRON_SECRET;

  beforeEach(() => {
    delete process.env.WORKERS_URL;
    delete process.env.WORKER_SECRET;
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    if (prevUrl === undefined) delete process.env.WORKERS_URL;
    else process.env.WORKERS_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.WORKER_SECRET;
    else process.env.WORKER_SECRET = prevSecret;
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  });

  it("is off until both the worker URL and a shared secret exist", () => {
    expect(workersBackgroundConfigured({})).toBe(false);
    expect(workersBackgroundConfigured({ WORKERS_URL: "https://jobs.example" })).toBe(false);
    expect(workersBackgroundConfigured({ WORKERS_URL: "https://jobs.example", WORKER_SECRET: "s" })).toBe(true);
    expect(workersBackgroundConfigured({ WORKERS_URL: "https://jobs.example", CRON_SECRET: "s" })).toBe(true);
  });
});

