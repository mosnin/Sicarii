// LiveKit numbers. THE PRIMARY PROVIDER (founder decision: LiveKit DIDs, US only).
//
// WHY THIS IS HAND-ROLLED TWIRP
//   LiveKit sells DIDs through `livekit.PhoneNumberService`. The message types
//   ship in @livekit/protocol@1.50.4 (src/gen/livekit_phone_number_pb), but that
//   path is NOT reachable: the package's "exports" map exposes only ".", so a
//   deep import fails with ERR_PACKAGE_PATH_NOT_EXPORTED, and livekit-server-sdk
//   @2.17.0 ships no PhoneNumberClient. So the wire format is written out by
//   hand here, transported over the SDK's own TwirpRpc (see src/lib/livekit.ts).
//
// WHAT IS VERIFIED AND WHAT IS NOT
//   VERIFIED, read directly out of the shipped generated .d.ts:
//     - every message and field name below (SearchPhoneNumbersRequest
//       .country_code/.area_code/.limit/.page_token, PurchasePhoneNumberRequest
//       .phone_numbers/.sip_dispatch_rule_id, ReleasePhoneNumbersRequest
//       .ids/.phone_numbers, and PhoneNumber .id/.e164_format/.country_code/
//       .area_code/.number_type/.locality/.region/.spam_score/.capabilities/
//       .status/.sip_dispatch_rule_ids)
//     - the enum spellings PHONE_NUMBER_STATUS_* and PHONE_NUMBER_TYPE_*
//     - that livekit-server-sdk's own SIP client sends `.toJson()` (camelCase)
//       and parses responses with `fromJson({ignoreUnknownFields:true})`, which
//       is the strongest available evidence for this server's JSON convention
//   UNVERIFIED, and the reason for the WIRE block below:
//     - the SERVICE NAME in the Twirp path ("PhoneNumberService")
//     - whether this particular service emits camelCase or snake_case JSON
//   Both are decided in exactly ONE place (`WIRE`) so a single live call can
//   settle them without touching a single call site. Requests are sent in the
//   configured casing; responses are read through `field()`, which accepts both.
//
// INBOUND ONLY. A LiveKit DID cannot place outbound calls today. Nothing in
// this file pretends otherwise, and src/lib/telephony/calls.ts refuses to dial
// without a separately configured outbound SIP trunk.

import { livekitTwirp } from "@/lib/livekit";
import {
  TelephonyNotConfiguredError,
  TelephonyProviderError,
  isRecord,
  normalizeE164,
  str,
  type AvailableNumber,
  type NumberProvider,
  type NumberSearchQuery,
  type NumberState,
  type NumberStatus,
  type NumberType,
  type PurchaseRequest,
  type PurchasedNumber,
} from "@/lib/telephony/provider";

/* ─────────────────────────── THE ONE WIRE DECISION ───────────────────────────
 * Everything unverified about this service is decided here and nowhere else.
 * To settle it: make one live SearchPhoneNumbers call. A 404 means the service
 * name is wrong (flip LIVEKIT_PHONE_SERVICE). A 200 with an empty parse means
 * the casing is wrong (flip LIVEKIT_PHONE_WIRE_CASING). No call site changes.
 */
const WIRE = {
  /** Twirp path is {host}/twirp/livekit.{service}/{Method}. */
  get service(): string {
    return process.env.LIVEKIT_PHONE_SERVICE?.trim() || "PhoneNumberService";
  },
  /** Casing used for REQUEST bodies. "camel" matches what the SDK's own SIP
   *  client sends via protobuf-es `.toJson()`. Responses are always read
   *  through field(), which accepts either, so this only affects requests. */
  get requestCasing(): "camel" | "snake" {
    return process.env.LIVEKIT_PHONE_WIRE_CASING?.trim().toLowerCase() === "snake" ? "snake" : "camel";
  },
} as const;

/** snake_case proto field name to the configured request casing. */
function key(protoName: string): string {
  if (WIRE.requestCasing === "snake") return protoName;
  return protoName.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/** Read a proto field off a response regardless of the casing it came back in.
 *  Never guesses a value, only a spelling. */
function field(o: unknown, protoName: string): unknown {
  if (!isRecord(o)) return undefined;
  if (protoName in o) return o[protoName];
  const camel = key(protoName) === protoName ? protoName.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase()) : key(protoName);
  return camel in o ? o[camel] : undefined;
}

function body(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[key(k)] = v;
  }
  return out;
}

async function call(method: string, fields: Record<string, unknown>): Promise<unknown> {
  try {
    return await livekitTwirp(WIRE.service, method, body(fields));
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) {
      // Loud and specific: a 404 here is almost certainly the unverified
      // service name, not an unavailable number. Never let it read as "none
      // found".
      throw new TelephonyProviderError(
        "LIVEKIT",
        `LiveKit ${WIRE.service}/${method} returned 404. The Twirp service name is UNVERIFIED; set ` +
          `LIVEKIT_PHONE_SERVICE to the correct name. This is not the same as "no numbers available".`,
        501,
      );
    }
    throw new TelephonyProviderError(
      "LIVEKIT",
      `LiveKit ${WIRE.service}/${method} failed: ${e instanceof Error ? e.message : String(e)}`,
      typeof status === "number" && status >= 400 && status < 500 ? 400 : 502,
    );
  }
}

