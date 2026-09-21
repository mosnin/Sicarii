import { describe, it, expect, vi, beforeEach } from "vitest";

const mailboxFindUnique = vi.fn();
const mailboxFindFirst = vi.fn();
const mailboxEventCreate = vi.fn();
const contactFindFirst = vi.fn();
const contactFindUnique = vi.fn();
const contactEmailCreate = vi.fn();
const contactUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mailbox: {
      findUnique: (args: unknown) => mailboxFindUnique(args),
      findFirst: (args: unknown) => mailboxFindFirst(args),
    },
    mailboxEvent: { create: (args: unknown) => mailboxEventCreate(args) },
    contact: {
      findFirst: (args: unknown) => contactFindFirst(args),
      findUnique: (args: unknown) => contactFindUnique(args),
      update: (args: unknown) => contactUpdate(args),
    },
    contactEmail: { create: (args: unknown) => contactEmailCreate(args) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    outreachVariant: { update: vi.fn() },
  },
}));

import { ingestInboundEmail } from "@/lib/mailbox-inbound";

beforeEach(() => {
  mailboxFindUnique.mockReset();
  mailboxFindFirst.mockReset();
  mailboxEventCreate.mockReset();
  contactFindFirst.mockReset();
  contactFindUnique.mockReset();
  contactEmailCreate.mockReset();
  contactUpdate.mockReset();
});

describe("ingestInboundEmail", () => {
  it("records an unmatched reply without inventing a contact", async () => {
    mailboxFindFirst.mockResolvedValue({ id: "mb1", userId: "u1", email: "alex@acme.com" });
    contactFindFirst.mockResolvedValue(null);
    mailboxEventCreate.mockResolvedValue({ id: "ev1" });

    const result = await ingestInboundEmail({
      from: "stranger@other.com",
      to: "Alex <alex@acme.com>",
      text: "who is this?",
      subject: "hello",
    });

    expect(result).toEqual({ matched: false, mailboxId: "mb1" });
    expect(contactEmailCreate).not.toHaveBeenCalled();
    expect(mailboxEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "reply", meta: expect.objectContaining({ unmatched: true }) }),
      }),
    );
  });

  it("saves a matched reply onto the contact", async () => {
    mailboxFindFirst.mockResolvedValue({ id: "mb1", userId: "u1", email: "alex@acme.com" });
    contactFindFirst.mockResolvedValue({ id: "c1" });
    contactFindUnique.mockResolvedValue({ id: "c1", userId: "u1", status: "CONTACTED" });
    contactEmailCreate.mockResolvedValue({ id: "em1" });
    contactUpdate.mockResolvedValue({ id: "c1", status: "REPLIED" });
    mailboxEventCreate.mockResolvedValue({ id: "ev1" });

    const result = await ingestInboundEmail({
      from: "Lead@target.com",
      to: "alex@acme.com",
      text: "sure, Thursday works",
      subject: "Re: quick question",
    });

    expect(result.matched).toBe(true);
    expect(result.contactId).toBe("c1");
    expect(result.emailId).toBe("em1");
    expect(contactEmailCreate).toHaveBeenCalled();
  });

  it("404s when no mailbox owns the To address", async () => {
    mailboxFindFirst.mockResolvedValue(null);
    await expect(
      ingestInboundEmail({ from: "a@x.com", to: "nobody@acme.com", text: "hi" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
