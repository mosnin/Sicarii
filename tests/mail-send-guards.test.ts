// sendMail is the one door real cold email leaves through, so its guards are
// pinned against a mocked database: do-not-contact refusal, no-mailbox and
// warming-mailbox refusals (with the "when it reopens" hint), tenant
// isolation on mailboxId / replyToMessageId, credit gating before any provider
// call, follow-up threading on our own sends, and the happy path's side
// effects (mirror onto contact, outreach log, credit spend, lint attached).
// Also covers the vendor CSV parser used by the PremiumInboxes import.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const forbid = (name: string) =>
    vi.fn(() => {
      throw new Error(`UNEXPECTED: ${name} was called`);
    });
  return {
    prisma: {
      contact: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      mailbox: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      mailMessage: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      contactEmail: { create: vi.fn() },
      activity: { create: vi.fn() },
      mailDomain: { findUnique: vi.fn(), findMany: vi.fn() },
      mailboxOrder: { findUnique: forbid("mailboxOrder.findUnique") },
    },
  };
});

vi.mock("@/lib/credits", () => ({
  ensureCredits: vi.fn(async () => undefined),
  spendCredits: vi.fn(async () => undefined),
  CREDIT_COSTS: { mail_send: 1 },
}));

vi.mock("@/lib/crm-operations", async () => {
  const { OpError } = await import("@/lib/op-error");
  return { OpError, logOutreach: vi.fn() };
});

vi.mock("@/lib/variant-operations", () => ({ attributeReply: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyTaskWebhook: vi.fn() }));
vi.mock("@/lib/inngest", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/lib/stripe", () => ({ createOrderCheckoutSession: vi.fn(), stripeConfigured: () => false }));
vi.mock("@/lib/mail/smtp", () => ({
  smtpSend: vi.fn(),
  smtpVerify: vi.fn(),
  imapFetchNew: vi.fn(),
  imapVerify: vi.fn(),
  guessHosts: vi.fn(),
}));
vi.mock("@/lib/agentmail", () => ({
  isAgentMailPlatformConfigured: () => true,
  platformAgentMailKey: () => "am-key",
  sendMessage: vi.fn(),
  replyToMessage: vi.fn(),
  createInbox: vi.fn(),
  deleteInbox: vi.fn(),
  listReceivedMessages: vi.fn(),
  createDomain: vi.fn(),
  getDomain: vi.fn(),
  verifyDomain: vi.fn(),
  parseMessage: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { ensureCredits, spendCredits } from "@/lib/credits";
import { logOutreach } from "@/lib/crm-operations";
import * as agentmail from "@/lib/agentmail";
import { OpError } from "@/lib/op-error";
import { sendMail, parseInboxCsv, utcMidnight } from "@/lib/mailbox-operations";

const OWNER = "user-A";
const OTHER = "user-B";
const CONTACT = "11111111-1111-4111-8111-111111111111";
const MAILBOX = "22222222-2222-4222-8222-222222222222";
const today = utcMidnight();

function mailbox(over: Record<string, unknown> = {}) {
  return {
    id: MAILBOX,
    userId: OWNER,
    address: "sam@try-acme.com",
    displayName: "Sam",
    provider: "AGENTMAIL",
    providerInboxId: "sam@try-acme.com",
    status: "ACTIVE",
    warmupEnabled: true,
    warmupDay: 50,
    dailyCap: 30,
    healthScore: 100,
    sentDate: today,
    sentToday: 0,
    warmupSentToday: 0,
    sentTotal: 0,
    secretCiphertext: null,
    smtpHost: null,
    smtpPort: null,
    imapHost: null,
    imapPort: null,
    username: null,
    domainId: null,
    lastError: null,
    lastErrorAt: null,
    lastSyncedAt: null,
    bounces: 0,
    complaints: 0,
    warmupSent: 0,
    warmupReplies: 0,
    warmupSpamSaved: 0,
    createdAt: new Date(),
    ...over,
  };
}

function contact(over: Record<string, unknown> = {}) {
  return { id: CONTACT, userId: OWNER, email: "jane@acme.com", doNotContact: false, doNotContactReason: null, ...over };
}

const DRAFT = { subject: "the SDR hiring post", text: "Saw the three SDR openings.\n\nMost teams lose a week per rep to list-building.\n\nWorth a look?\n\nSam" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.mailbox.count).mockResolvedValue(1);
  vi.mocked(prisma.mailbox.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.mailbox.update).mockResolvedValue(mailbox() as never);
  vi.mocked(prisma.mailMessage.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    id: "m-new",
    ...data,
    rfcMessageId: null,
    providerMessageId: null,
    isWarmup: false,
    classification: null,
    classifierNote: null,
    error: null,
    sentAt: null,
    receivedAt: null,
    createdAt: new Date(),
  })) as never);
  vi.mocked(prisma.mailMessage.update).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    id: "m-new",
    userId: OWNER,
    mailboxId: MAILBOX,
    contactId: CONTACT,
    direction: "OUTBOUND",
    fromAddr: "sam@try-acme.com",
    toAddr: "jane@acme.com",
    subject: DRAFT.subject,
    textBody: DRAFT.text,
    htmlBody: null,
    inReplyTo: null,
    threadKey: "t",
    isWarmup: false,
    classification: null,
    classifierNote: null,
    error: null,
    receivedAt: null,
    createdAt: new Date(),
    ...data,
  })) as never);
  vi.mocked(agentmail.sendMessage).mockResolvedValue({ messageId: "am-1", threadId: "th-1" });
  vi.mocked(agentmail.replyToMessage).mockResolvedValue({ messageId: "am-2", threadId: "th-1" });
});

