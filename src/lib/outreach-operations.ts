// Agent outreach mailboxes — shared operations (Card 0015).
//
// The single source of truth for domains, mailboxes, sequences, enrollments,
// queued sends, and suppression. REST routes, MCP tools, and the scheduler all
// call these (one-ops-layer pattern from crm-operations.ts) so ownership,
// validation, and safety checks stay identical everywhere. All functions are
// scoped to a userId. Transmission itself lives in outreach-send.ts; this file
// never touches the network except through the provider clients below.

import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";
import { ensureCredits } from "@/lib/credits";
import { fetchWithTimeout } from "@/lib/http";
import {
  normalizeDomain,
  normalizeEmailAddr,
  parseSequenceSteps,
  isMailboxPlatform,
  type SequenceStep,
} from "@/lib/outreach/types";
import { buildSpfRecord, buildDmarcRecord, verifyDomainDns } from "@/lib/outreach/dns";
import {
  checkAvailability,
  getSuggestions,
  requestQuote,
  submitRegistration,
  setDnsRecords,
  isGoDaddyConfigured,
} from "@/lib/outreach/godaddy";
import {
  submitInboxOrder,
  renderIntakeCsv,
  type InboxOrder,
} from "@/lib/outreach/premium-inboxes";
import { warmupSummary } from "@/lib/outreach/warmup";

/* ── Domains ─────────────────────────────────────────────────────────────── */

const DOMAIN_SEARCH_LIMIT = 10;

export async function searchOutreachDomains(userId: string, query: string) {
  void userId;
  if (!isGoDaddyConfigured()) throw new OpError("Domain purchase is not configured (GODADDY_PAT missing).", 501);
  const q = query.trim().slice(0, 200);
  if (!q) throw new OpError("query is required", 400);
  const asDomain = normalizeDomain(q);
  const [direct, suggestions] = await Promise.all([
    asDomain ? checkAvailability(asDomain, { accurate: false }) : null,
    getSuggestions(q, { pageSize: DOMAIN_SEARCH_LIMIT }),
  ]);
  return { direct, suggestions };
}

export async function quoteOutreachDomain(userId: string, input: { domain: string; periodYears?: number }) {
  if (!isGoDaddyConfigured()) throw new OpError("Domain purchase is not configured (GODADDY_PAT missing).", 501);
  const domain = normalizeDomain(input.domain);
  if (!domain) throw new OpError("domain is not a valid bare domain (e.g. getacme.co)", 400);
  const period = input.periodYears ?? 1;
  if (![1, 2, 3, 5, 10].includes(period)) throw new OpError("periodYears must be one of 1, 2, 3, 5, 10", 400);

  const existing = await prisma.outreachDomain.findUnique({ where: { userId_domain: { userId, domain } } });
  if (existing) throw new OpError("You already own this domain in Scalar.", 409);

  const availability = await checkAvailability(domain, { accurate: true });
  if (!availability.available) throw new OpError(`${domain} is not available for registration.`, 409);
  const quote = await requestQuote(domain, { period });

  const record = await prisma.outreachDomain.create({
    data: { userId, domain, provider: "godaddy", status: "pending_payment" },
  });
  const order = await prisma.domainOrder.create({
    data: {
      userId,
      domainId: record.id,
      domainName: domain,
      periodYears: period,
      quoteToken: quote.quoteToken,
      quotedCentsUsd: quote.priceCentsUsd,
      idempotencyKey: randomUUID(),
      status: "pending_payment",
    },
  });
  return {
    order: { id: order.id, status: order.status },
    domain: { id: record.id, domain: record.domain, status: record.status },
    quote: {
      priceCentsUsd: quote.priceCentsUsd,
      serviceFeeCentsUsd: DOMAIN_SERVICE_FEE_CENTS,
      totalCentsUsd: (quote.priceCentsUsd ?? 0) + DOMAIN_SERVICE_FEE_CENTS,
      period,
      expiresAt: quote.expiresAt,
      requiredAgreements: quote.requiredAgreements,
    },
  };
}

/** Flat service fee per domain registration (disclosed at quote time, stored on the receipt). */
export const DOMAIN_SERVICE_FEE_CENTS = 500;

/** Mailbox-platform default local parts offered when the user doesn't name inboxes. */
export const DEFAULT_LOCAL_PARTS = ["hello", "leo", "mia", "sam", "jules"] as const;

