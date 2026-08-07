// Twilio number adapter. SECONDARY provider.
//
// LiveKit is the default place tenants buy numbers (US, inbound). Twilio stays
// implemented because a carrier trunk is the only current route to OUTBOUND
// dialing, and because it is the fallback the moment LiveKit's US-only,
// inbound-only constraint stops being acceptable.
//
// VERIFICATION STATUS
//   VERIFIED against Twilio's official OpenAPI spec:
//     - GET  /2010-04-01/Accounts/{sid}/AvailablePhoneNumbers/{country}/Local.json
//     - POST /2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json
//       (PhoneNumber + TrunkSid. "If a trunk_sid is present, we ignore all of
//        the voice urls and voice applications", which is exactly how the DID
//        gets pointed at LiveKit, and why we never set VoiceUrl here.)
//     - DELETE / GET /2010-04-01/Accounts/{sid}/IncomingPhoneNumbers/{sid}.json
//     - POST /v1/Trunks, /v1/Trunks/{sid}/OriginationUrls, /v1/Trunks/{sid}/PhoneNumbers
//   UNVERIFIED, guarded (see the call sites, each is marked and non-fatal):
//     - the Pricing API monthly cost lookup. A failure degrades to a labelled
//       estimate (costEstimated: true), never to a wrong-looking exact price.
//     - Twilio does not return a spam/reputation score on number search, so
//       spamScore is null here and the UI says "not rated" rather than "clean".
//
// TRUNK MODEL: one shared elastic SIP trunk for the whole product, not one per
// tenant. A trunk authenticates the CARRIER, not the tenant, so a per-tenant
// trunk adds no isolation and does not scale. Tenant isolation lives in the
// per-DID LiveKit dispatch rule (see src/lib/telephony/provisioning.ts).

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

const API = "https://api.twilio.com";
const TRUNKING_API = "https://trunking.twilio.com";
const PRICING_API = "https://pricing.twilio.com";

// Fallback monthly cost when the (unverified) Pricing API cannot be reached.
// Twilio US local list price at the time of writing. Always surfaced with
// costEstimated: true so nobody mistakes it for a quote.
const FALLBACK_MONTHLY_CENTS: Record<string, number> = {
  local: 115,
  toll_free: 200,
  mobile: 300,
};

function creds(): { sid: string; token: string } {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) throw new TelephonyNotConfiguredError("Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  return { sid, token };
}

function authHeader(sid: string, token: string): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

