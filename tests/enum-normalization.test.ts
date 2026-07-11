// Forgiving enum casing for the MCP + in-app agent tool contract (Codex live
// audit 2026-07-11).
//
// Live finding: log_social_message rejected { channel: "LINKEDIN", direction:
// "OUTBOUND" } (channel expected lowercase) and then rejected the "corrected"
// { channel: "linkedin", direction: "outbound" } (direction expected
// uppercase) - an agent has no way to guess the right casing per field.
// add_activity rejected { kind: "NOTE" } the same way. Scalar is agent-first;
// the tool should absorb whatever casing an agent emits instead of making it
// memorize an arbitrary per-field convention.
//
// These tests pin: the pure normalizers accept every casing and alias, the
// shared requireNormalized() failure path names the field and accepted
// values, and saveSocialMessage/addActivity - the exact composition both the
// MCP route and the in-app agent route call - persist the CANONICAL value
// regardless of input casing.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindUnique = vi.fn();
const contactUpdate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "c1", ...args.data }),
);
const contactSocialMessageCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "m1", ...args.data }),
);
const contactSocialMessageFindMany = vi.fn().mockResolvedValue([]);
const entityFindUnique = vi.fn();
const activityCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "a1", ...args.data }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (args: unknown) => contactFindUnique(args),
      update: (args: { data: Record<string, unknown> }) => contactUpdate(args),
    },
    contactSocialMessage: {
      create: (args: { data: Record<string, unknown> }) => contactSocialMessageCreate(args),
      findMany: (args: unknown) => contactSocialMessageFindMany(args),
    },
    entity: {
      findUnique: (args: unknown) => entityFindUnique(args),
    },
    activity: {
      create: (args: { data: Record<string, unknown> }) => activityCreate(args),
    },
    // saveSocialMessage/logOutreach use the array form: $transaction([p1, p2]).
    // The array members are already-invoked mock promises by the time
    // $transaction sees them, so Promise.all is a faithful stand-in.
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { saveSocialMessage, listSocialMessages, addActivity } from "@/lib/crm-operations";
import {
  normalizeSocialChannel,
  normalizeDirection,
  normalizeActivityKind,
  requireNormalized,
} from "@/lib/agent-enums";

const USER = "user-1";

beforeEach(() => {
  contactFindUnique.mockReset().mockResolvedValue({ id: "c1", userId: USER, status: "NEW" });
  contactUpdate.mockClear();
  contactSocialMessageCreate.mockClear();
  contactSocialMessageFindMany.mockClear().mockResolvedValue([]);
  entityFindUnique.mockReset().mockResolvedValue({ id: "e1", userId: USER });
  activityCreate.mockClear();
});

describe("normalizeSocialChannel", () => {
  it("accepts every channel and known alias, any casing", () => {
    expect(normalizeSocialChannel("linkedin")).toBe("LINKEDIN");
    expect(normalizeSocialChannel("LINKEDIN")).toBe("LINKEDIN");
    expect(normalizeSocialChannel("LinkedIn")).toBe("LINKEDIN");
    expect(normalizeSocialChannel("x")).toBe("X");
    expect(normalizeSocialChannel("X")).toBe("X");
    expect(normalizeSocialChannel("twitter")).toBe("X");
    expect(normalizeSocialChannel("Twitter")).toBe("X");
    expect(normalizeSocialChannel("instagram")).toBe("INSTAGRAM");
    expect(normalizeSocialChannel("INSTAGRAM")).toBe("INSTAGRAM");
    expect(normalizeSocialChannel("facebook")).toBe("FACEBOOK");
    expect(normalizeSocialChannel("FACEBOOK")).toBe("FACEBOOK");
    expect(normalizeSocialChannel("other")).toBe("OTHER");
    expect(normalizeSocialChannel("OTHER")).toBe("OTHER");
  });

  it("returns null for anything unknown", () => {
    expect(normalizeSocialChannel("myspace")).toBeNull();
    expect(normalizeSocialChannel("")).toBeNull();
  });
});

describe("normalizeDirection", () => {
  it("accepts inbound/outbound, any casing", () => {
    expect(normalizeDirection("inbound")).toBe("INBOUND");
    expect(normalizeDirection("INBOUND")).toBe("INBOUND");
    expect(normalizeDirection("Inbound")).toBe("INBOUND");
    expect(normalizeDirection("outbound")).toBe("OUTBOUND");
    expect(normalizeDirection("OUTBOUND")).toBe("OUTBOUND");
    expect(normalizeDirection("Outbound")).toBe("OUTBOUND");
  });

  it("returns null for anything else", () => {
    expect(normalizeDirection("sideways")).toBeNull();
  });
});

