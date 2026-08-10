// The send chokepoint enforces, in order: mailbox exists, recipient not
// suppressed, under the daily cap, has credits, unsubscribe attached. The
// assertions that matter most are the NEGATIVE ones: the mail provider must
// never be reached when a gate refuses.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  configured: true,
  mailbox: { status: "ACTIVE", composioConnectionId: "ca_1", accountEmail: "me@acme.com" } as
    | { status: string; composioConnectionId: string | null; accountEmail: string | null }
    | null,
  suppressed: false,
  sentToday: 0,
};

type SendArg = { userId: string; connectedAccountId: string; arguments: Record<string, unknown> };
type SendResult = { successful?: boolean; error?: string | null; data?: Record<string, unknown> };
const executeSendEmail = vi.fn(
  async (_body: SendArg): Promise<SendResult> => ({ successful: true, data: { id: "msg_1" } }),
);
const spendCredits = vi.fn(async (..._a: unknown[]) => {});
const ensureCredits = vi.fn(async (..._a: unknown[]) => {});
const logOutreach = vi.fn(async (..._a: unknown[]) => {});

vi.mock("@/lib/composio", () => ({
  isComposioConfigured: () => state.configured,
  executeSendEmail: (body: SendArg) => executeSendEmail(body),
}));
vi.mock("@/lib/connections", () => ({
  getConnection: async () => state.mailbox,
}));
vi.mock("@/lib/suppression", () => ({
  assertNotSuppressed: async () => {
    if (state.suppressed) {
      const e = new Error("suppressed") as Error & { status: number };
      e.status = 409;
      throw e;
    }
  },
}));
vi.mock("@/lib/credits", () => ({
  ensureCredits: (...a: unknown[]) => ensureCredits(...(a as [])),
  spendCredits: (...a: unknown[]) => spendCredits(...(a as [])),
  spendCreditsAmount: (...a: unknown[]) => spendCredits(...(a as [])).then(() => true),
  CREDIT_COSTS: { email_send: 4 },
}));
vi.mock("@/lib/crm-operations", () => ({
  logOutreach: (...a: unknown[]) => logOutreach(...(a as [])),
  OpError: class OpError extends Error {
    status: number;
    constructor(m: string, s = 400) {
      super(m);
      this.status = s;
    }
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailMessage: { count: async () => state.sentToday },
    emailThread: { create: async ({ data }: { data: unknown }) => ({ id: "t1", ...(data as object) }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        emailThread: { create: async () => ({ id: "t1" }) },
        emailMessage: { create: async ({ data }: { data: unknown }) => ({ id: "em1", ...(data as object) }) },
      }),
  },
}));

import { sendOutboundEmail, warmupDailyCap } from "@/lib/email-send";

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  state.mailbox = { status: "ACTIVE", composioConnectionId: "ca_1", accountEmail: "me@acme.com" };
  state.suppressed = false;
  state.sentToday = 0;
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  delete process.env.EMAIL_SEND_WINDOW_START_HOUR;
  delete process.env.EMAIL_DAILY_CAP;
});

const msg = { to: "prospect@target.com", subject: "Hi", body: "A grounded message.", contactId: "c1" };

describe("sendOutboundEmail gate ordering", () => {
  it("sends on the happy path, attaches an unsubscribe header, debits once, advances the contact", async () => {
    const r = await sendOutboundEmail("u1", msg);
    expect(r.sent).toBe(true);
    expect(executeSendEmail).toHaveBeenCalledOnce();
    const arg = executeSendEmail.mock.calls[0][0];
    expect((arg.arguments.extra_headers as Record<string, unknown>)["List-Unsubscribe"]).toContain("/api/unsubscribe");
    expect(arg.arguments.body).toContain("unsubscribe");
    expect(spendCredits).toHaveBeenCalledOnce();
    expect(logOutreach).toHaveBeenCalledOnce();
  });

  it("REFUSES a suppressed recipient before the provider is ever called", async () => {
    state.suppressed = true;
    await expect(sendOutboundEmail("u1", msg)).rejects.toThrow();
    expect(executeSendEmail).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("refuses when no mailbox is connected, without touching the provider or credits", async () => {
    state.mailbox = null;
    await expect(sendOutboundEmail("u1", msg)).rejects.toMatchObject({ status: 501 });
    expect(executeSendEmail).not.toHaveBeenCalled();
    expect(ensureCredits).not.toHaveBeenCalled();
  });

  it("refuses at the daily cap, without sending", async () => {
    process.env.EMAIL_DAILY_CAP = "50";
    state.sentToday = 50;
    await expect(sendOutboundEmail("u1", msg)).rejects.toMatchObject({ status: 429 });
    expect(executeSendEmail).not.toHaveBeenCalled();
  });

  it("a human one-off (bypassGovernance) skips the cap but never skips suppression", async () => {
    process.env.EMAIL_DAILY_CAP = "1";
    state.sentToday = 100;
    await expect(sendOutboundEmail("u1", { ...msg, bypassGovernance: true })).resolves.toMatchObject({ sent: true });
    // suppression still enforced even with governance bypassed
    vi.clearAllMocks();
    state.suppressed = true;
    await expect(sendOutboundEmail("u1", { ...msg, bypassGovernance: true })).rejects.toThrow();
    expect(executeSendEmail).not.toHaveBeenCalled();
  });

  it("does not debit credits if the provider rejects the send", async () => {
    executeSendEmail.mockResolvedValueOnce({ successful: false, error: "rejected", data: {} });
    await expect(sendOutboundEmail("u1", msg)).rejects.toMatchObject({ status: 502 });
    expect(spendCredits).not.toHaveBeenCalled();
  });
});

describe("warmupDailyCap", () => {
  const CONNECT = new Date("2026-08-01T00:00:00Z");
  beforeEach(() => {
    process.env.EMAIL_DAILY_CAP = "500";
    process.env.EMAIL_WARMUP_START = "20";
    process.env.EMAIL_WARMUP_STEP = "10";
  });

  it("starts low on day 0 and ramps by the daily step", () => {
    expect(warmupDailyCap(CONNECT, new Date("2026-08-01T09:00:00Z"))).toBe(20); // day 0
    expect(warmupDailyCap(CONNECT, new Date("2026-08-03T09:00:00Z"))).toBe(40); // day 2: 20 + 2*10
  });

  it("never exceeds the configured ceiling once warmed", () => {
    expect(warmupDailyCap(CONNECT, new Date("2027-01-01T00:00:00Z"))).toBe(500);
  });

  it("treats an unknown connect date as fully warmed", () => {
    expect(warmupDailyCap(null)).toBe(500);
  });
})
