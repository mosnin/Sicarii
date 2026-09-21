import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

const mailboxFindUnique = vi.fn();
const mailboxFindFirst = vi.fn();
const mailboxFindMany = vi.fn();
const mailboxCreate = vi.fn();
const mailboxUpdate = vi.fn();
const mailboxEventCreate = vi.fn();
const domainFindUnique = vi.fn();
const domainCreate = vi.fn();
const contactFindUnique = vi.fn();
const contactEmailCreate = vi.fn();
const contactUpdate = vi.fn();
const userFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mailbox: {
      findUnique: (args: unknown) => mailboxFindUnique(args),
      findFirst: (args: unknown) => mailboxFindFirst(args),
      findMany: (args: unknown) => mailboxFindMany(args),
      create: (args: unknown) => mailboxCreate(args),
      update: (args: unknown) => mailboxUpdate(args),
    },
    mailboxEvent: { create: (args: unknown) => mailboxEventCreate(args) },
    domain: {
      findUnique: (args: unknown) => domainFindUnique(args),
      create: (args: unknown) => domainCreate(args),
    },
    contact: {
      findUnique: (args: unknown) => contactFindUnique(args),
      update: (args: unknown) => contactUpdate(args),
    },
    contactEmail: { create: (args: unknown) => contactEmailCreate(args) },
    user: { findUnique: (args: unknown) => userFindUnique(args) },
    activity: { create: vi.fn() },
    variantSend: { create: vi.fn() },
    outreachVariant: { update: vi.fn(), findUnique: vi.fn() },
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  },
}));

vi.mock("@/lib/credits", () => ({
  ensureCredits: vi.fn(async () => undefined),
  spendCredits: vi.fn(async () => undefined),
}));

vi.mock("@/lib/mailbox-send", () => ({
  sendViaSmtpCiphertext: vi.fn(async () => ({ accepted: true, providerId: "msg_1" })),
  sendViaAgentMail: vi.fn(),
  sendViaBird: vi.fn(),
  birdConfigured: () => false,
}));

vi.mock("@/lib/premium-inboxes", () => ({
  placeInboxOrder: vi.fn(async () => ({
    orderId: "ord_1",
    status: "pending_fulfillment",
    email: "alex@acme.com",
    detail: "pending",
  })),
  premiumInboxesConfigured: () => false,
}));

import { getMailbox, sendOutreachEmail } from "@/lib/mailbox-operations";
import { sendViaSmtpCiphertext } from "@/lib/mailbox-send";

beforeEach(() => {
  mailboxFindUnique.mockReset();
  mailboxFindFirst.mockReset();
  mailboxFindMany.mockReset();
  mailboxCreate.mockReset();
  mailboxUpdate.mockReset();
  mailboxEventCreate.mockReset();
  domainFindUnique.mockReset();
  domainCreate.mockReset();
  contactFindUnique.mockReset();
  contactEmailCreate.mockReset();
  contactUpdate.mockReset();
  userFindUnique.mockReset();
  vi.mocked(sendViaSmtpCiphertext).mockClear();
});

function readyBox(over: Record<string, unknown> = {}) {
  return {
    id: "mb1",
    userId: OWNER,
    email: "alex@acme.com",
    displayName: "Alex",
    provider: "smtp",
    status: "ready",
    domainId: "d1",
    warmupDay: 21,
    dailySendLimit: 40,
    sentToday: 0,
    sentTodayOn: null,
    warmupStartedAt: new Date("2026-09-01T00:00:00.000Z"),
    smtpCiphertext: "v1.cipher",
    smtpLast4: "alex",
    lastError: null,
    createdAt: new Date(),
    domain: { name: "acme.com" },
    ...over,
  };
}

describe("mailbox ownership", () => {
  it("hides another tenant's mailbox", async () => {
    mailboxFindUnique.mockResolvedValue(readyBox());
    await expect(getMailbox(ATTACKER, "mb1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("sendOutreachEmail", () => {
  it("refuses a warming inbox that is not yet ready", async () => {
    contactFindUnique.mockResolvedValue({
      id: "c1",
      userId: OWNER,
      email: "lead@target.com",
      status: "ENRICHED",
    });
    mailboxFindFirst.mockResolvedValue(readyBox({ status: "warming", warmupDay: 4 }));
    await expect(
      sendOutreachEmail(OWNER, { contactId: "c1", subject: "hi", body: "quick question?" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(sendViaSmtpCiphertext).not.toHaveBeenCalled();
  });

  it("refuses a contact with no email", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER, email: null, status: "NEW" });
    await expect(
      sendOutreachEmail(OWNER, { contactId: "c1", subject: "hi", body: "quick question?" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("hits the daily cap before calling the provider", async () => {
    contactFindUnique.mockResolvedValue({
      id: "c1",
      userId: OWNER,
      email: "lead@target.com",
      status: "ENRICHED",
    });
    mailboxFindFirst.mockResolvedValue(
      readyBox({ sentToday: 40, sentTodayOn: new Date(), dailySendLimit: 40 }),
    );
    await expect(
      sendOutreachEmail(OWNER, { contactId: "c1", subject: "hi", body: "quick question?" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(sendViaSmtpCiphertext).not.toHaveBeenCalled();
  });

  it("delivers from a ready mailbox and logs the thread", async () => {
    contactFindUnique.mockResolvedValue({
      id: "c1",
      userId: OWNER,
      email: "lead@target.com",
      status: "ENRICHED",
    });
    mailboxFindFirst.mockResolvedValue(readyBox());
    mailboxUpdate.mockResolvedValue(readyBox());
    contactUpdate.mockResolvedValue({
      id: "c1",
      userId: OWNER,
      email: "lead@target.com",
      status: "CONTACTED",
      lastContactedAt: new Date(),
    });
    contactEmailCreate.mockResolvedValue({ id: "em1" });
    mailboxEventCreate.mockResolvedValue({ id: "ev1" });

    const result = await sendOutreachEmail(OWNER, {
      contactId: "c1",
      subject: "quick question about Acme",
      body: "Jordan, worth 15 minutes this week?",
    });

    expect(sendViaSmtpCiphertext).toHaveBeenCalledTimes(1);
    expect(contactEmailCreate).toHaveBeenCalled();
    expect(result.from).toBe("alex@acme.com");
    expect(result.to).toBe("lead@target.com");
    expect(result.emailId).toBe("em1");
  });
});