async function assertDomainOwned(userId: string, domainId: string) {
  const domain = await prisma.outreachDomain.findUnique({ where: { id: domainId } });
  if (!domain || domain.userId !== userId) throw new OpError("Domain not found", 404);
  return domain;
}

export async function listOutreachDomains(userId: string) {
  return prisma.outreachDomain.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { mailboxes: true } } },
  });
}

/**
 * One-off Stripe Checkout for a domain order (mode=payment, dynamic amount =
 * locked quote + disclosed service fee). Stripe.ts only does subscription
 * checkouts, so this builds the payment-mode session directly against the
 * Stripe form API. Metadata carries kind=domain_order so the webhook canroute
 * completion to completeDomainOrderPaid without touching plan logic.
 */
export async function createDomainCheckout(userId: string, orderId: string, opts: { email?: string } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new OpError("Billing is not configured yet.", 501);
  const order = await prisma.domainOrder.findUnique({ where: { id: orderId }, include: { domain: true } });
  if (!order || order.userId !== userId) throw new OpError("Order not found", 404);
  if (order.status !== "pending_payment") throw new OpError(`Order is ${order.status}, not payable.`, 409);
  if (!order.quotedCentsUsd) throw new OpError("Order has no locked price — request a fresh quote.", 409);

  const total = order.quotedCentsUsd + DOMAIN_SERVICE_FEE_CENTS;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz";
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(total),
    "line_items[0][price_data][product_data][name]": `Domain registration: ${order.domainName} (${order.periodYears}yr)`,
    success_url: `${appUrl}/dashboard?domain=${encodeURIComponent(order.domainName)}`,
    cancel_url: `${appUrl}/dashboard?checkout=cancelled`,
    client_reference_id: userId,
    "metadata[kind]": "domain_order",
    "metadata[userId]": userId,
    "metadata[orderId]": order.id,
  };
  if (opts.email) params.customer_email = opts.email;

  const res = await fetchWithTimeout("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Domain checkout failed", res.status, detail.slice(0, 300));
    throw new OpError("Couldn't start checkout. Please try again.", 502);
  }
  const data = (await res.json().catch(() => null)) as { url?: string; id?: string } | null;
  if (!data?.url || !data?.id) throw new OpError("Couldn't start checkout. Please try again.", 502);
  await prisma.domainOrder.update({
    where: { id: order.id },
    data: { stripeSessionId: data.id },
  });
  return { url: data.url, totalCentsUsd: total };
}

/**
 * Called by the Stripe webhook after checkout.session.completed with
 * metadata.kind = "domain_order". Submits the GoDaddy registration with the
 * order's stored Idempotency-Key (safe to retry: GoDaddy honors the key, and
 * the status gate below makes re-entry a no-op once past "paid").
 */
export async function completeDomainOrderPaid(orderId: string, stripeSessionId: string) {
  const order = await prisma.domainOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`domain order ${orderId} not found`);
  if (order.status !== "pending_payment") return { duplicate: true, status: order.status };
  if (!order.quoteToken) throw new Error(`domain order ${orderId} has no quote token`);

  await prisma.domainOrder.update({
    where: { id: order.id },
    data: { status: "paid", stripeSessionId },
  });

  // Re-quote if the 10-minute lock lapsed between quote and payment.
  let quoteToken = order.quoteToken;
  let agreements: string[] = ["API_DPA"];
  try {
    const fresh = await requestQuote(order.domainName, { period: order.periodYears });
    quoteToken = fresh.quoteToken;
    if (fresh.requiredAgreements.length > 0) agreements = fresh.requiredAgreements;
    await prisma.domainOrder.update({ where: { id: order.id }, data: { quoteToken } });
  } catch (e) {
    console.warn(`[outreach] re-quote failed for ${order.domainName}, using stored token`, e);
  }

  const submitted = await submitRegistration({
    quoteToken,
    domain: order.domainName,
    period: order.periodYears,
    agreementTypes: agreements,
    idempotencyKey: order.idempotencyKey,
  });
  const providerOp = submitted.operationUrl ?? submitted.operationId;
  await prisma.domainOrder.update({
    where: { id: order.id },
    data: { status: "registering", providerOp },
  });
  if (order.domainId) {
    await prisma.outreachDomain.update({
      where: { id: order.domainId },
      data: { status: "registering", godaddyOrderId: submitted.operationId },
    });
  }
  return { duplicate: false, status: "registering" as const };
}

