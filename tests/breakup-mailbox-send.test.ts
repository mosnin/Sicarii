import { describe, it, expect, vi, beforeEach } from "vitest";

const sendOutreachEmail = vi.fn();

vi.mock("@/lib/mailbox-operations", () => ({
  sendOutreachEmail: (...args: unknown[]) => sendOutreachEmail(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    breakupDraft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contact: { findUnique: vi.fn(), update: vi.fn() },
    activity: { create: vi.fn() },
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  },
}));

vi.mock("@/lib/credits", () => ({
  ensureCredits: vi.fn(),
  spendCredits: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { approveBreakupDraft } from "@/lib/breakup-operations";

const draft = {
  id: "d1",
  userId: "user-A",
  contactId: "c1",
  status: "PENDING",
  subject: "Should I close this out?",
  body: "Grounded breakup email body.",
};

beforeEach(() => {
  sendOutreachEmail.mockReset();
  vi.mocked(prisma.breakupDraft.findUnique).mockResolvedValue(draft as never);
  vi.mocked(prisma.breakupDraft.update).mockResolvedValue({ ...draft, status: "SENT" } as never);
});

describe("breakup approve live send", () => {
  it("tries sendOutreachEmail before the log-only fallback", async () => {
    sendOutreachEmail.mockResolvedValueOnce({ emailId: "em1" });
    await approveBreakupDraft("user-A", "d1");
    expect(sendOutreachEmail).toHaveBeenCalledWith("user-A", {
      contactId: "c1",
      subject: draft.subject,
      body: draft.body,
    });
    expect(prisma.breakupDraft.update).toHaveBeenCalled();
  });
});
