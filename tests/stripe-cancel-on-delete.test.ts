import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cancelSubscriptionsForCustomer } from "@/lib/stripe";

const ORIGINAL = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL };
});

describe("cancelSubscriptionsForCustomer", () => {
  it("is a no-op for an empty customer id (never hits Stripe)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await cancelSubscriptionsForCustomer("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when a customer id is present but Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(cancelSubscriptionsForCustomer("cus_paid")).rejects.toThrow(
      /STRIPE_SECRET_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels live subscriptions and skips already-canceled ones", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/v1/subscriptions?") && method === "GET") {
        expect(u).toContain("customer=cus_abc");
        return jsonResponse({
          data: [
            { id: "sub_active", status: "active" },
            { id: "sub_trial", status: "trialing" },
            { id: "sub_due", status: "past_due" },
            { id: "sub_done", status: "canceled" },
            { id: "sub_ended", status: "incomplete_expired" },
          ],
        });
      }
      if (method === "DELETE" && u.includes("/v1/subscriptions/")) {
        return jsonResponse({ status: "canceled" });
      }
      return textResponse("unexpected", 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    await cancelSubscriptionsForCustomer("cus_abc");

    const deletes = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deletes).toHaveLength(3);
    expect(deletes.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("sub_active"),
      expect.stringContaining("sub_trial"),
      expect.stringContaining("sub_due"),
    ]);
  });

  it("treats a 404 on cancel as already gone (idempotent retry)", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return jsonResponse({ data: [{ id: "sub_gone", status: "active" }] });
      }
      return textResponse("No such subscription", 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(cancelSubscriptionsForCustomer("cus_abc")).resolves.toBeUndefined();
  });

  it("throws when listing subscriptions fails so the webhook can retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => textResponse("stripe down", 503)),
    );
    await expect(cancelSubscriptionsForCustomer("cus_abc")).rejects.toThrow(
      /list subscriptions failed \(503\)/,
    );
  });

  it("throws when cancel fails (non-404) so the user row is not deleted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "GET") {
          return jsonResponse({ data: [{ id: "sub_live", status: "active" }] });
        }
        return textResponse("card error", 402);
      }),
    );
    await expect(cancelSubscriptionsForCustomer("cus_abc")).rejects.toThrow(
      /cancel sub_live failed \(402\)/,
    );
  });
});

describe("Clerk account deletion cancels Stripe before dropping the user row", () => {
  const route = readFileSync(
    resolve(process.cwd(), "src/app/api/webhooks/clerk/route.ts"),
    "utf8",
  );

  it("loads stripeCustomerId and calls cancel before prisma.user.delete", () => {
    expect(route).toContain("cancelSubscriptionsForCustomer");
    expect(route).toContain("stripeCustomerId: true");

    const helperStart = route.indexOf("async function deleteAccountRow");
    expect(helperStart).toBeGreaterThan(-1);
    const helper = route.slice(helperStart, route.indexOf("export async function POST"));
    const cancelAt = helper.indexOf("cancelSubscriptionsForCustomer");
    const deleteAt = helper.indexOf("prisma.user.delete");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeLessThan(deleteAt);
  });

  it("routes both user.deleted and organization.deleted through the helper", () => {
    expect(route.match(/deleteAccountRow\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