/** Publish SPF + DMARC on a GoDaddy-managed domain (DKIM follows once the mailbox provider issues its selector target). */
export async function publishDomainDns(userId: string, domainId: string) {
  const domain = await assertDomainOwned(userId, domainId);
  if (domain.provider !== "godaddy") throw new OpError("DNS publish only applies to GoDaddy domains.", 400);
  if (!isGoDaddyConfigured()) throw new OpError("Domain purchase is not configured (GODADDY_PAT missing).", 501);
  const spf = buildSpfRecord(["_spf.google.com"]);
  const dmarc = buildDmarcRecord("none", `postmaster@${domain.domain}`);
  await setDnsRecords(domain.domain, "TXT", "@", [{ data: spf.value }]);
  await setDnsRecords(domain.domain, "TXT", "_dmarc", [{ data: dmarc.value }]);
  return { spf: spf.value, dmarc: dmarc.value };
}

/** Re-resolve live DNS and snapshot the result onto the domain row. */
export async function verifyDomainDnsJob(userId: string, domainId: string) {
  const domain = await assertDomainOwned(userId, domainId);
  const verification = await verifyDomainDns(domain.domain);
  const ready = verification.spf && verification.dkim && verification.dmarc;
  const updated = await prisma.outreachDomain.update({
    where: { id: domain.id },
    data: {
      dnsVerifiedAt: ready ? new Date() : domain.dnsVerifiedAt,
      dnsDetail: verification as unknown as Record<string, string>,
      status: ready ? "active" : domain.status === "active" ? "dns_pending" : domain.status,
    },
  });
  return { verification, status: updated.status };
}

/* ── Mailboxes ───────────────────────────────────────────────────────────── */

async function assertMailboxOwned(userId: string, mailboxId: string) {
  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId }, include: { domain: true } });
  if (!mailbox || mailbox.userId !== userId) throw new OpError("Mailbox not found", 404);
  return mailbox;
}

function mailboxDomainOk(domain: { status: string; quarantined: boolean }): string | null {
  if (domain.quarantined) return "Domain is quarantined — clear the reputation hold first.";
  if (domain.status === "pending_payment" || domain.status === "registering" || domain.status === "failed")
    return `Domain is ${domain.status} — wait for registration to complete.`;
  return null;
}

export interface MailboxOrderInput {
  domainId: string;
  count: number;
  platform?: "google" | "microsoft";
  localParts?: string[];
  sequencerTarget?: string;
}

/**
 * Order DFY inboxes on a verified domain. Creates the MailboxOrder + Mailbox
 * rows (status ordered/provisioning) and submits to PremiumInboxes (API mode)
 * or stores the intake CSV for manual fulfillment (manual mode). Mailbox
 * credentials are never handled here — the provider owns them end to end.
 */
