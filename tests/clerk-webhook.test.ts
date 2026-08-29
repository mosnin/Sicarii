// Clerk webhooks provision users and teams. Two regressions are expensive:
// user.updated / organization.updated must never reset plan or credits, and
// user.deleted / organization.deleted must delete pipelines/segments (no FK
// cascade) or Clerk will ack a partial wipe.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const upsertUser = vi.fn();
const findUnique = vi.fn();
const deleteManyPipeline = vi.fn();
const deleteManySegment = vi.fn();
const deleteUser = vi.fn();
const transaction = vi.fn();
const deleteManyMember = vi.fn();
const upsertMember = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: (...args: unknown[]) => upsertUser(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      delete: (...args: unknown[]) => deleteUser(...args),
    },
    pipeline: { deleteMany: (...args: unknown[]) => deleteManyPipeline(...args) },
    segment: { deleteMany: (...args: unknown[]) => deleteManySegment(...args) },
    teamMember: {
      deleteMany: (...args: unknown[]) => deleteManyMember(...args),
      upsert: (...args: unknown[]) => upsertMember(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, resetAt: Date.now() + 60_000 }),
}));

const verify = vi.fn();
vi.mock("svix", () => ({
  Webhook: class {
    constructor(_secret: string) {}
    verify(raw: string, _headers: unknown) {
      return verify(raw, _headers);
    }
  },
}));

import { POST } from "@/app/api/webhooks/clerk/route";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://scalar.test/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": "msg_1",
      "svix-timestamp": "1",
      "svix-signature": "v1,sig",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test");
    transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
    deleteManyPipeline.mockResolvedValue({ count: 1 });
    deleteManySegment.mockResolvedValue({ count: 1 });
    deleteUser.mockResolvedValue({});
    upsertUser.mockResolvedValue({});
    upsertMember.mockResolvedValue({});
    deleteManyMember.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects missing svix headers before verifying", async () => {
    const res = await POST(
      new Request("https://scalar.test/api/webhooks/clerk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature", async () => {
    verify.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await POST(req({ type: "user.created", data: { id: "user_1" } }));
    expect(res.status).toBe(401);
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("sets plan+credits only on create; user.updated never touches the meter", async () => {
    verify.mockImplementation(() => ({
      type: "user.updated",
      data: {
        id: "user_1",
        email_addresses: [{ email_address: "ada@acme.com" }],
        first_name: "Ada",
        last_name: "Lovelace",
        image_url: "https://img",
      },
    }));

    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(upsertUser).toHaveBeenCalledTimes(1);
    const arg = upsertUser.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.create).toMatchObject({ plan: "free", creditsRemaining: 200 });
    expect(arg.update).not.toHaveProperty("plan");
    expect(arg.update).not.toHaveProperty("creditsRemaining");
    expect(arg.update).toMatchObject({ email: "ada@acme.com", firstName: "Ada" });
  });

  it("organization.updated never resets the workspace plan", async () => {
    verify.mockImplementation(() => ({
      type: "organization.updated",
      data: { id: "org_1", name: "Acme", image_url: "https://img" },
    }));
    await POST(req({}));
    const arg = upsertUser.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.create).toMatchObject({ accountType: "workspace", plan: "free" });
    expect(arg.update).not.toHaveProperty("plan");
    expect(arg.update).not.toHaveProperty("creditsRemaining");
    expect(arg.update).toMatchObject({ firstName: "Acme" });
  });

  it("user.deleted deletes pipelines and segments then the user", async () => {
    verify.mockImplementation(() => ({ type: "user.deleted", data: { id: "clerk_u" } }));
    findUnique.mockResolvedValue({ id: "db_u" });

    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalled();
    expect(deleteManyPipeline).toHaveBeenCalledWith({ where: { userId: "db_u" } });
    expect(deleteManySegment).toHaveBeenCalledWith({ where: { userId: "db_u" } });
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: "db_u" } });
  });

  it("returns 500 so Clerk retries when user.deleted cleanup fails", async () => {
    verify.mockImplementation(() => ({ type: "user.deleted", data: { id: "clerk_u" } }));
    findUnique.mockResolvedValue({ id: "db_u" });
    transaction.mockRejectedValue(new Error("fk"));

    const res = await POST(req({}));
    expect(res.status).toBe(500);
  });

  it("organization.deleted only wipes workspace accounts", async () => {
    verify.mockImplementation(() => ({ type: "organization.deleted", data: { id: "org_1" } }));
    findUnique.mockResolvedValue({ id: "db_ws", accountType: "personal" });

    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("maps org:admin to admin and other roles to member", async () => {
    findUnique
      .mockResolvedValueOnce({ id: "ws_1" })
      .mockResolvedValueOnce({ id: "mem_1" })
      .mockResolvedValueOnce({ id: "ws_1" })
      .mockResolvedValueOnce({ id: "mem_1" });

    verify.mockImplementation(() => ({
      type: "organizationMembership.created",
      data: {
        id: "memship_1",
        role: "org:admin",
        organization: { id: "org_1" },
        public_user_data: { user_id: "user_1" },
      },
    }));
    await POST(req({}));
    expect(upsertMember).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: "admin" }),
        update: expect.objectContaining({ role: "admin" }),
      }),
    );

    verify.mockImplementation(() => ({
      type: "organizationMembership.updated",
      data: {
        id: "memship_1",
        role: "org:member",
        organization: { id: "org_1" },
        public_user_data: { user_id: "user_1" },
      },
    }));
    await POST(req({}));
    expect(upsertMember).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ role: "member" }),
      }),
    );
  });
});
