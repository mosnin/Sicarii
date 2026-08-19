import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpError } from "@/lib/crm-operations";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
    $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
    teamMember: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { prisma };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  createNativeWorkspace,
  deleteNativeWorkspace,
  isNativeWorkspace,
  readWorkspaceCookie,
  renameWorkspace,
  resolveCookieWorkspace,
  workspaceQuota,
} from "@/lib/workspace";

const actor = {
  id: "user-1",
  clerkId: "user_abc",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  imageUrl: null,
  role: "member",
  accountType: "user",
  productContext: null,
  agentMailApiKey: null,
  agentPhoneApiKey: null,
  taskWebhookUrl: null,
  autoRadar: true,
  plan: "free",
  creditsRemaining: 200,
  creditsResetAt: null,
  stripeCustomerId: null,
  lastSeenAt: null,
  voiceEnabled: false,
  voiceInboundSecret: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const WS_ID = "22222222-2222-4222-8222-222222222222";

describe("native workspaces", () => {
  beforeEach(() => vi.clearAllMocks());

  it("identifies Scalar-native clerkIds", () => {
    expect(isNativeWorkspace("ws_123")).toBe(true);
    expect(isNativeWorkspace("org_abc")).toBe(false);
    expect(isNativeWorkspace("user_abc")).toBe(false);
  });

  it("blocks a free plan from creating a workspace", async () => {
    (prisma.teamMember.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    await expect(createNativeWorkspace(actor, "Second biz")).rejects.toMatchObject({
      name: "OpError",
      status: 402,
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("lets a paid plan create a workspace under the cap", async () => {
    (prisma.teamMember.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.user.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ws-1",
      clerkId: "ws_x",
      firstName: "Acme",
      accountType: "workspace",
    });
    (prisma.teamMember.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const paid = { ...actor, plan: "starter" };
    const ws = await createNativeWorkspace(paid, "Acme");
    expect(ws.id).toBe("ws-1");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.teamMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: "ws-1", userId: "user-1", role: "admin" }),
      }),
    );
  });

  it("re-checks quota inside the transaction so a parallel create cannot sneak past the cap", async () => {
    (prisma.teamMember.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    const paid = { ...actor, plan: "starter" };
    await expect(createNativeWorkspace(paid, "Over")).rejects.toMatchObject({
      name: "OpError",
      status: 402,
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("platform admins have an unlimited quota", async () => {
    (prisma.teamMember.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(99);
    const quota = await workspaceQuota({ ...actor, role: "admin" });
    expect(quota.unlimited).toBe(true);
    expect(quota.allowed).toBe(Number.POSITIVE_INFINITY);
    expect(prisma.teamMember.count).toHaveBeenCalledWith({
      where: { userId: actor.id, workspace: { accountType: "workspace" } },
    });
  });

  it("refuses to delete a Clerk-org workspace via the native path", async () => {
    (prisma.teamMember.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: "admin",
      workspace: { accountType: "workspace", clerkId: "org_abc" },
    });
    await expect(deleteNativeWorkspace(actor, WS_ID)).rejects.toBeInstanceOf(OpError);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("treats a junk workspace id as not found without hitting Prisma", async () => {
    await expect(deleteNativeWorkspace(actor, "not-a-uuid")).rejects.toMatchObject({
      status: 404,
    });
    await expect(renameWorkspace(actor, "not-a-uuid", "New")).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.teamMember.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a rename over 80 characters", async () => {
    await expect(renameWorkspace(actor, WS_ID, "x".repeat(81))).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("workspace cookie", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores a tampered non-uuid cookie", async () => {
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => ({ value: "not-a-uuid; DROP TABLE users" }),
    });
    expect(await readWorkspaceCookie()).toBeNull();
  });

  it("accepts a uuid cookie value", async () => {
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => ({ value: WS_ID }),
    });
    expect(await readWorkspaceCookie()).toBe(WS_ID);
  });

  it("refuses a cookie pointing at the actor's own id", async () => {
    expect(await resolveCookieWorkspace(actor, actor.id)).toBeNull();
    expect(prisma.teamMember.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a non-uuid workspace id before querying", async () => {
    expect(await resolveCookieWorkspace(actor, "nope")).toBeNull();
    expect(prisma.teamMember.findUnique).not.toHaveBeenCalled();
  });
});
