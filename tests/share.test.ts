// Teams share path (PR #42): the only code that touches two tenants.
//
// A share is a deep copy with dedup-merge, never a live link and never a move.
// These tests pin the access fence (membership + personal ownership) and the
// merge rules that would otherwise silently overwrite team data or leak
// personal message bodies.

import { describe, it, expect, vi, beforeEach } from "vitest";

const ACTOR = "user-personal";
const WORKSPACE = "ws-team";
const CONTACT_ID = "c-personal";
const ENTITY_ID = "e-personal";

vi.mock("@/lib/prisma", () => {
  const forbid = (name: string) =>
    vi.fn(() => {
      throw new Error(`SHARE BREACH: ${name} was called`);
    });
  return {
    prisma: {
      teamMember: { findUnique: vi.fn() },
      contact: { findUnique: vi.fn() },
      activity: { findMany: vi.fn() },
      fieldProvenance: { findMany: vi.fn() },
      $transaction: forbid("$transaction"),
    },
  };
});

import { prisma } from "@/lib/prisma";
import { shareContactToWorkspace } from "@/lib/share";
import { OpError } from "@/lib/op-error";

function personalContact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    userId: ACTOR,
    entityId: ENTITY_ID,
    name: "Jordan Lee",
    email: "jordan@acme.com",
    phone: "555-0100",
    company: "Acme Co",
    title: "VP Sales",
    website: "https://acme.com",
    linkedin: "https://linkedin.com/in/jordan",
    facebook: null,
    instagram: null,
    twitter: null,
    location: "NYC",
    imageUrl: null,
    status: "CONTACTED",
    source: "manual",
    tags: ["warm"],
    notes: "Met at a show",
    lastContactedAt: new Date("2026-07-01T00:00:00Z"),
    enrichment: null,
    entity: {
      id: ENTITY_ID,
      userId: ACTOR,
      name: "Acme Co",
      domain: "www.acme.com",
      website: "https://acme.com",
      logoUrl: null,
      phone: "555-1000",
      industry: "SaaS",
      location: "NYC",
      lat: null,
      lng: null,
      description: "Widgets",
      size: "50",
      status: "ENRICHED",
      tags: ["icp"],
      notes: null,
      enrichment: null,
    },
    emails: [
      {
        direction: "OUTBOUND",
        fromAddr: "me@example.com",
        toAddr: "jordan@acme.com",
        subject: "Intro",
        body: "Hello Jordan",
        savedAsContext: true,
        sentAt: new Date("2026-07-01T00:00:00Z"),
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    ],
    calls: [],
    socialMessages: [],
    ...overrides,
  };
}

function txMock(overrides: Record<string, unknown> = {}) {
  const createdContact = { id: "c-team" };
  const createdEntity = { id: "e-team" };
  return {
    entity: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      create: vi.fn().mockResolvedValue(createdEntity),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      create: vi.fn().mockResolvedValue(createdContact),
    },
    activity: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: "a-share" }),
    },
    contactEmail: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    contactCall: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    contactSocialMessage: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    fieldProvenance: { upsert: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

async function expectOpError(fn: () => Promise<unknown>, status: number) {
  await expect(fn()).rejects.toMatchObject({ name: "OpError", status } satisfies Partial<OpError>);
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.teamMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    workspaceId: WORKSPACE,
    userId: ACTOR,
    role: "member",
  });
  (prisma.contact.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(personalContact());
  (prisma.activity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    {
      kind: "note",
      body: "Personal note",
      channel: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
    },
  ]);
  (prisma.fieldProvenance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    {
      field: "email",
      source: "manual",
      confidence: 90,
      valueSnapshot: "jordan@acme.com",
      retrievedAt: new Date("2026-06-01T00:00:00Z"),
      verifiedAt: null,
      stale: false,
    },
  ]);
});

