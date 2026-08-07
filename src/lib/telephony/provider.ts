// The carrier boundary.
//
// Everything above this file (provisioning, calls, the MCP tools, the buy-a-
// number UI) talks to a `NumberProvider`, never to LiveKit or Twilio or Telnyx
// directly. A carrier must never leak past this interface.
//
// WHERE WE ARE TODAY
//   LIVEKIT is the default and the only provider tenants buy from: US only,
//   INBOUND only. Buying is one call (the dispatch rule is attached at purchase).
//   TWILIO and TELNYX stay implemented as secondary providers because they are
//   the only current route to OUTBOUND dialing, which a LiveKit DID cannot do.
//   When LiveKit ships outbound we delete an entire vendor relationship by
//   changing one env var, which is the whole reason this interface exists.
//
// Selection is config, not code: TELEPHONY_PROVIDER = livekit | twilio | telnyx.
//
// Note on module order: the adapters below import the error classes declared in
// this file, so this module and the adapters form an import cycle. It is safe
// because the adapters only ever CONSTRUCT these classes inside function
// bodies. Never subclass them at an adapter's module scope, that would run
// before this module's class declarations and throw a TDZ error at import time.

import { OpError } from "@/lib/op-error";
import { twilioProvider } from "@/lib/telephony/twilio";
import { telnyxProvider } from "@/lib/telephony/telnyx";
import { livekitNumberProvider } from "@/lib/telephony/livekit-numbers";

export type ProviderName = "TWILIO" | "TELNYX" | "LIVEKIT";

export type NumberType = "local" | "toll_free" | "mobile";

/** Thrown when the selected carrier has no credentials in the environment.
 *  Surfaces as an HTTP 501 (house pattern, see src/lib/tavily.ts): the feature
 *  is not wired up, which is different from the caller doing something wrong. */
export class TelephonyNotConfiguredError extends OpError {
  constructor(what: string) {
    super(`${what} is not configured`, 501);
    this.name = "TelephonyNotConfiguredError";
  }
}

/** Thrown when a carrier answered but with a shape or status we cannot trust.
 *  Adapters fail loudly here rather than degrading to a plausible-looking
 *  empty result: a silent miss in telephony means a number the tenant pays
 *  for that never rings, or a call that quietly never happened. */
export class TelephonyProviderError extends OpError {
  provider: ProviderName;
  detail?: string;
  constructor(provider: ProviderName, message: string, status = 502, detail?: string) {
    super(message, status);
    this.name = "TelephonyProviderError";
    this.provider = provider;
    this.detail = detail;
  }
}

export interface NumberSearchQuery {
  /** ISO 3166-1 alpha-2, uppercase. "US", "GB", ... */
  countryCode: string;
  /** National area code / destination code, digits only. */
  areaCode?: string;
  /** Digit pattern the number should contain. */
  contains?: string;
  numberType?: NumberType;
  limit?: number;
}

export interface AvailableNumber {
  e164: string;
  countryCode: string;
  areaCode?: string;
  numberType: NumberType;
  /** "voice" | "sms" | "mms". Voice is the only one this product needs. */
  capabilities: string[];
  monthlyCostCents: number | null;
  /** True when monthlyCostCents came from a static fallback rather than the
   *  carrier's own pricing response. The buy UI labels these as estimates so
   *  nobody is surprised by the first invoice. */
  costEstimated: boolean;
  /** 0 (clean) .. 1 (heavily flagged), or null when the carrier does not rate
   *  the number. A number that is already flagged will get OUR outbound calls
   *  tagged as spam, so this is shown in the buy flow, not hidden. */
  spamScore: number | null;
  region?: string;
  provider: ProviderName;
  /** Carrier-side handle, when the search response already carries one. */
  providerNumberId?: string;
}

export interface PurchaseRequest {
  e164: string;
  countryCode: string;
  numberType?: NumberType;
  /** The ONE shared inbound trunk for this carrier, whose origination URL
   *  already points at our LiveKit project SIP URI. Trunks authenticate the
   *  CARRIER, not the tenant, so there is exactly one per carrier. Unused by
   *  the LiveKit provider, whose DIDs are already inside LiveKit. */
  trunkId?: string;
  /** The per-DID LiveKit dispatch rule to attach at purchase time. Only
   *  providers with `wiresDispatchRuleAtPurchase` honour this; for the others
   *  provisioning wires the rule as a second step and rolls back on failure. */
  dispatchRuleId?: string;
  /** Regulatory identity. Required in many countries, and when a SaaS resells
   *  numbers it is often the END CUSTOMER's identity the carrier requires, not
   *  ours. Collected in the buy flow; a purchase without them fails at the
   *  carrier rather than here. */
  bundleSid?: string;
  addressSid?: string;
  identitySid?: string;
  /** Our own reconciliation tag (the PhoneNumber row id). */
  reference?: string;
}