describe("sendMail guards", () => {
  it("refuses a do-not-contact contact before touching any mailbox", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact({ doNotContact: true, doNotContactReason: "bounced" }) as never);
    await expect(sendMail(OWNER, { contactId: CONTACT, ...DRAFT })).rejects.toMatchObject({ status: 409 });
    await expect(sendMail(OWNER, { contactId: CONTACT, ...DRAFT })).rejects.toThrow(/do-not-contact/);
    expect(prisma.mailbox.findMany).not.toHaveBeenCalled();
    expect(agentmail.sendMessage).not.toHaveBeenCalled();
  });

  it("refuses a raw address that belongs to an opted-out contact", async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValueOnce(contact({ doNotContact: true, doNotContactReason: "unsubscribed" }) as never);
    await expect(sendMail(OWNER, { to: "jane@acme.com", ...DRAFT })).rejects.toThrow(/unsubscribed/);
  });

  it("does not let one tenant use another's contact or mailbox", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact({ userId: OTHER }) as never);
    await expect(sendMail(OWNER, { contactId: CONTACT, ...DRAFT })).rejects.toMatchObject({ status: 404 });

    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact() as never);
    vi.mocked(prisma.mailbox.findUnique).mockResolvedValue(mailbox({ userId: OTHER }) as never);
    await expect(sendMail(OWNER, { contactId: CONTACT, mailboxId: MAILBOX, ...DRAFT })).rejects.toMatchObject({ status: 404 });
    expect(agentmail.sendMessage).not.toHaveBeenCalled();
  });

  it("explains when there is no mailbox at all vs. none with headroom", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact() as never);
    vi.mocked(prisma.mailbox.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.mailbox.count).mockResolvedValueOnce(0);
    await expect(sendMail(OWNER, { contactId: CONTACT, ...DRAFT })).rejects.toThrow(/No mailbox yet/);
    vi.mocked(prisma.mailbox.count).mockResolvedValueOnce(2);
    await expect(sendMail(OWNER, { contactId: CONTACT, ...DRAFT })).rejects.toMatchObject({ status: 429 });
  });

  it("refuses a mailbox still in its first two weeks and says when cold mail opens", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact() as never);
    const warming = mailbox({ status: "WARMING", warmupDay: 5 });
    vi.mocked(prisma.mailbox.findUnique).mockResolvedValue(warming as never);
    vi.mocked(prisma.mailbox.updateMany).mockResolvedValue({ count: 0 } as never); // cap = 0 -> no slot
    await expect(sendMail(OWNER, { contactId: CONTACT, mailboxId: MAILBOX, ...DRAFT })).rejects.toThrow(/warmup day 5; cold email opens on day 14/);
    expect(agentmail.sendMessage).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("refuses paused mailboxes and unhealthy ones", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact() as never);
    vi.mocked(prisma.mailbox.findUnique).mockResolvedValueOnce(mailbox({ status: "PAUSED" }) as never);
    await expect(sendMail(OWNER, { contactId: CONTACT, mailboxId: MAILBOX, ...DRAFT })).rejects.toThrow(/paused/);
    vi.mocked(prisma.mailbox.findUnique).mockResolvedValueOnce(mailbox({ healthScore: 40 }) as never);
    await expect(sendMail(OWNER, { contactId: CONTACT, mailboxId: MAILBOX, ...DRAFT })).rejects.toThrow(/health is 40/);
  });

  it("checks credits before reserving a slot or calling the provider", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact() as never);
    vi.mocked(prisma.mailbox.findUnique).mockResolvedValue(mailbox() as never);
    vi.mocked(ensureCredits).mockRejectedValueOnce(new OpError("Out of credits.", 402));
    await expect(sendMail(OWNER, { contactId: CONTACT, mailboxId: MAILBOX, ...DRAFT })).rejects.toMatchObject({ status: 402 });
    expect(prisma.mailbox.updateMany).not.toHaveBeenCalled();
    expect(agentmail.sendMessage).not.toHaveBeenCalled();
  });
});

