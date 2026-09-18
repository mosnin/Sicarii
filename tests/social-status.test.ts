// Pipeline honesty for saveSocialMessage — the social send path that
// advances CRM status. An OUTBOUND touch may bump NEW/ENRICHED to
// CONTACTED and must never walk QUALIFIED/WON/REPLIED/LOST backward.
// An INBOUND reply flips CONTACTED -> REPLIED only. Ownership is
// checked before any write. Variant attribution is covered separately
// in tests/variant-attribution.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindUnique = vi.fn();
const contactUpdate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "c1", ...args.data }),
);
const contactSocialMessageCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "m1", ...args.data }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (args: unknown) => contactFindUnique(args),
      update: (args: { data: Record<string, unknown> }) => contactUpdate(args),
    },
    contactSocialMessage: {
      create: (args: { data: Record<string, unknown> }) => contactSocialMessageCreate(args),
    },
    // saveSocialMessage uses the array form: $transaction([create, update, ...]).
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("@/lib/variant-operations", () => ({
  assertVariantOwned: vi.fn().mockResolvedValue(undefined),
  attributeReply: vi.fn().mockResolvedValue(undefined),
}));

import { saveSocialMessage, OpError } from "@/lib/crm-operations";

const USER = "user-1";
const OTHER = "user-2";

function outbound() {
  return {
    contactId: "c1",
    channel: "LINKEDIN" as const,
    direction: "OUTBOUND" as const,
    body: "hi",
  };
}

function inbound() {
  return {
    contactId: "c1",
    channel: "LINKEDIN" as const,
    direction: "INBOUND" as const,
    body: "sure, tell me more",
  };
}

function owned(status: string) {
  return { id: "c1", userId: USER, status };
}

beforeEach(() => {
  contactFindUnique.mockReset().mockResolvedValue(owned("NEW"));
  contactUpdate.mockClear();
  contactSocialMessageCreate.mockClear();
});

describe("saveSocialMessage OUTBOUND status machine", () => {
  it("advances NEW to CONTACTED and stamps lastContactedAt", async () => {
    contactFindUnique.mockResolvedValue(owned("NEW"));
    await saveSocialMessage(USER, outbound());
    expect(contactUpdate).toHaveBeenCalledTimes(1);
    const data = contactUpdate.mock.calls[0]![0].data as {
      status?: string;
      lastContactedAt?: Date;
    };
    expect(data.status).toBe("CONTACTED");
    expect(data.lastContactedAt).toBeInstanceOf(Date);
  });

  it("advances ENRICHED to CONTACTED", async () => {
    contactFindUnique.mockResolvedValue(owned("ENRICHED"));
    await saveSocialMessage(USER, outbound());
    const data = contactUpdate.mock.calls[0]![0].data as { status?: string };
    expect(data.status).toBe("CONTACTED");
  });

  it.each(["CONTACTED", "REPLIED", "QUALIFIED", "WON", "LOST", "ARCHIVED"] as const)(
    "does not downgrade or rewrite status on OUTBOUND when already %s",
    async (status) => {
      contactFindUnique.mockResolvedValue(owned(status));
      await saveSocialMessage(USER, outbound());
      const data = contactUpdate.mock.calls[0]![0].data as {
        status?: string;
        lastContactedAt?: Date;
      };
      expect(data).not.toHaveProperty("status");
      expect(data.lastContactedAt).toBeInstanceOf(Date);
    },
  );
});

describe("saveSocialMessage INBOUND status machine", () => {
  it("flips CONTACTED to REPLIED", async () => {
    contactFindUnique.mockResolvedValue(owned("CONTACTED"));
    await saveSocialMessage(USER, inbound());
    const data = contactUpdate.mock.calls[0]![0].data as { status?: string };
    expect(data.status).toBe("REPLIED");
  });

  it.each(["NEW", "ENRICHED", "REPLIED", "QUALIFIED", "WON", "LOST"] as const)(
    "does not change status on INBOUND when the contact is %s",
    async (status) => {
      contactFindUnique.mockResolvedValue(owned(status));
      await saveSocialMessage(USER, inbound());
      const data = contactUpdate.mock.calls[0]![0].data as { status?: string };
      expect(data).not.toHaveProperty("status");
    },
  );
});

describe("saveSocialMessage ownership", () => {
  it("refuses another user's contact before any write", async () => {
    contactFindUnique.mockResolvedValue(owned("NEW"));
    await expect(saveSocialMessage(OTHER, outbound())).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    } satisfies Partial<OpError>);
    expect(contactSocialMessageCreate).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });
});