/* ------------------------------- enum mapping ------------------------------ */
// VERIFIED from the generated enums. Proto3 JSON may send either the enum NAME
// or its integer, so both are handled. An unrecognised value maps to "unknown"
// rather than to something reassuring.

function numberTypeFrom(v: unknown): NumberType {
  const s = typeof v === "number" ? ["UNKNOWN", "MOBILE", "LOCAL", "TOLL_FREE"][v] : str(v);
  const name = (s ?? "").toUpperCase().replace("PHONE_NUMBER_TYPE_", "");
  if (name === "TOLL_FREE") return "toll_free";
  if (name === "MOBILE") return "mobile";
  return "local";
}

function statusFrom(v: unknown): NumberState {
  const s = typeof v === "number" ? ["UNSPECIFIED", "ACTIVE", "PENDING", "RELEASED", "OFFLINE"][v] : str(v);
  const name = (s ?? "").toUpperCase().replace("PHONE_NUMBER_STATUS_", "");
  switch (name) {
    case "ACTIVE":
      return "active";
    case "PENDING":
      return "pending";
    case "RELEASED":
      return "released";
    // OFFLINE means the DID is not attached to any dispatch rule, so it never
    // rings. For our purposes that is a broken number, not a healthy one.
    case "OFFLINE":
      return "failed";
    default:
      return "unknown";
  }
}

function capabilitiesFrom(v: unknown): string[] {
  if (!Array.isArray(v)) return ["voice"];
  const out = v.map((c) => str(c)).filter((c): c is string => Boolean(c));
  return out.length ? out : ["voice"];
}

