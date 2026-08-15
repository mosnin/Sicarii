import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpError } from "@/lib/crm-operations";

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { prisma } from "@/lib/prisma";
import {
  createNativeWorkspace,
  deleteNativeWorkspace,
  isNativeWorkspace,
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
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.teamMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: "ws-1", userId: "user-1", role: "admin" }),
      }),
    );
  });

  it("platform admins have an unlimited quota", async () => {
    (prisma.teamMember.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(99);
    const quota = await workspaceQuota({ ...actor, role: "admin" });
    expect(quota.unlimited).toBe(true);
    expect(quota.allowed).toBe(Number.POSITIVE_INFINITY);
  });

  it("refuses to delete a Clerk-org workspace via the native path", async () => {
    (prisma.teamMember.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: "admin",
      workspace: { accountType: "workspace", clerkId: "org_abc" },
    });
    await expect(deleteNativeWorkspace(actor, "ws-1")).rejects.toBeInstanceOf(OpError);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
