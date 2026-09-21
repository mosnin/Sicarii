// Registrar adapters: env-driven selection, price normalisation, the GoDaddy
// purchase handshake (agreements -> purchase with consent) and Porkbun's
// echo-the-quoted-cost rule. fetch is stubbed; nothing leaves the process.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/http", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from "@/lib/http";
import { configuredRegistrar, godaddy, porkbun, baselineDnsRecords, RegistrarError } from "@/lib/mail/registrar";

const fetchMock = fetchWithTimeout as unknown as ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
}

const ENV_KEYS = ["DOMAIN_REGISTRAR", "GODADDY_PAT", "GODADDY_API_KEY", "GODADDY_API_SECRET", "PORKBUN_API_KEY", "PORKBUN_SECRET_API_KEY", "GODADDY_ENV"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  fetchMock.mockReset();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("configuredRegistrar", () => {
  it("is null with no credentials", () => {
    expect(configuredRegistrar()).toBeNull();
  });
  it("prefers GoDaddy when both are configured, unless DOMAIN_REGISTRAR says otherwise", () => {
    process.env.GODADDY_PAT = "pat";
    process.env.PORKBUN_API_KEY = "k";
    process.env.PORKBUN_SECRET_API_KEY = "s";
    expect(configuredRegistrar()?.id).toBe("GODADDY");
    process.env.DOMAIN_REGISTRAR = "porkbun";
    expect(configuredRegistrar()?.id).toBe("PORKBUN");
  });
  it("returns null when the pinned registrar lacks credentials", () => {
    process.env.DOMAIN_REGISTRAR = "godaddy";
    process.env.PORKBUN_API_KEY = "k";
    process.env.PORKBUN_SECRET_API_KEY = "s";
    expect(configuredRegistrar()).toBeNull();
  });
});

describe("godaddy", () => {
  beforeEach(() => {
    process.env.GODADDY_PAT = "pat";
  });

  it("converts micro-unit prices to cents and reports availability", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { available: true, price: 11990000, currency: "USD" }));
    const r = await godaddy.checkAvailability("try-acme.com");
    expect(r).toEqual({ domain: "try-acme.com", available: true, priceUsdCents: 1199, premium: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/api\.godaddy\.com\/v1\/domains\/available\?domain=try-acme\.com/);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer pat" });
  });

  it("uses the OTE host when GODADDY_ENV=ote and sso-key auth for legacy keys", async () => {
    delete process.env.GODADDY_PAT;
    process.env.GODADDY_API_KEY = "k";
    process.env.GODADDY_API_SECRET = "s";
    process.env.GODADDY_ENV = "ote";
    fetchMock.mockResolvedValueOnce(respond(200, { available: false }));
    await godaddy.checkAvailability("x.com");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.ote-godaddy\.com\//);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "sso-key k:s" });
  });

  it("fetches agreements then purchases with consent, contacts and an idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, [{ agreementKey: "DNRA" }, { agreementKey: "DNPA" }]));
    fetchMock.mockResolvedValueOnce(respond(200, { orderId: 4242 }));
    const contact = {
      firstName: "Sam",
      lastName: "Lee",
      email: "sam@acme.com",
      phone: "+1.5555550123",
      address1: "1 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    };
    const r = await godaddy.purchase("try-acme.com", contact, { years: 1, privacy: true, idempotencyKey: "order-1" });
    expect(r).toEqual({ orderRef: "4242", status: "PENDING" });
    const [, purchaseInit] = fetchMock.mock.calls[1];
    const body = JSON.parse((purchaseInit as RequestInit).body as string);
    expect(body.consent.agreementKeys).toEqual(["DNRA", "DNPA"]);
    expect(body.contactRegistrant.nameFirst).toBe("Sam");
    expect(body.contactRegistrant.addressMailing.country).toBe("US");
    expect(body.privacy).toBe(true);
    expect((purchaseInit as RequestInit).headers).toMatchObject({ "Idempotency-Key": "order-1" });
  });

  it("groups DNS records per type+name so one PUT replaces each pair", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    await godaddy.setRecords("try-acme.com", [
      { type: "TXT", name: "@", data: "v=spf1 ~all" },
      { type: "TXT", name: "_dmarc", data: "v=DMARC1; p=none" },
      { type: "MX", name: "@", data: "smtp.google.com", priority: 1 },
      { type: "MX", name: "@", data: "alt.google.com", priority: 5 },
    ]);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(3);
    expect(urls.some((u) => u.endsWith("/records/MX/%40"))).toBe(true);
    const mxCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/records/MX/%40"))!;
    expect(JSON.parse((mxCall[1] as RequestInit).body as string)).toHaveLength(2);
  });

  it("surfaces GoDaddy's error code and message", async () => {
    fetchMock.mockResolvedValue(respond(403, { code: "ACCESS_DENIED", message: "Authenticated user is not allowed access" }));
    await expect(godaddy.checkAvailability("x.com")).rejects.toMatchObject({ name: "RegistrarError", status: 403, registrar: "GODADDY" });
    await expect(godaddy.checkAvailability("x.com")).rejects.toThrow(/ACCESS_DENIED/);
  });
});