describe("normalizeActivityKind", () => {
  it("accepts all five kinds, any casing", () => {
    expect(normalizeActivityKind("note")).toBe("note");
    expect(normalizeActivityKind("NOTE")).toBe("note");
    expect(normalizeActivityKind("Note")).toBe("note");
    expect(normalizeActivityKind("call")).toBe("call");
    expect(normalizeActivityKind("CALL")).toBe("call");
    expect(normalizeActivityKind("outreach")).toBe("outreach");
    expect(normalizeActivityKind("OUTREACH")).toBe("outreach");
    expect(normalizeActivityKind("reply")).toBe("reply");
    expect(normalizeActivityKind("REPLY")).toBe("reply");
    expect(normalizeActivityKind("status_change")).toBe("status_change");
    expect(normalizeActivityKind("STATUS_CHANGE")).toBe("status_change");
  });

  it("returns null for anything else", () => {
    expect(normalizeActivityKind("note!")).toBeNull();
  });
});

describe("requireNormalized", () => {
  it("returns the canonical value on a match", () => {
    expect(requireNormalized("LINKEDIN", normalizeSocialChannel, "channel", "linkedin, x")).toBe(
      "LINKEDIN",
    );
  });

  it("throws naming the field and the accepted values on a miss", () => {
    expect(() =>
      requireNormalized(
        "myspace",
        normalizeSocialChannel,
        "channel",
        "linkedin, x, instagram, facebook, other",
      ),
    ).toThrow(/channel must be one of linkedin, x, instagram, facebook, other.*myspace/i);
  });
});

describe("log_social_message contract (MCP + in-app agent both call this composition)", () => {
  it('accepts channel "LINKEDIN" + direction "outbound" and persists canonical values', async () => {
    await saveSocialMessage(USER, {
      contactId: "c1",
      channel: requireNormalized("LINKEDIN", normalizeSocialChannel, "channel", "linkedin, x"),
      direction: requireNormalized("outbound", normalizeDirection, "direction", "inbound, outbound"),
      body: "hello",
    });
    expect(contactSocialMessageCreate).toHaveBeenCalledTimes(1);
    const data = contactSocialMessageCreate.mock.calls[0][0].data as {
      channel: string;
      direction: string;
    };
    expect(data.channel).toBe("LINKEDIN");
    expect(data.direction).toBe("OUTBOUND");
  });

  it('accepts "twitter" and "X" as the same X channel alias', async () => {
    await saveSocialMessage(USER, {
      contactId: "c1",
      channel: requireNormalized("twitter", normalizeSocialChannel, "channel", "linkedin, x"),
      direction: "OUTBOUND",
      body: "hi",
    });
    expect(
      (contactSocialMessageCreate.mock.calls[0][0].data as { channel: string }).channel,
    ).toBe("X");

    contactSocialMessageCreate.mockClear();
    await saveSocialMessage(USER, {
      contactId: "c1",
      channel: requireNormalized("X", normalizeSocialChannel, "channel", "linkedin, x"),
      direction: "OUTBOUND",
      body: "hi",
    });
    expect(
      (contactSocialMessageCreate.mock.calls[0][0].data as { channel: string }).channel,
    ).toBe("X");
  });
});

describe("list_social_messages accepts an uppercase channel filter", () => {
  it("normalizes the filter before querying", async () => {
    await listSocialMessages(
      USER,
      "c1",
      requireNormalized("LINKEDIN", normalizeSocialChannel, "channel", "linkedin, x"),
    );
    expect(contactSocialMessageFindMany).toHaveBeenCalledTimes(1);
    const where = contactSocialMessageFindMany.mock.calls[0][0].where as { channel?: string };
    expect(where.channel).toBe("LINKEDIN");
  });
});

describe("add_activity accepts kind \"NOTE\"", () => {
  it("persists the canonical lowercase kind", async () => {
    await addActivity(USER, {
      contactId: "c1",
      kind: requireNormalized("NOTE", normalizeActivityKind, "kind", "note, call, outreach, reply, status_change"),
      body: "a note",
    });
    expect(activityCreate).toHaveBeenCalledTimes(1);
    const data = activityCreate.mock.calls[0][0].data as { kind: string };
    expect(data.kind).toBe("note");
  });
});