describe("sendMail happy paths", () => {
  beforeEach(() => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact() as never);
    vi.mocked(prisma.mailbox.findUnique).mockResolvedValue(mailbox({ sentToday: 1 }) as never);
  });

  it("sends a first touch: reserves a slot, spends a credit, mirrors onto the contact, logs outreach, returns lint", async () => {
    const r = await sendMail(OWNER, { contactId: CONTACT, mailboxId: MAILBOX, ...DRAFT, variantId: "33333333-3333-4333-8333-333333333333" });
    expect(agentmail.sendMessage).toHaveBeenCalledWith("am-key", "sam@try-acme.com", expect.objectContaining({ to: ["jane@acme.com"], subject: DRAFT.subject }));
    expect(ensureCredits).toHaveBeenCalledWith(OWNER, "mail_send");
    expect(spendCredits).toHaveBeenCalledWith(OWNER, "mail_send", expect.objectContaining({ ref: "m-new" }));
    expect(prisma.contactEmail.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contactId: CONTACT, direction: "OUTBOUND", toAddr: "jane@acme.com" }) }));
    expect(logOutreach).toHaveBeenCalledWith(OWNER, expect.objectContaining({ contactId: CONTACT, channel: "email", variantId: "33333333-3333-4333-8333-333333333333" }));
    expect(r.mailbox.address).toBe("sam@try-acme.com");
    expect(r.mailbox.coldRemainingToday).toBe(29);
    expect(r.lint.warnings).toEqual([]);
    expect(r.message.direction).toBe("OUTBOUND");
  });

  it("replies to a human in-thread from the receiving mailbox without a cap or credit", async () => {
    vi.mocked(prisma.mailMessage.findUnique).mockResolvedValue({
      id: "in-1",
      userId: OWNER,
      mailboxId: MAILBOX,
      contactId: CONTACT,
      direction: "INBOUND",
      status: "RECEIVED",
      isWarmup: false,
      fromAddr: "Jane@Acme.com",
      toAddr: "sam@try-acme.com",
      subject: "Re: the SDR hiring post",
      providerMessageId: "am-in-1",
      rfcMessageId: "<abc@acme.com>",
      threadKey: "<abc@acme.com>",
    } as never);
    const r = await sendMail(OWNER, { replyToMessageId: "in-1", subject: "Re:", text: "Thursday works. Sam" });
    expect(agentmail.replyToMessage).toHaveBeenCalledWith("am-key", "sam@try-acme.com", "am-in-1", expect.objectContaining({ text: "Thursday works. Sam" }));
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(logOutreach).not.toHaveBeenCalled();
    expect(prisma.activity.create).toHaveBeenCalled();
    const created = vi.mocked(prisma.mailMessage.create).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(created.data.toAddr).toBe("jane@acme.com");
    expect(created.data.subject).toBe("Re: the SDR hiring post");
    expect(created.data.inReplyTo).toBe("<abc@acme.com>");
    expect(r.lint.warnings).toEqual([]);
  });

  it("treats a reply to our own sent message as a follow-up: threaded, same recipient, still cold (capped + metered)", async () => {
    vi.mocked(prisma.mailMessage.findUnique).mockResolvedValue({
      id: "out-1",
      userId: OWNER,
      mailboxId: MAILBOX,
      contactId: CONTACT,
      direction: "OUTBOUND",
      status: "SENT",
      isWarmup: false,
      fromAddr: "sam@try-acme.com",
      toAddr: "jane@acme.com",
      subject: "the SDR hiring post",
      providerMessageId: "am-out-1",
      rfcMessageId: "<out1@try-acme.com>",
      threadKey: "<out1@try-acme.com>",
    } as never);
    await sendMail(OWNER, { replyToMessageId: "out-1", subject: "Re:", text: "One more data point: Acme cut ramp time by half. Still worth a look?" });
    expect(ensureCredits).toHaveBeenCalledWith(OWNER, "mail_send");
    expect(spendCredits).toHaveBeenCalled();
    expect(logOutreach).toHaveBeenCalled();
    const created = vi.mocked(prisma.mailMessage.create).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(created.data.toAddr).toBe("jane@acme.com");
    expect(created.data.inReplyTo).toBe("<out1@try-acme.com>");
    expect(created.data.threadKey).toBe("<out1@try-acme.com>");
  });

  it("refuses to reply to another tenant's message or to warmup traffic", async () => {
    vi.mocked(prisma.mailMessage.findUnique).mockResolvedValueOnce({ id: "x", userId: OTHER, direction: "INBOUND", isWarmup: false } as never);
    await expect(sendMail(OWNER, { replyToMessageId: "x", subject: "Re:", text: "hi" })).rejects.toMatchObject({ status: 404 });
    vi.mocked(prisma.mailMessage.findUnique).mockResolvedValueOnce({ id: "w", userId: OWNER, direction: "INBOUND", isWarmup: true } as never);
    await expect(sendMail(OWNER, { replyToMessageId: "w", subject: "Re:", text: "hi" })).rejects.toThrow(/warmup traffic/);
  });

  it("releases the slot and records the failure when the provider rejects", async () => {
    vi.mocked(agentmail.sendMessage).mockRejectedValueOnce(new Error("550 relay denied"));
    await expect(sendMail(OWNER, { contactId: CONTACT, mailboxId: MAILBOX, ...DRAFT })).rejects.toThrow(/Send failed: 550/);
    expect(spendCredits).not.toHaveBeenCalled();
    const updates = vi.mocked(prisma.mailbox.updateMany).mock.calls.map((c) => c[0] as { data: Record<string, unknown> });
    expect(updates.some((u) => JSON.stringify(u.data).includes("decrement"))).toBe(true);
    expect(prisma.mailMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });
});

