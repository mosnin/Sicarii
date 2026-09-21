import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

const contactFindUnique = vi.fn();
const mailboxFindUnique = vi.fn();
const jobFindUnique = vi.fn();
const jobCreate = vi.fn();
const jobUpdate = vi.fn();
const jobCount = vi.fn();
const jobFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findUnique: (args: unknown) => contactFindUnique(args) },
    mailbox: { findUnique: (args: unknown) => mailboxFindUnique(args) },
    mailboxSendJob: {
      findUnique: (args: unknown) => jobFindUnique(args),
      create: (args: unknown) => jobCreate(args),
      update: (args: unknown) => jobUpdate(args),
      count: (args: unknown) => jobCount(args),
      findMany: (args: unknown) => jobFindMany(args),
    },
  },
}));

vi.mock("@/lib/mailbox-operations", () => ({
  sendOutreachEmail: vi.fn(async () => ({ emailId: "em1" })),
}));

import { enqueueOutreach, fulfillQueuedSend, listQueuedSendJobIds } from "@/lib/mailbox-queue";
import { sendOutreachEmail } from "@/lib/mailbox-operations";

beforeEach(() => {
  contactFindUnique.mockReset();
  mailboxFindUnique.mockReset();
  jobFindUnique.mockReset();
  jobCreate.mockReset();
  jobUpdate.mockReset();
  jobCount.mockReset();
  jobFindMany.mockReset();
  vi.mocked(sendOutreachEmail).mockClear();
});

describe("queued outreach", () => {
  it("refuses another tenant's contact and mailbox", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER, doNotContact: false });
    await expect(
      enqueueOutreach(ATTACKER, {
        contactId: "c1",
        mailboxId: "mb1",
        subject: "hi",
        body: "hello",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it("refuses do-not-contact before insert", async () => {
    contactFindUnique.mockResolvedValue({
      id: "c1",
      userId: OWNER,
      doNotContact: true,
      doNotContactReason: "unsubscribe",
    });
    await expect(
      enqueueOutreach(OWNER, { contactId: "c1", mailboxId: "mb1", subject: "hi", body: "hello" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it("is idempotent on the same key", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER, doNotContact: false });
    mailboxFindUnique.mockResolvedValue({ id: "mb1", userId: OWNER });
    jobFindUnique.mockResolvedValue({ id: "job1", userId: OWNER, status: "queued" });

    const first = await enqueueOutreach(OWNER, {
      contactId: "c1",
      mailboxId: "mb1",
      subject: "hi",
      body: "hello",
      idempotencyKey: "k1",
    });
    expect(first).toEqual({ jobId: "job1", status: "queued", deduped: true });
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it("paginates queued ids with a cursor", async () => {
    jobFindMany.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({ id: `j${i}` })));
    const page = await listQueuedSendJobIds({ limit: 200 });
    expect(page.ids).toHaveLength(200);
    expect(page.nextCursor).toBeTruthy();
    expect(jobFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 201, orderBy: { id: "asc" } }),
    );
  });

  it("skips a job that already sent", async () => {
    jobFindUnique.mockResolvedValue({ id: "job1", userId: OWNER, status: "sent" });
    const result = await fulfillQueuedSend("job1");
    expect(result).toEqual({ sent: false, skipped: "already_sent" });
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });
});
