// Social DMs are contact-scoped history. A caller who supplies another
// tenant's contactId must 404 before any message is written or listed —
// otherwise one workspace can read or append another workspace's inbox.

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

const contactFindUnique = vi.fn();
const messageFindMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (...a: unknown[]) => contactFindUnique(...a),
    },
    contactSocialMessage: {
      findMany: (...a: unknown[]) => messageFindMany(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

vi.mock("@/lib/variant-operations", () => ({
  assertVariantOwned: vi.fn(),
  attributeReply: vi.fn(),
}));

import { saveSocialMessage, listSocialMessages } from "@/lib/crm-operations";

async function expectDenied(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toMatchObject({ name: "OpError", status: 404 });
}

describe("social message tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER, status: "NEW" });
  });

  it("saveSocialMessage denies a non-owner and never opens a transaction", async () => {
    await expectDenied(() =>
      saveSocialMessage(ATTACKER, {
        contactId: "c1",
        channel: "LINKEDIN",
        direction: "OUTBOUND",
        body: "stolen thread",
      }),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("listSocialMessages denies a non-owner and never reads the inbox", async () => {
    await expectDenied(() => listSocialMessages(ATTACKER, "c1"));
    expect(messageFindMany).not.toHaveBeenCalled();
  });

  it("listSocialMessages 404s a missing contact", async () => {
    contactFindUnique.mockResolvedValue(null);
    await expectDenied(() => listSocialMessages(OWNER, "missing"));
    expect(messageFindMany).not.toHaveBeenCalled();
  });

  it("listSocialMessages returns the inbox for the real owner", async () => {
    messageFindMany.mockResolvedValue([{ id: "m1", body: "hi" }]);
    await expect(listSocialMessages(OWNER, "c1", "LINKEDIN")).resolves.toEqual([
      { id: "m1", body: "hi" },
    ]);
    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contactId: "c1", channel: "LINKEDIN" },
        take: 100,
      }),
    );
  });
});
