// Telnyx number adapter. SECONDARY provider, and the least trusted one.
//
// LiveKit is the default place tenants buy numbers. Telnyx stays implemented as
// an alternative route to OUTBOUND dialing, which LiveKit DIDs cannot do today.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ EVERY CALL IN THIS FILE IS UNVERIFIED.                                    │
// │ Telnyx's docs were not reachable when this was written, so the endpoints, │
// │ query filters, request bodies and response shapes below come from         │
// │ secondary reports, not from the vendor. Nothing here has ever been run    │
// │ against the live API.                                                     │
// │                                                                           │
// │ Because of that this adapter is built to FAIL LOUDLY, never silently:     │
// │ every response is shape-checked and anything unexpected throws a          │
// │ TelephonyProviderError naming the exact field that was missing. It will   │
// │ never return an empty list that looks like "no numbers available" when    │
// │ the real answer is "we do not understand this response", and it will      │
// │ never report a purchase as successful without a carrier-side id.          │
// │                                                                           │
// │ Do not make Telnyx the default (TELEPHONY_PROVIDER) until a real account  │
// │ has exercised search -> purchase -> release end to end.                   │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Reported surface:
//   search    GET  https://api.telnyx.com/v2/available_phone_numbers
//   purchase  POST https://api.telnyx.com/v2/number_orders
//   inbound   SIP Connections (TELNYX_CONNECTION_ID is our ONE shared trunk)
//   outbound  Outbound Voice Profiles

import { fetchWithTimeout } from "@/lib/http";
import {
  TelephonyNotConfiguredError,
  TelephonyProviderError,
  dollarsToCents,
  isRecord,
  normalizeE164,
  str,
  type AvailableNumber,
  type NumberProvider,
  type NumberSearchQuery,
  type NumberStatus,
  type NumberType,
  type PurchaseRequest,
  type PurchasedNumber,
} from "@/lib/telephony/provider";

const API = "https://api.telnyx.com/v2";

function apiKey(): string {
  const k = process.env.TELNYX_API_KEY?.trim();
  if (!k) throw new TelephonyNotConfiguredError("Telnyx (TELNYX_API_KEY)");
  return k;
}

async function telnyx(method: "GET" | "POST" | "DELETE" | "PATCH", path: string, body?: unknown): Promise<unknown> {
  const res = await fetchWithTimeout(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      const parsed: unknown = JSON.parse(text);
      if (isRecord(parsed) && Array.isArray(parsed.errors)) {
        detail = parsed.errors
          .map((e) => (isRecord(e) ? `${str(e.title) ?? ""} ${str(e.detail) ?? ""}`.trim() : ""))
          .filter(Boolean)
          .join("; ")
          .slice(0, 400) || detail;
      }
    } catch {
      /* keep the raw slice */
    }
    throw new TelephonyProviderError(
      "TELNYX",
      `Telnyx ${method} ${path} failed (${res.status}): ${detail}`,
      res.status === 400 || res.status === 404 || res.status === 422 ? 400 : 502,
      detail,
    );
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new TelephonyProviderError("TELNYX", `Telnyx ${method} ${path} returned a non-JSON body`);
  }
}

/** UNVERIFIED shape guard. Telnyx v2 wraps everything in { data: ... }. If it
 *  does not, we throw rather than guess, so a shape drift shows up as a loud
 *  502 instead of an empty search result the operator reads as "sold out". */
function dataOf(path: string, raw: unknown): unknown {
  if (!isRecord(raw) || !("data" in raw)) {
    throw new TelephonyProviderError(
      "TELNYX",
      `Telnyx ${path} response had no "data" envelope. This adapter is UNVERIFIED against the live API, ` +
        `so an unexpected shape is treated as a failure rather than an empty result.`,
    );
  }
  return raw.data;
}

function featuresOf(v: unknown): string[] {
  if (!Array.isArray(v)) return ["voice"];
  const out: string[] = [];
  for (const f of v) {
    const name = isRecord(f) ? str(f.name) : str(f);
    if (name) out.push(name.toLowerCase());
  }
  return out.length ? out : ["voice"];
}

function numberTypeOf(v: unknown, fallback: NumberType): NumberType {
  const s = (str(v) ?? "").toLowerCase();
  if (s === "toll_free" || s === "toll-free" || s === "tollfree") return "toll_free";
  if (s === "mobile") return "mobile";
  if (s === "local" || s === "national") return "local";
  return fallback;
}