export async function orderMailboxes(userId: string, input: MailboxOrderInput) {
  const platform = input.platform ?? "google";
  if (!isMailboxPlatform(platform)) throw new OpError("platform must be google or microsoft", 400);
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50)
    throw new OpError("count must be 1–50 per order", 400);

  const domain = await assertDomainOwned(userId, input.domainId);
  const blocked = mailboxDomainOk(domain);
  if (blocked) throw new OpError(blocked, 409);

  const localParts = (input.localParts ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean);
  for (const l of localParts) {
    if (!/^[a-z0-9._-]{1,64}$/.test(l)) throw new OpError(`bad local part: ${l}`, 400);
  }
  if (localParts.length > input.count) throw new OpError("more local parts than inboxes", 400);

  const emails: string[] = [];
  for (let i = 0; i < input.count; i++) {
    const local = localParts[i] ?? DEFAULT_LOCAL_PARTS[i % DEFAULT_LOCAL_PARTS.length];
    const email = normalizeEmailAddr(`${local === "hello" && i >= DEFAULT_LOCAL_PARTS.length ? `${local}${i}` : local}@${domain.domain}`);
    if (!email) throw new OpError(`could not build address for local part ${local}`, 400);
    emails.push(email);
  }

  const order: InboxOrder = {
    lines: [{ domain: domain.domain, count: input.count, platform, localParts }],
    sequencerTarget: input.sequencerTarget ?? "scalar",
    customerRef: userId,
  };
  const submitted = await submitInboxOrder(order);

  const providerOrderId =
    submitted.providerOrderId ??
    `manual:${createHash("sha256").update(renderIntakeCsv(order)).digest("hex").slice(0, 16)}`;

  const mailboxOrder = await prisma.mailboxOrder.create({
    data: {
      userId,
      domainId: domain.id,
      platform,
      count: input.count,
      mode: submitted.mode,
      providerOrderId,
      intakeCsv: submitted.mode === "manual" ? renderIntakeCsv(order) : null,
      status: submitted.mode === "api" ? "provisioning" : "ordered",
    },
  });

  const created: Array<{ id: string; email: string }> = [];
  for (const email of emails) {
    try {
      const row = await prisma.mailbox.create({
        data: {
          userId,
          domainId: domain.id,
          email,
          platform,
          provider: "premiuminboxes",
          status: submitted.mode === "api" ? "provisioning" : "ordered",
          dailyCap: 20,
          warmupDay: 0,
        },
        select: { id: true, email: true },
      });
      created.push(row);
    } catch {
      // Duplicate local part across orders — skip, ops confirms the real set.
      continue;
    }
  }

  return {
    order: { id: mailboxOrder.id, mode: submitted.mode, status: mailboxOrder.status, providerOrderId },
    mailboxes: created,
    intakeCsv: submitted.mode === "manual" ? renderIntakeCsv(order) : null,
    nextStep: submitted.nextStep,
  };
}

/**
 * Confirm a fulfilled mailbox order (manual ops confirm, or API-mode poll
 * results): flips the mailbox rows to `warming` day 1. Idempotent on email —
 * re-confirming never duplicates rows.
 */
export async function confirmMailboxOrder(
  userId: string,
  orderId: string,
  emails: string[],
) {
  const order = await prisma.mailboxOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw new OpError("Mailbox order not found", 404);
  if (order.status === "done") return { duplicate: true, mailboxes: [] as string[] };

  const clean = emails.map((e) => normalizeEmailAddr(e)).filter((e): e is string => Boolean(e));
  if (clean.length === 0) throw new OpError("no valid emails to confirm", 400);

  const confirmed: string[] = [];
  for (const email of clean) {
    const row = await prisma.mailbox.upsert({
      where: { userId_email: { userId, email } },
      create: {
        userId,
        domainId: order.domainId,
        email,
        platform: order.platform,
        provider: "premiuminboxes",
        status: "warming",
        dailyCap: 20,
        warmupDay: 1,
      },
      update: { status: "warming", warmupDay: 1, pausedAt: null, pauseWhy: null },
      select: { email: true },
    });
    confirmed.push(row.email);
  }
  await prisma.mailboxOrder.update({ where: { id: order.id }, data: { status: "done" } });
  return { duplicate: false, mailboxes: confirmed };
}

export async function listMailboxes(userId: string) {
  const rows = await prisma.mailbox.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      domain: { select: { domain: true, status: true, quarantined: true, dnsVerifiedAt: true } },
      _count: { select: { warmupDays: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    email: m.email,
    platform: m.platform,
    provider: m.provider,
    status: m.status,
    dailyCap: m.dailyCap,
    sentToday: m.sentToday,
    warmup: warmupSummary({ warmupDay: m.warmupDay, status: m.status, daysLogged: m._count.warmupDays }),
    warmupDay: m.warmupDay,
    readyAt: m.readyAt,
    hardBounces: m.hardBounces,
    complaints: m.complaints,
    pauseWhy: m.pauseWhy,
    domain: m.domain,
  }));
}

export async function pauseMailbox(userId: string, mailboxId: string, why?: string) {
  const mailbox = await assertMailboxOwned(userId, mailboxId);
  if (mailbox.status === "burned") throw new OpError("Burned mailboxes stay retired.", 409);
  const updated = await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: { status: "paused", pausedAt: new Date(), pauseWhy: why?.slice(0, 2000) ?? "paused by user" },
  });
  return { id: updated.id, status: updated.status };
}

