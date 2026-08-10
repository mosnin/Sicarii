// Buying a number, end to end.
//
// THE FAILURE THAT MATTERS: a purchased number with no dispatch rule is a
// number the tenant pays for every month that never rings. So this file only
// ever ends in one of two states, never in between:
//   (a) bought AND wired AND persisted ACTIVE, or
//   (b) nothing owned: the number released at the carrier, the row marked
//       FAILED with a `lastError` a human can act on.
// If even the rollback fails we say so explicitly in `lastError` and mark the
// row FAILED, because a silent orphan at the carrier is a recurring bill nobody
// is looking at.
//
// IDEMPOTENT. The PhoneNumber row (unique on e164) is the intent record and is
// written BEFORE any money is spent, so a retry after a crash resumes from
// wherever it stopped rather than buying a second number.
//
// TWO WIRING SHAPES, one code path:
//   LiveKit  (wiresDispatchRuleAtPurchase): create the rule, then buy WITH the
//            rule id. Atomic at the carrier; rollback only has to undo a rule.
//   Carriers (Twilio/Telnyx): buy pinned to the shared trunk, then create the
//            rule. Rollback has to release a real number.

import { Prisma, type PhoneNumber, type PhoneNumberProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { CREDIT_COSTS, ensureCredits, spendCredits } from "@/lib/credits";
import { createDidDispatchRule, deleteDispatchRule } from "@/lib/livekit";
import {
  getNumberProvider,
  isValidCountryCode,
  normalizeE164,
  supportedCountries,
  type AvailableNumber,
  type NumberProvider,
  type NumberSearchQuery,
  type ProviderName,
} from "@/lib/telephony/provider";

/** Hard per-tenant cap. Telecom assets are a recurring bill and a compliance
 *  surface; an agent loop or a fat finger must not be able to buy fifty DIDs. */
export function maxNumbersPerTenant(): number {
  const raw = Number(process.env.TELEPHONY_MAX_NUMBERS_PER_TENANT ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 5;
}

/** Statuses that count against the cap. RELEASED and FAILED do not. */
const HELD_STATUSES = ["PENDING", "ACTIVE"] as const;

export interface SearchInput extends NumberSearchQuery {
  provider?: string | null;
}

export async function searchAvailableNumbers(userId: string, input: SearchInput): Promise<{
  provider: ProviderName;
  countries: string[] | null;
  numbers: AvailableNumber[];
}> {
  if (!userId) throw new OpError("Unauthorized", 401);
  const provider = getNumberProvider(input.provider);
  if (!provider.isConfigured()) {
    throw new OpError(`${provider.name} is not configured on this deployment.`, 501);
  }
  const country = (input.countryCode ?? "").trim().toUpperCase();
  if (!isValidCountryCode(country)) {
    throw new OpError("countryCode must be a two-letter ISO country code, for example US.", 400);
  }
  const allowed = supportedCountries(provider.name);
  if (allowed && !allowed.includes(country)) {
    throw new OpError(
      `${provider.name} numbers are available in ${allowed.join(", ")} only today. ${country} is not available.`,
      400,
    );
  }

  const numbers = await provider.search({
    countryCode: country,
    areaCode: input.areaCode,
    contains: input.contains,
    numberType: input.numberType,
    limit: input.limit,
  });
  return { provider: provider.name, countries: allowed, numbers };
}

export async function listNumbers(userId: string): Promise<PhoneNumber[]> {
  if (!userId) throw new OpError("Unauthorized", 401);
  return prisma.phoneNumber.findMany({
    where: { userId, status: { not: "RELEASED" } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getNumber(userId: string, id: string): Promise<PhoneNumber> {
  if (!userId) throw new OpError("Unauthorized", 401);
  const row = await prisma.phoneNumber.findFirst({ where: { id, userId } });
  if (!row) throw new OpError("Phone number not found", 404);
  return row;
}

export interface ProvisionInput {
  e164: string;
  countryCode: string;
  areaCode?: string;
  numberType?: "local" | "toll_free" | "mobile";
  monthlyCostCents?: number | null;
  spamScore?: number | null;
  provider?: string | null;
  /** Regulatory identity, required in many regions. For a SaaS reselling DIDs
   *  this is often the END CUSTOMER's identity, not ours. */
  bundleSid?: string;
  addressSid?: string;
  identitySid?: string;
}

/**
 * Buy a number and wire it, or own nothing.
 *
 * Deliberately NOT an agent tool. Spending real recurring money on a telecom
 * asset, under a regulatory identity, is a human decision.
 */
export async function provisionNumber(userId: string, input: ProvisionInput): Promise<PhoneNumber> {
  if (!userId) throw new OpError("Unauthorized", 401);

  const provider = getNumberProvider(input.provider);
  if (!provider.isConfigured()) {
    throw new OpError(`${provider.name} is not configured on this deployment.`, 501);
  }

  const e164 = normalizeE164(input.e164);
  if (!e164) throw new OpError(`"${input.e164}" is not a valid E.164 phone number.`, 400);

  const country = (input.countryCode ?? "").trim().toUpperCase();
  if (!isValidCountryCode(country)) {
    throw new OpError("countryCode must be a two-letter ISO country code, for example US.", 400);
  }
  const allowed = supportedCountries(provider.name);
  if (allowed && !allowed.includes(country)) {
    throw new OpError(
      `${provider.name} numbers are available in ${allowed.join(", ")} only today. ${country} is not available.`,
      400,
    );
  }

  // Credits are checked before anything is bought, and only debited once the
  // number is actually wired. Never charge for a provisioning attempt.
  await ensureCredits(userId, "phone_number_provision");

  const existing = await prisma.phoneNumber.findUnique({ where: { e164 } });
  if (existing && existing.userId !== userId) {
    // Never leak whether another tenant holds it; it is simply unavailable.
    throw new OpError("That number is no longer available.", 409);
  }
  if (existing?.status === "ACTIVE") {
    // Idempotent: the same buy replayed is a no-op, not a second purchase.
    return existing;
  }

  const held = await prisma.phoneNumber.count({ where: { userId, status: { in: [...HELD_STATUSES] } } });
  const cap = maxNumbersPerTenant();
  if (held >= cap && !existing) {
    throw new OpError(
      `You already hold ${held} phone numbers, which is the limit (${cap}). Release one before buying another.`,
      409,
    );
  }

  // The intent record. Written BEFORE any money moves so a crash mid-purchase
  // leaves a row we can find and reconcile instead of an invisible orphan.
  const row = existing
    ? await prisma.phoneNumber.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          lastError: null,
          provider: provider.name as PhoneNumberProvider,
          countryCode: country,
          areaCode: input.areaCode ?? existing.areaCode,
          numberType: input.numberType ?? existing.numberType,
          monthlyCostCents: input.monthlyCostCents ?? existing.monthlyCostCents,
          spamScore: input.spamScore ?? existing.spamScore,
        },
      })
    : await prisma.phoneNumber.create({
        data: {
          userId,
          e164,
          countryCode: country,
          areaCode: input.areaCode,
          numberType: input.numberType ?? "local",
          provider: provider.name as PhoneNumberProvider,
          status: "PENDING",
          monthlyCostCents: input.monthlyCostCents ?? null,
          spamScore: input.spamScore ?? null,
        },
      });

  return provider.wiresDispatchRuleAtPurchase
    ? wireThenBuy(userId, provider, row, { e164, country, input })
    : buyThenWire(userId, provider, row, { e164, country, input });
}

interface WiringContext {
  e164: string;
  country: string;
  input: ProvisionInput;
}

/** LiveKit shape: the rule exists first, the purchase attaches it atomically. */
async function wireThenBuy(
  userId: string,
  provider: NumberProvider,
  row: PhoneNumber,
  ctx: WiringContext,
): Promise<PhoneNumber> {
  let ruleId = row.livekitDispatchRuleId;
  if (!ruleId) {
    try {
      ruleId = await createDidDispatchRule({ tenantId: userId, e164: ctx.e164 });
    } catch (e) {
      // Nothing was bought. Record why and stop; no rollback needed.
      return failRow(row.id, `Could not create the LiveKit dispatch rule: ${message(e)}`, e);
    }
    row = await prisma.phoneNumber.update({
      where: { id: row.id },
      data: { livekitDispatchRuleId: ruleId },
    });
  }

  let purchased;
  try {
    purchased = await provider.purchase({
      e164: ctx.e164,
      countryCode: ctx.country,
      numberType: ctx.input.numberType,
      dispatchRuleId: ruleId,
      reference: row.id,
      bundleSid: ctx.input.bundleSid,
      addressSid: ctx.input.addressSid,
      identitySid: ctx.input.identitySid,
    });
  } catch (e) {
    // Roll the rule back so we do not accumulate orphan dispatch rules that
    // silently shadow a future purchase of the same DID.
    const cleanup = await tryDeleteRule(ruleId);
    return failRow(
      row.id,
      `Purchase failed: ${message(e)}.${cleanup ? "" : ` The dispatch rule ${ruleId} could not be deleted and needs manual cleanup.`}`,
      e,
      { livekitDispatchRuleId: cleanup ? null : ruleId },
    );
  }

  return activate(userId, row.id, {
    e164: purchased.e164,
    providerNumberId: purchased.providerNumberId,
    dispatchRuleId: purchased.dispatchRuleId ?? ruleId,
    trunkId: purchased.trunkId ?? null,
    capabilities: purchased.capabilities,
    monthlyCostCents: purchased.monthlyCostCents ?? ctx.input.monthlyCostCents ?? null,
    spamScore: purchased.spamScore ?? ctx.input.spamScore ?? null,
    areaCode: purchased.areaCode ?? ctx.input.areaCode ?? null,
  });
}

/** Carrier shape: buy pinned to the shared trunk, then create the rule. If the
 *  rule fails, the number is RELEASED, because a number that cannot ring is
 *  worse than no number at all. */
async function buyThenWire(
  userId: string,
  provider: NumberProvider,
  row: PhoneNumber,
  ctx: WiringContext,
): Promise<PhoneNumber> {
  const trunkId = provider.sharedTrunkId();
  if (!trunkId) {
    return failRow(
      row.id,
      `${provider.name} has no shared trunk configured, so a purchased number would never reach LiveKit. ` +
        `Set the trunk env var for this carrier before buying.`,
      new OpError("missing shared trunk", 501),
    );
  }

  let providerNumberId = row.providerNumberId;
  let purchased;
  if (!providerNumberId) {
    try {
      purchased = await provider.purchase({
        e164: ctx.e164,
        countryCode: ctx.country,
        numberType: ctx.input.numberType,
        trunkId,
        reference: row.id,
        bundleSid: ctx.input.bundleSid,
        addressSid: ctx.input.addressSid,
        identitySid: ctx.input.identitySid,
      });
    } catch (e) {
      return failRow(row.id, `Purchase failed: ${message(e)}`, e);
    }
    providerNumberId = purchased.providerNumberId;
    // Persist the carrier handle IMMEDIATELY. From here on a crash leaves a row
    // that knows exactly what we own and can be released.
    const purchasedAt = new Date();
    row = await prisma.phoneNumber.update({
      where: { id: row.id },
      // First rent is due 30 days out; the renewal task advances it from here.
      data: {
        providerNumberId,
        livekitTrunkId: trunkId,
        purchasedAt,
        nextRenewalAt: new Date(purchasedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  let ruleId = row.livekitDispatchRuleId;
  if (!ruleId) {
    try {
      ruleId = await createDidDispatchRule({ tenantId: userId, e164: ctx.e164, trunkIds: [trunkId] });
    } catch (e) {
      // THE ROLLBACK THAT MATTERS. We own a number that cannot route. Give it
      // back rather than bill the tenant for a phone that never rings.
      const released = await tryRelease(provider, providerNumberId);
      return failRow(
        row.id,
        released
          ? `Dispatch rule creation failed (${message(e)}), so the number was released and you were not charged.`
          : `Dispatch rule creation failed (${message(e)}) AND the number could not be released. ` +
            `MANUAL ACTION REQUIRED: release ${ctx.e164} (${provider.name} id ${providerNumberId}) in the carrier console.`,
        e,
        released
          ? { status: "RELEASED", releasedAt: new Date(), providerNumberId: null }
          : { providerNumberId },
      );
    }
  }

  return activate(userId, row.id, {
    e164: ctx.e164,
    providerNumberId,
    dispatchRuleId: ruleId,
    trunkId,
    capabilities: purchased?.capabilities ?? ["voice"],
    monthlyCostCents: purchased?.monthlyCostCents ?? ctx.input.monthlyCostCents ?? null,
    spamScore: ctx.input.spamScore ?? null,
    areaCode: ctx.input.areaCode ?? null,
  });
}

interface ActivateInput {
  e164: string;
  providerNumberId: string;
  dispatchRuleId: string | null;
  trunkId: string | null;
  capabilities: string[];
  monthlyCostCents: number | null;
  spamScore: number | null;
  areaCode: string | null;
}

async function activate(userId: string, rowId: string, data: ActivateInput): Promise<PhoneNumber> {
  // Both provider paths (LiveKit's wire-then-buy and the carriers' buy-then-wire)
  // land here, so nextRenewalAt is set HERE, not only in buyThenWire - otherwise
  // LiveKit numbers would never be seeded for monthly rent and never charge.
  const purchasedAt = new Date();
  const row = await prisma.phoneNumber.update({
    where: { id: rowId },
    data: {
      e164: data.e164,
      providerNumberId: data.providerNumberId,
      livekitDispatchRuleId: data.dispatchRuleId,
      livekitTrunkId: data.trunkId,
      capabilities: data.capabilities,
      monthlyCostCents: data.monthlyCostCents,
      spamScore: data.spamScore,
      areaCode: data.areaCode,
      status: "ACTIVE",
      purchasedAt,
      nextRenewalAt: new Date(purchasedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      releasedAt: null,
      lastError: null,
    },
  });

  // Metered only now, and idempotently on the row id, so a resumed provision
  // never double charges.
  try {
    await spendCredits(userId, "phone_number_provision", { ref: `phone_number:${rowId}` });
  } catch (e) {
    // The number is bought and wired. Failing the whole call here would tell
    // the tenant it did not work when it did. Log and move on; the balance
    // check already ran up front.
    console.warn("[telephony] provisioned a number but could not meter it", e);
  }
  return row;
}

async function failRow(
  rowId: string,
  lastError: string,
  cause: unknown,
  extra: Prisma.PhoneNumberUpdateInput = {},
): Promise<never> {
  await prisma.phoneNumber
    .update({ where: { id: rowId }, data: { status: "FAILED", lastError: lastError.slice(0, 1000), ...extra } })
    .catch((e) => console.error("[telephony] could not record provisioning failure", e));
  throw cause instanceof OpError ? new OpError(lastError, cause.status) : new OpError(lastError, 502);
}

async function tryRelease(provider: NumberProvider, providerNumberId: string): Promise<boolean> {
  try {
    await provider.release(providerNumberId);
    return true;
  } catch (e) {
    console.error("[telephony] ROLLBACK FAILED: could not release", providerNumberId, e);
    return false;
  }
}

async function tryDeleteRule(ruleId: string): Promise<boolean> {
  try {
    await deleteDispatchRule(ruleId);
    return true;
  } catch (e) {
    console.error("[telephony] ROLLBACK FAILED: could not delete dispatch rule", ruleId, e);
    return false;
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Give a number back. Releases at the carrier first, then tears down the
 * dispatch rule, then marks the row RELEASED. Ordering is deliberate: the
 * carrier is what costs money every month, so it goes first.
 */
export async function releaseNumber(userId: string, id: string): Promise<PhoneNumber> {
  const row = await getNumber(userId, id);
  if (row.status === "RELEASED") return row;

  const provider = getNumberProvider(row.provider);
  const errors: string[] = [];

  if (row.providerNumberId) {
    if (!(await tryRelease(provider, row.providerNumberId))) {
      errors.push(
        `the carrier would not release ${row.e164} (${row.provider} id ${row.providerNumberId}); you may still be billed for it`,
      );
    }
  }
  if (row.livekitDispatchRuleId) {
    if (!(await tryDeleteRule(row.livekitDispatchRuleId))) {
      errors.push(`the LiveKit dispatch rule ${row.livekitDispatchRuleId} could not be deleted`);
    }
  }

  const updated = await prisma.phoneNumber.update({
    where: { id: row.id },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
      livekitDispatchRuleId: null,
      providerNumberId: null,
      lastError: errors.length ? `Released with warnings: ${errors.join("; ")}` : null,
    },
  });

  // Inbound calls are already dead once the rule is gone. Any call still in
  // flight keeps its own row; we only detach the number.
  return updated;
}

/**
 * Reconcile one number against the carrier. Cheap to run, safe to repeat, and
 * the only way to notice a DID that quietly lost its dispatch rule and has been
 * failing to ring.
 */
export async function refreshNumberStatus(userId: string, id: string): Promise<PhoneNumber> {
  const row = await getNumber(userId, id);
  if (!row.providerNumberId) return row;

  const provider = getNumberProvider(row.provider);
  const status = await provider.getStatus(row.providerNumberId);

  const wired = Boolean(status.dispatchRuleId ?? row.livekitDispatchRuleId);
  return prisma.phoneNumber.update({
    where: { id: row.id },
    data: {
      spamScore: status.spamScore ?? row.spamScore,
      livekitDispatchRuleId: status.dispatchRuleId ?? row.livekitDispatchRuleId,
      status: status.state === "active" && wired ? "ACTIVE" : status.state === "released" ? "RELEASED" : "FAILED",
      lastError:
        status.state === "active" && !wired
          ? "This number is live at the carrier but has no dispatch rule, so inbound calls will not reach your agent."
          : row.lastError,
    },
  });
}

export const PROVISION_CREDIT_COST = CREDIT_COSTS.phone_number_provision;