describe("porkbun", () => {
  beforeEach(() => {
    process.env.PORKBUN_API_KEY = "k";
    process.env.PORKBUN_SECRET_API_KEY = "s";
  });

  it("parses dollar prices to cents", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { status: "SUCCESS", response: { avail: "yes", price: "9.73", premium: "no" } }));
    const r = await porkbun.checkAvailability("try-acme.com");
    expect(r).toEqual({ domain: "try-acme.com", available: true, priceUsdCents: 973, premium: false });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ apikey: "k", secretapikey: "s" });
  });

  it("refuses to buy an unavailable or premium domain and echoes the quoted cost otherwise", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { status: "SUCCESS", response: { avail: "no" } }));
    await expect(porkbun.purchase("taken.com", {} as never, { years: 1, privacy: true, idempotencyKey: "o" })).rejects.toBeInstanceOf(RegistrarError);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(respond(200, { status: "SUCCESS", response: { avail: "yes", price: "9.73", premium: "no" } }));
    fetchMock.mockResolvedValueOnce(respond(200, { status: "SUCCESS", response: { orderId: 77, expiration: "2027-09-21 00:00:00" } }));
    const r = await porkbun.purchase("try-acme.com", {} as never, { years: 1, privacy: true, idempotencyKey: "o" });
    expect(r.orderRef).toBe("77");
    expect(r.status).toBe("COMPLETED");
    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toMatchObject({ cost: 973, agreeToTerms: "yes", whoisPrivacy: true, years: 1, dryRun: false });
  });

  it("treats status != SUCCESS as an error even on HTTP 200", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { status: "ERROR", message: "Invalid API key" }));
    await expect(porkbun.checkAvailability("x.com")).rejects.toThrow(/Invalid API key/);
  });

  it("strips the domain suffix from record names and maps @ back", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, {
        status: "SUCCESS",
        records: [
          { type: "TXT", name: "try-acme.com", content: "v=spf1 ~all", ttl: "600" },
          { type: "TXT", name: "_dmarc.try-acme.com", content: "v=DMARC1; p=none", ttl: "600" },
          { type: "NS", name: "try-acme.com", content: "ns1.porkbun.com" },
        ],
      }),
    );
    const recs = await porkbun.getRecords("try-acme.com");
    expect(recs).toEqual([
      { type: "TXT", name: "@", data: "v=spf1 ~all", ttl: 600, priority: undefined },
      { type: "TXT", name: "_dmarc", data: "v=DMARC1; p=none", ttl: 600, priority: undefined },
    ]);
  });
});

describe("baselineDnsRecords", () => {
  it("publishes a monitor-only DMARC policy", () => {
    const [r] = baselineDnsRecords("try-acme.com");
    expect(r).toMatchObject({ type: "TXT", name: "_dmarc" });
    expect(r.data).toMatch(/^v=DMARC1; p=none; rua=mailto:dmarc@try-acme\.com/);
  });
});