async function twilio(
  method: "GET" | "POST" | "DELETE",
  base: string,
  path: string,
  form?: Record<string, string | undefined>,
): Promise<unknown> {
  const { sid, token } = creds();
  const body = form
    ? new URLSearchParams(
        Object.entries(form).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
      ).toString()
    : undefined;

  const res = await fetchWithTimeout(`${base}${path}`, {
    method,
    headers: {
      Authorization: authHeader(sid, token),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    // Twilio errors are JSON: { code, message, more_info, status }.
    let detail = text.slice(0, 400);
    try {
      const parsed: unknown = JSON.parse(text);
      if (isRecord(parsed)) detail = `${str(parsed.message) ?? detail} (code ${String(parsed.code ?? res.status)})`;
    } catch {
      /* keep the raw slice */
    }
    throw new TelephonyProviderError(
      "TWILIO",
      `Twilio ${method} ${path} failed (${res.status}): ${detail}`,
      res.status === 400 || res.status === 404 || res.status === 409 ? 400 : 502,
      detail,
    );
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new TelephonyProviderError("TWILIO", `Twilio ${method} ${path} returned a non-JSON body`);
  }
}

function resourcePath(numberType: NumberType): "Local" | "TollFree" | "Mobile" {
  return numberType === "toll_free" ? "TollFree" : numberType === "mobile" ? "Mobile" : "Local";
}

// UNVERIFIED: the Pricing API response shape is not in our verified set. Every
// read is shape-checked and the whole lookup is best effort: on any failure we
// return null and the caller falls back to a labelled estimate.
async function monthlyCostCents(country: string, numberType: NumberType): Promise<number | null> {
  try {
    const raw = await twilio("GET", PRICING_API, `/v1/PhoneNumbers/Countries/${encodeURIComponent(country)}`);
    if (!isRecord(raw) || !Array.isArray(raw.phone_number_prices)) return null;
    const want = numberType === "toll_free" ? "toll free" : numberType;
    for (const entry of raw.phone_number_prices) {
      if (!isRecord(entry)) continue;
      const kind = (str(entry.number_type) ?? "").toLowerCase().replace(/_/g, " ");
      if (kind !== want) continue;
      const cents = dollarsToCents(entry.current_price ?? entry.base_price);
      if (cents !== null) return cents;
    }
    return null;
  } catch (e) {
    console.warn("[telephony/twilio] pricing lookup failed, falling back to an estimate", e);
    return null;
  }
}

function capabilitiesOf(v: unknown): string[] {
  if (!isRecord(v)) return ["voice"];
  const out: string[] = [];
  if (v.voice === true) out.push("voice");
  if (v.SMS === true || v.sms === true) out.push("sms");
  if (v.MMS === true || v.mms === true) out.push("mms");
  return out.length ? out : ["voice"];
}

export const twilioProvider: NumberProvider = {
  name: "TWILIO",

  // Twilio has no notion of a LiveKit dispatch rule, so provisioning buys first
  // and wires second, with a release-on-failure rollback.
  wiresDispatchRuleAtPurchase: false,
  // The reason this adapter still exists: a carrier trunk is the only current
  // route to outbound dialing.
  supportsOutbound: true,

  isConfigured(): boolean {
    return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
  },

  sharedTrunkId(): string | null {
    return process.env.TWILIO_TRUNK_SID?.trim() || null;
  },

  async search(query: NumberSearchQuery): Promise<AvailableNumber[]> {
    const { sid } = creds();
    const country = query.countryCode.trim().toUpperCase();
    const numberType: NumberType = query.numberType ?? "local";
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const params = new URLSearchParams({ VoiceEnabled: "true", PageSize: String(limit) });
    if (query.areaCode) params.set("AreaCode", query.areaCode.replace(/\D/g, ""));
    if (query.contains) params.set("Contains", query.contains);

    const raw = await twilio(
      "GET",
      API,
      `/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/${country}/${resourcePath(numberType)}.json?${params}`,
    );
    if (!isRecord(raw) || !Array.isArray(raw.available_phone_numbers)) {
      throw new TelephonyProviderError("TWILIO", "Twilio number search returned an unexpected shape");
    }

    const priced = await monthlyCostCents(country, numberType);
    const cost = priced ?? FALLBACK_MONTHLY_CENTS[numberType] ?? null;

    const out: AvailableNumber[] = [];
    for (const entry of raw.available_phone_numbers) {
      if (!isRecord(entry)) continue;
      const e164 = normalizeE164(str(entry.phone_number));
      if (!e164) continue;
      out.push({
        e164,
        countryCode: (str(entry.iso_country) ?? country).toUpperCase(),
        areaCode: query.areaCode?.replace(/\D/g, "") || undefined,
        numberType,
        capabilities: capabilitiesOf(entry.capabilities),
        monthlyCostCents: cost,
        costEstimated: priced === null,
        // Twilio's search response carries no reputation signal. Null means
        // "not rated", which the UI must not render as "clean".
        spamScore: null,
        region: str(entry.region) ?? str(entry.locality),
        provider: "TWILIO",
      });
    }
    return out.slice(0, limit);
  },

  async purchase(req: PurchaseRequest): Promise<PurchasedNumber> {
    const { sid } = creds();
    const e164 = normalizeE164(req.e164);
    if (!e164) throw new TelephonyProviderError("TWILIO", `Refusing to buy a number that is not E.164: ${req.e164}`, 400);

    const raw = await twilio("POST", API, `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, {
      PhoneNumber: e164,
      // The whole point: with a TrunkSid set Twilio ignores every voice URL and
      // routes the call down our shared trunk to LiveKit.
      TrunkSid: req.trunkId,
      FriendlyName: req.reference ? `scalar-${req.reference}` : undefined,
      BundleSid: req.bundleSid,
      AddressSid: req.addressSid,
      IdentitySid: req.identitySid,
    });

    if (!isRecord(raw)) throw new TelephonyProviderError("TWILIO", "Twilio purchase returned an unexpected shape");
    const providerNumberId = str(raw.sid);
    if (!providerNumberId) {
      // Without a sid we can never release or bill this number. Loud, not silent.
      throw new TelephonyProviderError(
        "TWILIO",
        "Twilio purchase response carried no sid. The number may have been bought and cannot be tracked, check the Twilio console.",
      );
    }
    const bought = normalizeE164(str(raw.phone_number)) ?? e164;

    return {
      e164: bought,
      providerNumberId,
      countryCode: req.countryCode.trim().toUpperCase(),
      numberType: req.numberType ?? "local",
      capabilities: capabilitiesOf(raw.capabilities),
      monthlyCostCents: null,
      trunkId: str(raw.trunk_sid) ?? req.trunkId ?? null,
    };
  },

  async release(providerNumberId: string): Promise<void> {
    const { sid } = creds();
    await twilio(
      "DELETE",
      API,
      `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${encodeURIComponent(providerNumberId)}.json`,
    );
  },

  async getStatus(providerNumberId: string): Promise<NumberStatus> {
    const { sid } = creds();
    const raw = await twilio(
      "GET",
      API,
      `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${encodeURIComponent(providerNumberId)}.json`,
    );
    if (!isRecord(raw)) throw new TelephonyProviderError("TWILIO", "Twilio number status returned an unexpected shape");
    const e164 = normalizeE164(str(raw.phone_number)) ?? "";
    const trunkId = str(raw.trunk_sid) ?? null;
    return {
      e164,
      providerNumberId,
      // A DID with no trunk is a DID that never reaches LiveKit. Report that as
      // "failed" so the repair path notices instead of the tenant noticing.
      state: e164 ? (trunkId ? "active" : "failed") : "unknown",
      trunkId,
      spamScore: null,
    };
  },

  async attachToTrunk(providerNumberId: string, trunkId: string): Promise<void> {
    // Repair path for a DID that was bought without a TrunkSid (or whose trunk
    // was cleared). VERIFIED endpoint.
    await twilio("POST", TRUNKING_API, `/v1/Trunks/${encodeURIComponent(trunkId)}/PhoneNumbers`, {
      PhoneNumberSid: providerNumberId,
    });
  },
};

/* ------------------------- one-time trunk setup -------------------------
 * Not part of the NumberProvider interface: this runs ONCE per Twilio account,
 * by hand, to create the single shared trunk whose origination URL points at
 * our LiveKit project SIP URI. Exported so it can be driven from a script
 * rather than reimplemented from the docs each time. Both endpoints are
 * VERIFIED against Twilio's OpenAPI.
 */
export async function createSharedTrunk(input: {
  friendlyName: string;
  /** Our LiveKit project SIP URI, e.g. sip:xxxx.sip.livekit.cloud */
  livekitSipUri: string;
}): Promise<{ trunkSid: string; originationUrlSid: string }> {
  const trunk = await twilio("POST", TRUNKING_API, "/v1/Trunks", { FriendlyName: input.friendlyName });
  if (!isRecord(trunk) || !str(trunk.sid)) {
    throw new TelephonyProviderError("TWILIO", "Twilio trunk creation returned no sid");
  }
  const trunkSid = str(trunk.sid) as string;

  const origination = await twilio("POST", TRUNKING_API, `/v1/Trunks/${trunkSid}/OriginationUrls`, {
    FriendlyName: "livekit",
    SipUrl: input.livekitSipUri,
    Weight: "1",
    Priority: "1",
    Enabled: "true",
  });
  if (!isRecord(origination) || !str(origination.sid)) {
    throw new TelephonyProviderError("TWILIO", "Twilio origination URL creation returned no sid");
  }
  return { trunkSid, originationUrlSid: str(origination.sid) as string };
}