export const telnyxProvider: NumberProvider = {
  name: "TELNYX",

  wiresDispatchRuleAtPurchase: false,
  // The reason this adapter still exists: a carrier trunk is the only current
  // route to outbound dialing.
  supportsOutbound: true,

  isConfigured(): boolean {
    return Boolean(process.env.TELNYX_API_KEY?.trim());
  },

  sharedTrunkId(): string | null {
    // The one shared inbound SIP Connection, whose outbound destination is our
    // LiveKit project SIP URI. One per carrier, never one per tenant.
    return process.env.TELNYX_CONNECTION_ID?.trim() || null;
  },

  async search(query: NumberSearchQuery): Promise<AvailableNumber[]> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const params = new URLSearchParams();
    params.set("filter[country_code]", query.countryCode.trim().toUpperCase());
    params.set("filter[limit]", String(limit));
    params.set("filter[features][]", "voice");
    if (query.areaCode) params.set("filter[national_destination_code]", query.areaCode.replace(/\D/g, ""));
    if (query.contains) params.set("filter[phone_number][contains]", query.contains);
    if (query.numberType) {
      params.set("filter[phone_number_type]", query.numberType === "toll_free" ? "toll_free" : query.numberType);
    }

    const path = `/available_phone_numbers?${params}`;
    const data = dataOf(path, await telnyx("GET", path));
    if (!Array.isArray(data)) {
      throw new TelephonyProviderError("TELNYX", `Telnyx ${path} returned a non-array data envelope`);
    }

    const out: AvailableNumber[] = [];
    for (const entry of data) {
      if (!isRecord(entry)) continue;
      const e164 = normalizeE164(str(entry.phone_number));
      if (!e164) continue;
      const cost = isRecord(entry.cost_information) ? dollarsToCents(entry.cost_information.monthly_cost) : null;
      const region = isRecord(entry.region_information)
        ? str((entry.region_information as Record<string, unknown>).region_name)
        : Array.isArray(entry.region_information) && isRecord(entry.region_information[0])
          ? str((entry.region_information[0] as Record<string, unknown>).region_name)
          : undefined;
      out.push({
        e164,
        countryCode: query.countryCode.trim().toUpperCase(),
        areaCode: query.areaCode?.replace(/\D/g, "") || undefined,
        numberType: numberTypeOf(entry.phone_number_type, query.numberType ?? "local"),
        capabilities: featuresOf(entry.features),
        monthlyCostCents: cost,
        costEstimated: cost === null,
        // Telnyx does not report a reputation score on availability. Null is
        // "not rated", never "clean".
        spamScore: null,
        region,
        provider: "TELNYX",
      });
    }
    return out;
  },

  async purchase(req: PurchaseRequest): Promise<PurchasedNumber> {
    const e164 = normalizeE164(req.e164);
    if (!e164) throw new TelephonyProviderError("TELNYX", `Refusing to buy a number that is not E.164: ${req.e164}`, 400);

    const body: Record<string, unknown> = {
      phone_numbers: [{ phone_number: e164 }],
      // Pins the DID at our ONE shared inbound SIP Connection.
      connection_id: req.trunkId,
      customer_reference: req.reference,
    };
    if (req.bundleSid || req.identitySid || req.addressSid) {
      // Regulatory identity. In many countries this must be the END CUSTOMER's
      // identity, not ours, when a SaaS resells numbers.
      body.regulatory_requirements = [
        ...(req.bundleSid ? [{ field_value: req.bundleSid, requirement_id: "bundle" }] : []),
        ...(req.identitySid ? [{ field_value: req.identitySid, requirement_id: "identity" }] : []),
        ...(req.addressSid ? [{ field_value: req.addressSid, requirement_id: "address" }] : []),
      ];
    }

    const path = "/number_orders";
    const data = dataOf(path, await telnyx("POST", path, body));
    if (!isRecord(data)) throw new TelephonyProviderError("TELNYX", `Telnyx ${path} returned a non-object data envelope`);

    const ordered = Array.isArray(data.phone_numbers) ? data.phone_numbers.find(isRecord) : undefined;
    // The number order id is our only handle for reconciliation; the per-number
    // id is what release() needs. Missing either one means we may have bought a
    // number we cannot manage, which must never be reported as success.
    const providerNumberId = ordered ? str(ordered.id) ?? str(ordered.phone_number_id) : undefined;
    if (!providerNumberId) {
      throw new TelephonyProviderError(
        "TELNYX",
        `Telnyx ${path} returned no per-number id (UNVERIFIED shape). A number may have been ordered and cannot be ` +
          `released from here, check the Telnyx portal for order ${str(data.id) ?? "(unknown)"}.`,
      );
    }

    return {
      e164: normalizeE164(ordered ? str(ordered.phone_number) : undefined) ?? e164,
      providerNumberId,
      countryCode: req.countryCode.trim().toUpperCase(),
      numberType: req.numberType ?? "local",
      capabilities: ["voice"],
      monthlyCostCents: null,
      trunkId: req.trunkId ?? null,
    };
  },

  async release(providerNumberId: string): Promise<void> {
    await telnyx("DELETE", `/phone_numbers/${encodeURIComponent(providerNumberId)}`);
  },

  async getStatus(providerNumberId: string): Promise<NumberStatus> {
    const path = `/phone_numbers/${encodeURIComponent(providerNumberId)}`;
    const data = dataOf(path, await telnyx("GET", path));
    if (!isRecord(data)) throw new TelephonyProviderError("TELNYX", `Telnyx ${path} returned a non-object data envelope`);

    const raw = (str(data.status) ?? "").toLowerCase();
    const state: NumberStatus["state"] =
      raw === "active"
        ? "active"
        : raw === "pending" || raw === "purchase_pending" || raw === "port_pending"
          ? "pending"
          : raw === "deleted" || raw === "released"
            ? "released"
            : raw === "purchase_failed" || raw === "failed"
              ? "failed"
              : "unknown";

    return {
      e164: normalizeE164(str(data.phone_number)) ?? "",
      providerNumberId,
      state,
      trunkId: str(data.connection_id) ?? null,
      spamScore: null,
    };
  },

  async attachToTrunk(providerNumberId: string, trunkId: string): Promise<void> {
    await telnyx("PATCH", `/phone_numbers/${encodeURIComponent(providerNumberId)}`, { connection_id: trunkId });
  },
};
