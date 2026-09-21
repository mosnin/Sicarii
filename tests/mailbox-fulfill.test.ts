import { describe, it, expect, vi, beforeEach } from "vitest";

const mailboxFindMany = vi.fn();
const mailboxUpdate = vi.fn();
const mailboxFindUnique = vi.fn();
const mailboxEventCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mailbox: {
      findMany: (args: unknown) => mailboxFindMany(args),
      findUnique: (args: unknown) => mailboxFindUnique(args),
      update: (args: unknown) => mailboxUpdate(args),
    },
    mailboxEvent: { create: (args: unknown) => mailboxEventCreate(args) },
  },
}));

const fetchInboxOrder = vi.fn();
vi.mock("@/lib/premium-inboxes", () => ({
  fetchInboxOrder: (id: string) => fetchInboxOrder(id),
  placeInboxOrder: vi.fn(),
  premiumInboxesConfigured: () => true,
}));

import { pollPendingMailboxOrders } from "@/lib/mailbox-operations";

beforeEach(() => {
  mailboxFindMany.mockReset();
  mailboxUpdate.mockReset();
  mailboxFindUnique.mockReset();
  mailboxEventCreate.mockReset();
  fetchInboxOrder.mockReset();
});

describe("pollPendingMailboxOrders", () => {
  it("leaves local pending orders untouched", async () => {
    mailboxFindMany.mockResolvedValue([
      { id: "mb1", status: "requested", providerOrderId: "local_u1_1", email: "alex@acme.com" },
    ]);
    const result = await pollPendingMailboxOrders();
    expect(fetchInboxOrder).toHaveBeenCalledWith("local_u1_1");
    expect(result.fulfilled).toBe(0);
  });

  it("promotes a ready partner order into warming", async () => {
    mailboxFindMany.mockResolvedValueOnce([
      { id: "mb1", status: "provisioning", providerOrderId: "ord_9", email: "alex@acme.com", warmupStartedAt: null, warmupDay: 0, providerInboxId: null, smtpCiphertext: null, smtpLast4: null },
    ]);
    fetchInboxOrder.mockResolvedValue({
      orderId: "ord_9",
      ready: true,
      email: "alex@acme.com",
      smtp: { host: "smtp.gmail.com", port: 587, secure: false, username: "alex@acme.com", password: "x" },
    });
    mailboxFindUnique.mockResolvedValue({
      id: "mb1",
      status: "provisioning",
      warmupStartedAt: null,
      warmupDay: 0,
      providerInboxId: null,
      smtpCiphertext: null,
      smtpLast4: null,
    });
    mailboxUpdate.mockResolvedValue({
      id: "mb1",
      email: "alex@acme.com",
      displayName: null,
      provider: "premium_inboxes",
      status: "warming",
      domainId: null,
      warmupDay: 1,
      dailySendLimit: 5,
      sentToday: 0,
      sentTodayOn: null,
      warmupStartedAt: new Date(),
      smtpLast4: "alex",
      lastError: null,
      createdAt: new Date(),
    });
    mailboxEventCreate.mockResolvedValue({ id: "ev" });

    const result = await pollPendingMailboxOrders();
    expect(result.fulfilled).toBe(1);
    expect(mailboxUpdate).toHaveBeenCalled();
  });
});