export async function resumeMailbox(userId: string, mailboxId: string) {
  const mailbox = await assertMailboxOwned(userId, mailboxId);
  if (mailbox.status === "burned") throw new OpError("Burned mailboxes stay retired.", 409);
  if (mailbox.complaints > 0) throw new OpError("Mailbox has complaints on record — review before resuming.", 409);
  const next = mailbox.warmupDay >= 30 ? "ready" : mailbox.warmupDay > 0 ? "warming" : "ordered";
  const updated = await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: { status: next, pausedAt: null, pauseWhy: null, hardBounces: 0 },
  });
  return { id: updated.id, status: updated.status };
}

/* ── Sequences + enrollments ─────────────────────────────────────────────── */

export async function createSequence(
  userId: string,
  input: { name: string; steps: unknown; requireApproval?: boolean; stopOnReply?: boolean; dailyCap?: number },
) {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new OpError("name is required", 400);
  const steps = parseSequenceSteps(input.steps);
  if (!steps) throw new OpError("steps must be 1–10 valid steps (dayOffset, subject, body)", 400);
  const dailyCap = input.dailyCap ?? 200;
  if (!Number.isInteger(dailyCap) || dailyCap < 1 || dailyCap > 5000)
    throw new OpError("dailyCap must be 1–5000", 400);
  const sequence = await prisma.outreachSequence.create({
    data: {
      userId,
      name,
      steps: steps as unknown as Record<string, string>[],
      requireApproval: input.requireApproval ?? true,
      stopOnReply: input.stopOnReply ?? true,
      dailyCap,
    },
  });
  return { id: sequence.id, name: sequence.name, steps: steps.length };
}

export async function listSequences(userId: string) {
  const rows = await prisma.outreachSequence.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { enrollments: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    requireApproval: s.requireApproval,
    stopOnReply: s.stopOnReply,
    dailyCap: s.dailyCap,
    steps: Array.isArray(s.steps) ? (s.steps as unknown as SequenceStep[]).length : 0,
    enrollments: s._count.enrollments,
    createdAt: s.createdAt,
  }));
}

async function assertSequenceOwned(userId: string, sequenceId: string) {
  const sequence = await prisma.outreachSequence.findUnique({ where: { id: sequenceId } });
  if (!sequence || sequence.userId !== userId) throw new OpError("Sequence not found", 404);
  return sequence;
}

/** True when this address must never be mailed (queue-time AND send-time check). */
export async function isSuppressed(userId: string, email: string): Promise<boolean> {
  const row = await prisma.suppression.findUnique({
    where: { userId_email: { userId, email: email.trim().toLowerCase() } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function addSuppression(
  userId: string,
  email: string,
  reason: "bounce" | "complaint" | "unsubscribe" | "manual",
  source?: string,
) {
  const clean = normalizeEmailAddr(email);
  if (!clean) throw new OpError("invalid email", 400);
  await prisma.suppression.upsert({
    where: { userId_email: { userId, email: clean } },
    create: { userId, email: clean, reason, source: source?.slice(0, 500) },
    update: { reason, source: source?.slice(0, 500) },
  });
  return { email: clean, reason };
}

export async function listSuppressions(userId: string, limit = 200) {
  return prisma.suppression.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

/**
 * Enroll contacts in a sequence. Contacts without an email, with a suppressed
 * address, or already enrolled are REPORTED (not failed) — the caller gets a
 * per-contact verdict so an agent can fix the list instead of guessing.
 */
export async function enrollContacts(
  userId: string,
  sequenceId: string,
  contactIds: string[],
  opts: { actor?: { id: string; label: string } | null } = {},
) {
  void opts;
  const sequence = await assertSequenceOwned(userId, sequenceId);
  if (sequence.status !== "active") throw new OpError("Sequence is not active.", 409);
  const ids = [...new Set(contactIds)].slice(0, 500);
  if (ids.length === 0) throw new OpError("contactIds is required", 400);

  const steps = parseSequenceSteps(sequence.steps) ?? [];
  const firstOffset = steps[0]?.dayOffset ?? 0;

  const enrolled: string[] = [];
  const skipped: Array<{ contactId: string; reason: string }> = [];
  for (const contactId of ids) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.userId !== userId) {
      skipped.push({ contactId, reason: "not found" });
      continue;
    }
    if (!contact.email || !normalizeEmailAddr(contact.email)) {
      skipped.push({ contactId, reason: "no usable email" });
      continue;
    }
    if (await isSuppressed(userId, contact.email)) {
      skipped.push({ contactId, reason: "suppressed" });
      continue;
    }
    try {
      await prisma.sequenceEnrollment.create({
        data: {
          sequenceId: sequence.id,
          contactId: contact.id,
          userId,
          status: "active",
          currentStep: 0,
          nextRunAt: new Date(Date.now() + firstOffset * 24 * 60 * 60 * 1000),
        },
      });
      enrolled.push(contactId);
    } catch {
      skipped.push({ contactId, reason: "already enrolled" });
    }
  }
  return { enrolled, skipped, requireApproval: sequence.requireApproval };
}

/**
 * Human release: approve an enrollment so the scheduler may transmit it.
 * Called ONLY from the session-gated REST approve route — never from MCP
 * (breakup-drafts precedent: agents queue, humans release).
 */
export async function approveEnrollment(userId: string, enrollmentId: string) {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { sequence: true },
  });
  if (!enrollment || enrollment.userId !== userId) throw new OpError("Enrollment not found", 404);
  if (enrollment.status !== "active") throw new OpError(`Enrollment is ${enrollment.status}.`, 409);
  const now = new Date();
  await prisma.$transaction([
    prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { approvedAt: now, nextRunAt: enrollment.nextRunAt < now ? now : enrollment.nextRunAt },
    }),
    prisma.outreachSend.updateMany({
      where: { enrollmentId: enrollment.id, status: "pending_approval" },
      data: { status: "queued" },
    }),
  ]);
  return { id: enrollment.id, approvedAt: now.toISOString() };
}

