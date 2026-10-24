// shareContactToWorkspace is the only path that touches two tenants. A
// non-member must get 403, a stolen/missing personal contact must get 404, and
// neither may enter the copy transaction. A merge must fill only empty team
// columns and must not copy message bodies when includeMessages is false.

import { describe, it, expect, vi, beforeEach } from "vitest";

const teamMemberFindUnique = vi.fn();
const contactFindUnique = vi.fn();
const activityFindMany = vi.fn();
const provenanceFindMany = vi.fn();
const transaction = vi.fn();

const forbid = (name: string) =>
  vi.fn(() => {
    throw new Error(`ISOLATION BREACH: ${name} ran on a denied share`);
  });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamMember: { findUnique: (...args: unknown[]) => teamMemberFindUnique(...args) },
    contact: { findUnique: (...args: unknown[]) => contactFindUnique(...args) },
    activity: { findMany: (...args: unknown[]) => activityFindMany(...args) },
    fieldProvenance: { findMany: (...args: unknown[]) => provenanceFindMany(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import { shareContactToWorkspace } from "@/lib/share";
import { OpError } from "@/lib/crm-operations";

const ACTOR = "personal-1";
const WORKSPACE = "ws-1";

beforeEach(() => {
  vi.clearAllMocks();
  activityFindMany.mockResolvedValue([]);
  provenanceFindMany.mockResolvedValue([]);
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
});

describe("shareContactToWorkspace — access", () => {
  it("rejects a non-member with 403 and never reads the contact or writes", async () => {
    teamMemberFindUnique.mockResolvedValue(null);

    await expect(
      shareContactToWorkspace({
        actorUserId: ACTOR,
        workspaceId: WORKSPACE,
        contactId: "c-stolen",
      }),
    ).rejects.toMatchObject({ name: "OpError", status: 403, message: "You are not a member of that team." });

    expect(contactFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a contact the actor does not own with 404 and never writes", async () => {
    teamMemberFindUnique.mockResolvedValue({ workspaceId: WORKSPACE, userId: ACTOR });
    contactFindUnique.mockResolvedValue({
      id: "c1",
      userId: "someone-else",
      entity: null,
      emails: [],
      calls: [],
      socialMessages: [],
    });

    await expect(
      shareContactToWorkspace({
        actorUserId: ACTOR,
        workspaceId: WORKSPACE,
        contactId: "c1",
      }),
    ).rejects.toMatchObject({ name: "OpError", status: 404 });

    expect(transaction).not.toHaveBeenCalled();
    expect(activityFindMany).not.toHaveBeenCalled();
  });

  it("rejects a missing contact with 404", async () => {
    teamMemberFindUnique.mockResolvedValue({ workspaceId: WORKSPACE, userId: ACTOR });
    contactFindUnique.mockResolvedValue(null);

    await expect(
      shareContactToWorkspace({
        actorUserId: ACTOR,
        workspaceId: WORKSPACE,
        contactId: "nope",
      }),
    ).rejects.toBeInstanceOf(OpError);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("shareContactToWorkspace — merge and messages", () => {
  function ownedContact(over: Record<string, unknown> = {}) {
    return {
      id: "c1",
      userId: ACTOR,
      name: "Ada Lovelace",
      email: "ada@analytical.engine",
      phone: "+1-555-0100",
      company: "Analytical Engine",
      title: "Mathematician",
      website: null,
      linkedin: "https://linkedin.com/in/ada",
      facebook: null,
      instagram: null,
      twitter: null,
      location: null,
      imageUrl: null,
      status: "ENRICHED",
      tags: ["vip"],
      notes: "source notes",
      lastContactedAt: null,
      enrichment: null,
      entity: null,
      emails: [
        {
          direction: "outbound",
          fromAddr: "me@x.com",
          toAddr: "ada@analytical.engine",
          subject: "hello",
          body: "secret body",
          savedAsContext: false,
          sentAt: new Date("2026-01-01"),
          createdAt: new Date("2026-01-01"),
        },
      ],
      calls: [],
      socialMessages: [],
      ...over,
    };
  }

  it("fills only empty team fields and unions tags on email dedup", async () => {
    teamMemberFindUnique.mockResolvedValue({ workspaceId: WORKSPACE, userId: ACTOR });
    contactFindUnique.mockResolvedValue(ownedContact());

    const existing = {
      id: "team-c",
      name: "Ada L",
      email: "ada@analytical.engine",
      phone: "KEEP-TEAM-PHONE",
      company: "Analytical Engine",
      title: null,
      website: null,
      linkedin: null,
      facebook: null,
      instagram: null,
      twitter: null,
      location: null,
      imageUrl: null,
      tags: ["existing"],
      entityId: null,
    };
    const contactUpdate = vi.fn().mockResolvedValue(existing);
    const emailCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const activityCreate = vi.fn().mockResolvedValue({});
    const activityCreateMany = vi.fn().mockResolvedValue({ count: 0 });
    const provenanceUpsert = vi.fn();

    transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
      fn({
        entity: { findFirst: vi.fn() },
        contact: {
          findFirst: vi.fn().mockResolvedValue(existing),
          update: contactUpdate,
          create: forbid("contact.create"),
        },
        activity: { createMany: activityCreateMany, create: activityCreate },
        contactEmail: { createMany: emailCreateMany },
        contactCall: { createMany: forbid("contactCall.createMany") },
        contactSocialMessage: { createMany: forbid("contactSocialMessage.createMany") },
        fieldProvenance: { upsert: provenanceUpsert },
      }),
    );

    const result = await shareContactToWorkspace({
      actorUserId: ACTOR,
      workspaceId: WORKSPACE,
      contactId: "c1",
    });

    expect(result.merged).toBe(true);
    expect(result.contactId).toBe("team-c");
    const patch = contactUpdate.mock.calls[0][0].data;
    expect(patch.phone).toBeUndefined();
    expect(patch.name).toBeUndefined();
    expect(patch.title).toBe("Mathematician");
    expect(patch.linkedin).toBe("https://linkedin.com/in/ada");
    expect(patch.tags).toEqual(["existing", "vip"]);
  });

  it("skips email/call/social bodies when includeMessages is false", async () => {
    teamMemberFindUnique.mockResolvedValue({ workspaceId: WORKSPACE, userId: ACTOR });
    contactFindUnique.mockResolvedValue(ownedContact());

    const emailCreateMany = forbid("contactEmail.createMany");
    const callCreateMany = forbid("contactCall.createMany");
    const socialCreateMany = forbid("contactSocialMessage.createMany");
    const activityCreate = vi.fn().mockResolvedValue({});

    transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
      fn({
        entity: { findFirst: vi.fn() },
        contact: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "new-c" }),
        },
        activity: { createMany: vi.fn().mockResolvedValue({ count: 0 }), create: activityCreate },
        contactEmail: { createMany: emailCreateMany },
        contactCall: { createMany: callCreateMany },
        contactSocialMessage: { createMany: socialCreateMany },
        fieldProvenance: { upsert: vi.fn() },
      }),
    );

    const result = await shareContactToWorkspace({
      actorUserId: ACTOR,
      workspaceId: WORKSPACE,
      contactId: "c1",
      includeMessages: false,
    });

    expect(result.merged).toBe(false);
    expect(result.copied).toEqual({
      activities: 0,
      emails: 0,
      calls: 0,
      socialMessages: 0,
    });
    expect(emailCreateMany).not.toHaveBeenCalled();
  });
});