export interface PurchasedNumber {
  e164: string;
  providerNumberId: string;
  countryCode: string;
  numberType: NumberType;
  capabilities: string[];
  monthlyCostCents: number | null;
  areaCode?: string;
  spamScore?: number | null;
  trunkId?: string | null;
  /** Set when the provider attached the dispatch rule during purchase. */
  dispatchRuleId?: string | null;
}

export type NumberState = "pending" | "active" | "released" | "failed" | "unknown";

export interface NumberStatus {
  e164: string;
  providerNumberId: string;
  state: NumberState;
  trunkId?: string | null;
  dispatchRuleId?: string | null;
  spamScore?: number | null;
}

export interface NumberProvider {
  readonly name: ProviderName;
  /** False when the env vars this adapter needs are unset. */
  isConfigured(): boolean;
  /** The one shared inbound trunk id for this carrier, or null when unset. */
  sharedTrunkId(): string | null;
  /** True when purchase() accepts a dispatchRuleId and wires the DID in the
   *  same call, which removes the buy-then-wire partial-failure window. */
  readonly wiresDispatchRuleAtPurchase?: boolean;
  /** Whether a DID from this provider can place OUTBOUND calls. LiveKit's
   *  number service is inbound only today, and calls.ts reads this so an
   *  outbound attempt fails honestly instead of silently never connecting. */
  readonly supportsOutbound?: boolean;
  search(query: NumberSearchQuery): Promise<AvailableNumber[]>;
  purchase(req: PurchaseRequest): Promise<PurchasedNumber>;
  release(providerNumberId: string): Promise<void>;
  getStatus(providerNumberId: string): Promise<NumberStatus>;
  /** Repair path only: re-point an already purchased DID at the shared trunk.
   *  Optional because most carriers accept the trunk at purchase time. */
  attachToTrunk?(providerNumberId: string, trunkId: string): Promise<void>;
  /** Repair path only: attach a dispatch rule to an already purchased DID. */
  attachDispatchRule?(providerNumberId: string, dispatchRuleId: string): Promise<void>;
}

const PROVIDERS: Record<ProviderName, () => NumberProvider> = {
  TWILIO: () => twilioProvider,
  TELNYX: () => telnyxProvider,
  LIVEKIT: () => livekitNumberProvider,
};

export function normalizeProviderName(value: string | null | undefined): ProviderName | null {
  const v = (value ?? "").trim().toUpperCase();
  return v === "TWILIO" || v === "TELNYX" || v === "LIVEKIT" ? v : null;
}

/** The default carrier, chosen by TELEPHONY_PROVIDER. One env var is the whole
 *  switch: no code change, no redeploy of anything but config. Defaults to
 *  LIVEKIT (founder call: LiveKit's own DIDs, US only, inbound). */
export function defaultProviderName(): ProviderName {
  return normalizeProviderName(process.env.TELEPHONY_PROVIDER) ?? "LIVEKIT";
}

/** Resolve an adapter. Unknown names are rejected rather than silently falling
 *  back, so a typo in TELEPHONY_PROVIDER is loud instead of quietly buying
 *  numbers from the wrong carrier. */
export function getNumberProvider(name?: string | null): NumberProvider {
  const resolved = name ? normalizeProviderName(name) : defaultProviderName();
  if (!resolved) {
    throw new OpError(
      `Unknown telephony provider "${name}". Expected one of: livekit, twilio, telnyx.`,
      400,
    );
  }
  return PROVIDERS[resolved]();
}

/** Countries a provider will sell into. LiveKit is US only today; the carriers
 *  are effectively global, so we do not pretend to enumerate them. */
export function supportedCountries(name: ProviderName): string[] | null {
  return name === "LIVEKIT" ? ["US"] : null;
}

/** Every adapter that has credentials right now. Used by the health surface and
 *  by the buy UI to say which carriers can actually be searched. */
export function configuredProviders(): ProviderName[] {
  return (Object.keys(PROVIDERS) as ProviderName[]).filter((n) => PROVIDERS[n]().isConfigured());
}

/* ------------------------------- helpers ------------------------------- */

/** Strict-ish E.164: leading +, 8 to 15 digits, first digit not 0. We do not
 *  guess a country code. A number we cannot normalize is refused rather than
 *  dialed, because dialing the wrong human is unrecoverable. */
export function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Tolerate the common human formats: spaces, dashes, dots, parens.
  const cleaned = trimmed.replace(/[\s\-().]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) return null;
  return withPlus;
}

/** Digits only, for comparing numbers written in different formats. */
export function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCountryCode(code: string): boolean {
  return /^[A-Za-z]{2}$/.test(code.trim());
}

/** Dollars-as-string ("1.15") to integer cents. Returns null on anything that
 *  is not a finite number, never NaN cents. */
export function dollarsToCents(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