/* ── Queued single sends ─────────────────────────────────────────────────── */

/**
 * Queue a one-off send (agent-composed or template) as pending_approval.
 * Creates the OutreachSend row FIRST so nothing can transmit without a record,
 * checks suppression at queue time, and stamps variant attribution when the
 * copy came from select_variant. Release is REST-only (approveSend).
 */
export async function queueSingleSend(
  userId: string,
  input: {
    contactId: string;
    subject: string;
    body: string;
    enrollmentId?: string;
    variantId?: string | null;
  },
) {
  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  const to = normalizeEmailAddr(contact.email ?? "");
  if (!to) throw new OpError("Contact has no usable email.", 409);
  if (await isSuppressed(userId, to)) throw new OpError("Address is suppressed — cannot queue.", 409);

  const subject = input.subject.trim().slice(0, 500);
  const body = input.body.trim().slice(0, 50_000);
  if (!subject || !body) throw new OpError("subject and body are required", 400);

  if (input.enrollmentId) {
    const enrollment = await prisma.sequenceEnrollment.findUnique({ where: { id: input.enrollmentId } });
    if (!enrollment || enrollment.userId !== userId) throw new OpError("Enrollment not found", 404);
  }

  const send = await prisma.outreachSend.create({
    data: {
      userId,
      contactId: contact.id,
      enrollmentId: input.enrollmentId ?? null,
      toAddr: to,
      fromAddr: "",
      subject,
      body,
      step: 0,
      variantId: input.variantId ?? null,
      status: "pending_approval",
    },
    select: { id: true, status: true },
  });
  return send;
}

/** Human release for a single queued send (session-gated route only). */
export async function approveSend(userId: string, sendId: string) {
  const send = await prisma.outreachSend.findUnique({ where: { id: sendId } });
  if (!send || send.userId !== userId) throw new OpError("Send not found", 404);
  if (send.status !== "pending_approval") throw new OpError(`Send is ${send.status}.`, 409);
  if (await isSuppressed(userId, send.toAddr)) throw new OpError("Address is suppressed — cannot release.", 409);
  const updated = await prisma.outreachSend.update({
    where: { id: send.id },
    data: { status: "queued" },
  });
  return { id: updated.id, status: updated.status };
}

/**
 * Metered-send preflight shared by the scheduler: gate on credits BEFORE any
 * provider cost is incurred (house policy — 402 before paid work, debit only
 * on success via spendCredits after Bird accepts).
 */
export async function gateSendCredits(userId: string, warmup: boolean): Promise<void> {
  await ensureCredits(userId, warmup ? "outreach_warmup" : "outreach_send");
}