function spamScoreFrom(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Map a livekit.PhoneNumber message onto our shape. Throws when the number
 *  itself is unreadable: a nameless number is a number we can never release. */
function toAvailable(entry: unknown, fallbackCountry: string): AvailableNumber | null {
  const e164 = normalizeE164(str(field(entry, "e164_format")));
  if (!e164) return null;
  return {
    e164,
    countryCode: (str(field(entry, "country_code")) ?? fallbackCountry).toUpperCase(),
    areaCode: str(field(entry, "area_code")),
    numberType: numberTypeFrom(field(entry, "number_type")),
    capabilities: capabilitiesFrom(field(entry, "capabilities")),
    // The number service does not quote a monthly price on the wire, so cost
    // comes from configured list price and is always labelled as an estimate.
    monthlyCostCents: listPriceCents(),
    costEstimated: true,
    spamScore: spamScoreFrom(field(entry, "spam_score")),
    region: [str(field(entry, "locality")), str(field(entry, "region"))].filter(Boolean).join(", ") || undefined,
    provider: "LIVEKIT",
    providerNumberId: str(field(entry, "id")),
  };
}

/** LiveKit's list price per DID per month, in cents. Configurable because it is
 *  a commercial term, not a protocol fact. Shown as an estimate, never as a
 *  quote. */
function listPriceCents(): number | null {
  const raw = process.env.LIVEKIT_NUMBER_MONTHLY_CENTS?.trim();
  if (!raw) return 200;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 200;
}

/** LiveKit numbers are US only today. Enforced here as well as in the routes
 *  and the UI, so no path can slip a non-US buy through. */
export const LIVEKIT_SUPPORTED_COUNTRIES = ["US"] as const;

function assertSupportedCountry(country: string): string {
  const c = country.trim().toUpperCase();
  if (!(LIVEKIT_SUPPORTED_COUNTRIES as readonly string[]).includes(c)) {
    throw new TelephonyProviderError(
      "LIVEKIT",
      `LiveKit numbers are US only today. ${c} is not available.`,
      400,
    );
  }
  return c;
}

export const livekitNumberProvider: NumberProvider = {
  name: "LIVEKIT",

  isConfigured(): boolean {
    return Boolean(
      process.env.LIVEKIT_URL?.trim() && process.env.LIVEKIT_API_KEY?.trim() && process.env.LIVEKIT_API_SECRET?.trim(),
    );
  },

  sharedTrunkId(): string | null {
    // A LiveKit-native DID is already inside LiveKit. There is no carrier trunk
    // to attach it to, which is precisely why this provider is simpler than the
    // carrier ones. Outbound is a separate trunk entirely (LIVEKIT_OUTBOUND_TRUNK_ID).
    return null;
  },

  // The dispatch rule can be attached in the same call as the purchase, so
  // buy-and-wire is atomic at the carrier and there is no window where a tenant
  // owns a number that does not ring.
  wiresDispatchRuleAtPurchase: true,

  // Honest capability reporting. calls.ts reads this so it can refuse to dial
  // instead of producing a call that silently never connects.
  supportsOutbound: false,

  async search(query: NumberSearchQuery): Promise<AvailableNumber[]> {
    if (!this.isConfigured()) throw new TelephonyNotConfiguredError("LiveKit numbers");
    const country = assertSupportedCountry(query.countryCode);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const raw = await call("SearchPhoneNumbers", {
      country_code: country,
      area_code: query.areaCode?.replace(/\D/g, "") || undefined,
      limit,
    });

    const items = field(raw, "items");
    if (!Array.isArray(items)) {
      // Fail loudly. An unreadable response must never render as "sold out".
      throw new TelephonyProviderError(
        "LIVEKIT",
        `SearchPhoneNumbers returned no readable "items" array (keys: ${
          isRecord(raw) ? Object.keys(raw).join(", ") || "none" : typeof raw
        }). Either the response casing differs (set LIVEKIT_PHONE_WIRE_CASING) or the schema has moved.`,
      );
    }

    const out: AvailableNumber[] = [];
    for (const entry of items) {
      const mapped = toAvailable(entry, country);
      if (mapped) out.push(mapped);
    }
    return out;
  },

  async purchase(req: PurchaseRequest): Promise<PurchasedNumber> {
    if (!this.isConfigured()) throw new TelephonyNotConfiguredError("LiveKit numbers");
    const country = assertSupportedCountry(req.countryCode);
    const e164 = normalizeE164(req.e164);
    if (!e164) throw new TelephonyProviderError("LIVEKIT", `Refusing to buy a number that is not E.164: ${req.e164}`, 400);

    const raw = await call("PurchasePhoneNumber", {
      phone_numbers: [e164],
      // Buy and wire in one call: the DID is attached to its per-tenant dispatch
      // rule at the moment it is bought, so there is no partial state at the
      // carrier for us to clean up.
      sip_dispatch_rule_id: req.dispatchRuleId,
    });

    const purchased = field(raw, "phone_numbers");
    const first = Array.isArray(purchased) ? purchased[0] : undefined;
    const providerNumberId = str(field(first, "id"));
    if (!providerNumberId) {
      // Without an id we can never release or reconcile this number. This is
      // the one failure that must never be reported as success.
      throw new TelephonyProviderError(
        "LIVEKIT",
        `PurchasePhoneNumber returned no number id for ${e164}. A number may have been bought and cannot be ` +
          `released from here. Check the LiveKit console before retrying.`,
      );
    }

    const ruleIds = field(first, "sip_dispatch_rule_ids");
    const attachedRule =
      (Array.isArray(ruleIds) ? str(ruleIds[0]) : undefined) ?? str(field(first, "sip_dispatch_rule_id"));

    return {
      e164: normalizeE164(str(field(first, "e164_format"))) ?? e164,
      providerNumberId,
      countryCode: (str(field(first, "country_code")) ?? country).toUpperCase(),
      numberType: numberTypeFrom(field(first, "number_type")),
      capabilities: capabilitiesFrom(field(first, "capabilities")),
      monthlyCostCents: listPriceCents(),
      spamScore: spamScoreFrom(field(first, "spam_score")),
      areaCode: str(field(first, "area_code")),
      trunkId: null,
      dispatchRuleId: attachedRule ?? req.dispatchRuleId ?? null,
    };
  },

  async release(providerNumberId: string): Promise<void> {
    if (!this.isConfigured()) throw new TelephonyNotConfiguredError("LiveKit numbers");
    await call("ReleasePhoneNumbers", { ids: [providerNumberId] });
  },

  async getStatus(providerNumberId: string): Promise<NumberStatus> {
    if (!this.isConfigured()) throw new TelephonyNotConfiguredError("LiveKit numbers");
    const raw = await call("GetPhoneNumber", { id: providerNumberId });
    const pn = field(raw, "phone_number") ?? raw;
    const e164 = normalizeE164(str(field(pn, "e164_format")));
    if (!e164) {
      throw new TelephonyProviderError(
        "LIVEKIT",
        `GetPhoneNumber(${providerNumberId}) returned no readable e164_format. Refusing to report a status we cannot stand behind.`,
      );
    }
    const ruleIds = field(pn, "sip_dispatch_rule_ids");
    return {
      e164,
      providerNumberId,
      state: statusFrom(field(pn, "status")),
      trunkId: null,
      dispatchRuleId: (Array.isArray(ruleIds) ? str(ruleIds[0]) : undefined) ?? str(field(pn, "sip_dispatch_rule_id")) ?? null,
      spamScore: spamScoreFrom(field(pn, "spam_score")),
    };
  },

  /** Repair path: attach (or re-attach) a dispatch rule to an owned DID. */
  async attachDispatchRule(providerNumberId: string, dispatchRuleId: string): Promise<void> {
    if (!this.isConfigured()) throw new TelephonyNotConfiguredError("LiveKit numbers");
    await call("UpdatePhoneNumber", { id: providerNumberId, sip_dispatch_rule_id: dispatchRuleId });
  },
};