describe("parseInboxCsv", () => {
  it("reads the PremiumInboxes-style export regardless of column order and delimiter", () => {
    const csv = [
      "First Name;Last Name;Email;App Password;SMTP Host;SMTP Port;IMAP Host;IMAP Port",
      'Sam;Lee;SAM@try-acme.com;"abcd efgh ijkl mnop";smtp.gmail.com;587;imap.gmail.com;993',
      "Mia;Chen;mia@try-acme.com;wxyz wxyz wxyz wxyz;;;;",
      "bad;row;not-an-email;pw;;;;",
      ";;;;;;;",
    ].join("\n");
    const rows = parseInboxCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ address: "sam@try-acme.com", password: "abcd efgh ijkl mnop", displayName: "Sam Lee", smtpHost: "smtp.gmail.com", smtpPort: 587, imapHost: "imap.gmail.com", imapPort: 993 });
    expect(rows[1]).toMatchObject({ address: "mia@try-acme.com", displayName: "Mia Chen", smtpHost: null, smtpPort: null });
  });

  it("returns nothing without the two required columns", () => {
    expect(parseInboxCsv("email,name\nsam@x.com,Sam")).toEqual([]);
    expect(parseInboxCsv("")).toEqual([]);
  });

  it("handles quoted commas and escaped quotes", () => {
    const rows = parseInboxCsv('email,password,name\nsam@x.com,"p,w""d","Lee, Sam"');
    expect(rows[0]).toMatchObject({ password: 'p,w"d', displayName: "Lee, Sam" });
  });
});