describe("shareContactToWorkspace access fence", () => {
  it("refuses a non-member before any copy starts", async () => {
    (prisma.teamMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expectOpError(
      () =>
        shareContactToWorkspace({
          actorUserId: ACTOR,
          workspaceId: WORKSPACE,
          contactId: CONTACT_ID,
        }),
      403,
    );
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a contact the actor does not own and never starts the copy", async () => {
    (prisma.contact.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      personalContact({ userId: "someone-else" }),
    );

    await expectOpError(
      () =>
        shareContactToWorkspace({
          actorUserId: ACTOR,
          workspaceId: WORKSPACE,
          contactId: CONTACT_ID,
        }),
      404,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a missing contact with 404", async () => {
    (prisma.contact.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expectOpError(
      () =>
        shareContactToWorkspace({
          actorUserId: ACTOR,
          workspaceId: WORKSPACE,
          contactId: "nope",
        }),
      404,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("shareContactToWorkspace copy + merge", () => {
  it("copies a new lead into the workspace, including message bodies by default", async () => {
    const tx = txMock();
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await shareContactToWorkspace({
      actorUserId: ACTOR,
      actorName: "Ada",
      workspaceId: WORKSPACE,
      contactId: CONTACT_ID,
    });

    expect(result).toMatchObject({
      contactId: "c-team",
      entityId: "e-team",
      merged: false,
      copied: { activities: 1, emails: 1, calls: 0, socialMessages: 0 },
    });

    expect(tx.entity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: WORKSPACE,
          domain: { equals: "acme.com", mode: "insensitive" },
        }),
      }),
    );
    expect(tx.entity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: WORKSPACE,
          source: "shared",
          sharedFromId: ENTITY_ID,
        }),
      }),
    );
    expect(tx.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: WORKSPACE,
          entityId: "e-team",
          source: "shared",
          sharedFromId: CONTACT_ID,
        }),
      }),
    );
    expect(tx.contactEmail.createMany).toHaveBeenCalled();
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: WORKSPACE,
          contactId: "c-team",
          actorId: ACTOR,
          body: expect.stringContaining("Shared into the team CRM"),
        }),
      }),
    );
  });

  it("skips email/call/social bodies when includeMessages is false", async () => {
    const tx = txMock();
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await shareContactToWorkspace({
      actorUserId: ACTOR,
      workspaceId: WORKSPACE,
      contactId: CONTACT_ID,
      includeMessages: false,
    });

    expect(result.copied.emails).toBe(0);
    expect(tx.contactEmail.createMany).not.toHaveBeenCalled();
    expect(tx.contactCall.createMany).not.toHaveBeenCalled();
    expect(tx.contactSocialMessage.createMany).not.toHaveBeenCalled();
    expect(tx.activity.createMany).toHaveBeenCalled();
  });

  it("merges on email without overwriting the team's filled columns, and unions tags", async () => {
    const existing = {
      id: "c-existing",
      name: "Team-held name",
      email: "jordan@acme.com",
      phone: "",
      company: "Acme Co",
      title: null,
      website: null,
      linkedin: null,
      facebook: null,
      instagram: null,
      twitter: null,
      location: null,
      imageUrl: null,
      entityId: null,
      tags: ["team"],
    };
    const tx = txMock({
      contact: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn(),
        create: vi.fn(),
      },
    });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await shareContactToWorkspace({
      actorUserId: ACTOR,
      workspaceId: WORKSPACE,
      contactId: CONTACT_ID,
    });

    expect(result.merged).toBe(true);
    expect(result.contactId).toBe("c-existing");
    expect(tx.contact.create).not.toHaveBeenCalled();

    const patch = (tx.contact.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(patch.name).toBeUndefined();
    expect(patch.phone).toBe("555-0100");
    expect(patch.title).toBe("VP Sales");
    expect(patch.entityId).toBe("e-team");
    expect(patch.tags).toEqual(expect.arrayContaining(["team", "warm"]));
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: expect.stringContaining("Merged from a shared personal contact"),
        }),
      }),
    );
  });

  it("dedupes a no-email lead by name + company", async () => {
    (prisma.contact.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      personalContact({ email: null }),
    );
    const existing = {
      id: "c-name-dup",
      name: "Jordan Lee",
      email: null,
      phone: "already-set",
      company: "Acme Co",
      title: "Existing title",
      website: null,
      linkedin: null,
      facebook: null,
      instagram: null,
      twitter: null,
      location: null,
      imageUrl: null,
      entityId: "e-existing",
      tags: [],
    };
    const tx = txMock({
      contact: {
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          if ("email" in where) return null;
          return existing;
        }),
        update: vi.fn(),
        create: vi.fn(),
      },
    });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await shareContactToWorkspace({
      actorUserId: ACTOR,
      workspaceId: WORKSPACE,
      contactId: CONTACT_ID,
    });

    expect(result.merged).toBe(true);
    expect(result.contactId).toBe("c-name-dup");
    const nameLookup = (tx.contact.findFirst as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: [{ where: { name?: unknown } }]) => call[0].where.name,
    );
    expect(nameLookup?.[0].where).toMatchObject({
      userId: WORKSPACE,
      name: { equals: "Jordan Lee", mode: "insensitive" },
      company: { equals: "Acme Co", mode: "insensitive" },
    });
    const patch = (tx.contact.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(patch.phone).toBeUndefined();
    expect(patch.title).toBeUndefined();
    expect(patch.entityId).toBeUndefined();
  });

  it("fills empty team entity columns from the shared company and does not overwrite filled ones", async () => {
    const existingEntity = {
      id: "e-existing",
      name: "Acme Co",
      domain: "acme.com",
      website: "https://team-held.example",
      phone: "",
      industry: "SaaS",
      location: null,
      description: null,
      size: null,
      logoUrl: null,
    };
    const tx = txMock({
      entity: {
        findFirst: vi.fn().mockResolvedValue(existingEntity),
        update: vi.fn(),
        create: vi.fn(),
      },
    });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await shareContactToWorkspace({
      actorUserId: ACTOR,
      workspaceId: WORKSPACE,
      contactId: CONTACT_ID,
    });

    expect(result.entityId).toBe("e-existing");
    expect(tx.entity.create).not.toHaveBeenCalled();
    const patch = (tx.entity.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(patch.website).toBeUndefined();
    expect(patch.phone).toBe("555-1000");
    expect(patch.location).toBe("NYC");
    expect(patch.description).toBe("Widgets");
    expect(patch.industry).toBeUndefined();
  });
});
