// Agent outreach mailboxes — transmission engine (Card 0015).
//
// Everything that actually MOVES mail: the due-send scheduler, the warmup
// tick, domain-registration polling, AgentMail reply polling, the Bird webhook
// intake, and test sends. Called by inngest (ticks), REST (approve/test), and
// the Bird webhook route. Reads/writes only through Prisma + the provider
// clients; credit policy is enforced here (gate BEFORE provider cost, debit
// only AFTER the provider accepts — same rule as every metered action).

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { OpError, logOutreach, saveEmail } from "@/lib/crm-operations";
import { ensureCredits, spendCredits } from "@/lib/credits";
import { pickMailbox, type RotationCandidate } from "@/lib/outreach/rotation";
import {
  targetForDay,
  isRampComplete,
  evaluateWarmupDay,
  type WarmupSignals,
} from "@/lib/outreach/warmup";
import { parseSequenceSteps, type SequenceStep } from "@/lib/outreach/types";
import { sendMarketingEmail, isBirdConfigured, parseBirdWebhook, type BirdWebhookEvent } from "@/lib/outreach/bird";
import { pollOperation, setDnsRecords, isGoDaddyConfigured } from "@/lib/outreach/godaddy";
import { buildSpfRecord, buildDmarcRecord } from "@/lib/outreach/dns";
import { getThreadsForContact } from "@/lib/agentmail";
import { selectVariant, attributeReply } from "@/lib/variant-operations";
import { notifyTaskWebhook } from "@/lib/notify";
import { isSuppressed, addSuppression } from "@/lib/outreach-operations";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AUTO_HARD_BOUNCES = 5;

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz").replace(/\/$/, "");
}

/** One-click unsubscribe URL baked into every cold send (Gmail bulk-sender rule). */
export function unsubscribeUrlFor(sendId: string): string {
  return `${appUrl()}/api/outreach/unsubscribe?send=${encodeURIComponent(sendId)}`;
}

function warmupSeeds(): string[] {
  return (process.env.WARMUP_SEED_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/* ── Copy rendering ──────────────────────────────────────────────────────── */

interface RenderContact {
  name: string | null;
  company: string | null;
}

/** {{firstName}} {{company}} tokens from the contact; unknown → "". Never invents data. */
export function renderTemplate(template: string, contact: RenderContact): string {
  const firstName = (contact.name ?? "").trim().split(/\s+/)[0] ?? "";
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
    .replace(/\{\{\s*company\s*\}\}/gi, (contact.company ?? "").trim())
    .replace(/\{\{\s*name\s*\}\}/gi, (contact.name ?? "").trim());
}

/** Apply an opener variant to a step body: {{opener}} slot, else first-line prepend. */
export function applyOpener(body: string, opener: string): string {
  if (/\{\{\s*opener\s*\}\}/i.test(body)) return body.replace(/\{\{\s*opener\s*\}\}/gi, opener);
  return `${opener}\n\n${body}`;
}

async function resolveStepCopy(
  userId: string,
  step: SequenceStep,
  contact: RenderContact,
): Promise<{ subject: string; body: string; variantId: string | null }> {
  let subject = renderTemplate(step.subject, contact);
  let body = renderTemplate(step.body, contact);
  let variantId: string | null = null;
  if (step.variantKind) {
    try {
      const picked = await selectVariant(userId, {
        kind: step.variantKind === "subject" ? "SUBJECT" : "OPENER",
        segmentId: null,
      });
      variantId = picked.id;
      if (step.variantKind === "subject") subject = picked.text;
      else body = applyOpener(body, picked.text);
    } catch {
      // Empty pool (or bandit error) degrades to the literal template copy —
      // a missing experiment must never block a scheduled send.
    }
  }
  return { subject, body, variantId };
}

/* ── Rotation inputs ─────────────────────────────────────────────────────── */

async function rotationCandidates(userId: string): Promise<RotationCandidate[]> {
  const mailboxes = await prisma.mailbox.findMany({
    where: { userId, status: { in: ["ready", "warming"] } },
    include: { domain: { select: { quarantined: true } } },
  });
  return mailboxes.map((m) => ({
    id: m.id,
    email: m.email,
    domainId: m.domainId,
    status: m.status,
    warmupDay: m.warmupDay,
    dailyCap: m.dailyCap,
    sentToday: m.sentToday,
    capDay: m.capDay.toISOString().slice(0, 10),
    hardBounces: m.hardBounces,
    complaints: m.complaints,
    domainQuarantined: m.domain.quarantined,
  }));
}

/* ── Transmit one queued send row ────────────────────────────────────────── */

interface TransmitOutcome {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

/**
 * Transmit an OutreachSend row (status queued → sent/failed). Claims the row
 * first (claimKey unique) so concurrent ticks can't double-send; gates credits
 * before calling Bird; debits only after Bird accepts. Suppression is
 * re-checked here (queue-time was earlier — a lot changes between the two).
 */
export async function transmitSend(sendId: string): Promise<TransmitOutcome> {
  const claimKey = randomUUID();
  const claimed = await prisma.outreachSend.updateMany({
    where: { id: sendId, status: "queued", claimKey: null },
    data: { claimKey },
  });
  if (claimed.count === 0) return { ok: false, messageId: null, error: "already claimed" };

  const send = await prisma.outreachSend.findUnique({
    where: { id: sendId },
    include: { contact: true },
  });
  if (!send) return { ok: false, messageId: null, error: "send vanished after claim" };

  const fail = async (why: string): Promise<TransmitOutcome> => {
    await prisma.outreachSend.update({ where: { id: send.id }, data: { status: "failed", failureWhy: why } });
    return { ok: false, messageId: null, error: why };
  };

  if (!isBirdConfigured()) return fail("Bird is not configured (BIRD_API_KEY missing).");
  if (!send.contact && !send.isWarmup) return fail("send has no contact and is not a warmup probe");
  if (!send.isWarmup && send.contact && (await isSuppressed(send.userId, send.toAddr)))
    return fail("suppressed since queue time");

  const candidates = await rotationCandidates(send.userId);
  const pick = pickMailbox(candidates);
  if (!pick) return fail("fleet exhausted — no eligible mailbox under cap");

  if (!send.isWarmup) await ensureCredits(send.userId, "outreach_send");
  else await ensureCredits(send.userId, "outreach_warmup");

  let messageId: string;
  try {
    const sent = await sendMarketingEmail(
      {
        from: pick.email,
        to: send.toAddr,
        subject: send.subject,
        text: send.body,
        replyTo: pick.email,
      },
      { unsubscribeUrl: unsubscribeUrlFor(send.id) },
    );
    messageId = sent.messageId;
  } catch (e) {
    const why = e instanceof Error ? e.message.slice(0, 500) : "Bird send failed";
    return fail(why);
  }

  await spendCredits(send.userId, send.isWarmup ? "outreach_warmup" : "outreach_send");
  const now = new Date();
  const today = todayStr();

  // UTC-day rollover: when the counter belongs to a previous day it resets to
  // 1 instead of incrementing yesterday's total — one read + one write.
  const counter = await prisma.mailbox.findUnique({ where: { id: pick.mailboxId }, select: { capDay: true } });
  const rolled = !counter || counter.capDay.toISOString().slice(0, 10) !== today;

  await prisma.$transaction([
    prisma.outreachSend.update({
      where: { id: send.id },
      data: { mailboxId: pick.mailboxId, fromAddr: pick.email, status: "sent", sentAt: now, providerMessageId: messageId },
    }),
    prisma.mailbox.update({
      where: { id: pick.mailboxId },
      data: rolled
        ? { sentToday: 1, capDay: new Date(`${today}T00:00:00.000Z`) }
        : { sentToday: { increment: 1 } },
    }),
  ]);

  if (send.isWarmup) {
    // Attribute the probe to today's warmup ledger row for the ramp audit.
    await prisma.mailboxWarmupDay.updateMany({
      where: { mailboxId: pick.mailboxId, day: send.step },
      data: { sent: { increment: 1 } },
    });
  } else if (send.contact) {
    await saveEmail(send.userId, {
      contactId: send.contact.id,
      direction: "OUTBOUND",
      subject: send.subject,
      body: send.body,
      fromAddr: pick.email,
      toAddr: send.toAddr,
      sentAt: now,
    });
    await logOutreach(send.userId, {
      contactId: send.contact.id,
      summary: `Cold email via ${pick.email}: ${send.subject}`.slice(0, 5000),
      channel: "email",
      variantId: send.variantId,
    });
  }

  return { ok: true, messageId, error: null };
}

/* ── Due-send scheduler ──────────────────────────────────────────────────── */

export interface DueSendsReport {
  transmitted: number;
  failed: number;
  skipped: number;
  fleetExhausted: boolean;
}

/**
 * Fire due enrollments (active + human-approved + nextRunAt passed). Runs on
 * the 15-min inngest tick. Guardrails per enrollment: sequence active, contact
 * email usable, suppression clean, no live send already for this step,
 * sequence daily cap unhit. Stops early when the fleet is exhausted (caps are
 * reputation, not suggestions).
 */
export async function processDueSends(opts: { limit?: number } = {}): Promise<DueSendsReport> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const report: DueSendsReport = { transmitted: 0, failed: 0, skipped: 0, fleetExhausted: false };
  const now = new Date();

  const due = await prisma.sequenceEnrollment.findMany({
    where: { status: "active", approvedAt: { not: null }, nextRunAt: { lte: now } },
    include: { sequence: true, contact: true },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });

  for (const enrollment of due) {
    if (enrollment.sequence.status !== "active" || enrollment.sequence.userId !== enrollment.userId) {
      report.skipped += 1;
      continue;
    }
    const steps = parseSequenceSteps(enrollment.sequence.steps);
    if (!steps || enrollment.currentStep >= steps.length) {
      await prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed" } });
      report.skipped += 1;
      continue;
    }
    const email = enrollment.contact.email ?? "";
    if (!email || (await isSuppressed(enrollment.userId, email))) {
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "unsubscribed", stopReason: "unsubscribe" },
      });
      report.skipped += 1;
      continue;
    }

    const sentToday = await prisma.outreachSend.count({
      where: {
        userId: enrollment.userId,
        enrollment: { sequenceId: enrollment.sequenceId },
        sentAt: { gte: startOfTodayUtc() },
      },
    });
    if (sentToday >= enrollment.sequence.dailyCap) {
      report.skipped += 1;
      continue;
    }

    const live = await prisma.outreachSend.findFirst({
      where: {
        enrollmentId: enrollment.id,
        step: enrollment.currentStep,
        status: { in: ["queued", "sent", "delivered"] },
      },
      select: { id: true },
    });
    if (live) {
      report.skipped += 1;
      continue;
    }

    const step = steps[enrollment.currentStep];
    const copy = await resolveStepCopy(enrollment.userId, step, {
      name: enrollment.contact.name,
      company: enrollment.contact.company,
    });

    const created = await prisma.outreachSend.create({
      data: {
        userId: enrollment.userId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contact.id,
        toAddr: email.trim().toLowerCase(),
        fromAddr: "",
        subject: copy.subject,
        body: copy.body,
        step: enrollment.currentStep,
        variantId: copy.variantId,
        status: "queued",
      },
      select: { id: true },
    });

    const outcome = await transmitSend(created.id);
    if (!outcome.ok && outcome.error === "fleet exhausted — no eligible mailbox under cap") {
      await prisma.outreachSend.delete({ where: { id: created.id } }).catch(() => {});
      report.fleetExhausted = true;
      break;
    }
    if (!outcome.ok) {
      report.failed += 1;
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { nextRunAt: new Date(now.getTime() + 6 * 60 * 60 * 1000) },
      });
      continue;
    }

    report.transmitted += 1;
    const isLast = enrollment.currentStep >= steps.length - 1;
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: isLast
        ? { status: "completed" }
        : {
            currentStep: enrollment.currentStep + 1,
            nextRunAt: new Date(now.getTime() + Math.max(steps[enrollment.currentStep + 1].dayOffset, 0) * DAY_MS),
          },
    });
  }

  return report;
}

/** Transmit stale queued rows (human-approved singles + released enrollment sends). */
export async function processQueuedSends(opts: { limit?: number } = {}): Promise<DueSendsReport> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const report: DueSendsReport = { transmitted: 0, failed: 0, skipped: 0, fleetExhausted: false };
  const rows = await prisma.outreachSend.findMany({
    where: { status: "queued", claimKey: null },
    orderBy: { queuedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const row of rows) {
    const outcome = await transmitSend(row.id);
    if (!outcome.ok && outcome.error === "fleet exhausted — no eligible mailbox under cap") {
      report.fleetExhausted = true;
      break;
    }
    if (outcome.ok) report.transmitted += 1;
    else if (outcome.error === "already claimed") report.skipped += 1;
    else report.failed += 1;
  }
  return report;
}

/* ── Warmup tick ─────────────────────────────────────────────────────────── */

const WARMUP_PROBE_SUBJECTS = [
  "Quick hello — testing my new inbox",
  "Checking in — did this land in primary?",
  "A short note (deliverability check)",
];

const WARMUP_PROBE_BODIES = [
  "Hi there — setting up a new sending inbox and checking delivery. A quick reply (even 'got it') helps a lot. Thanks!",
  "Hello! This is a deliverability check from a brand-new mailbox. If you see this in primary, a one-word reply would be wonderful.",
  "Morning — new inbox, making sure mail lands where it should. Reply 'received' if you get a moment?",
];

export interface WarmupTickReport {
  mailboxes: number;
  probesSent: number;
  advanced: number;
  held: number;
  regressed: number;
  ready: number;
  skippedNoSeeds: boolean;
}

/**
 * Daily warmup tick. For each warming mailbox: ensure today's ledger row,
 * send ramp probes to seed addresses (never to prospects), then evaluate the
 * closed day and advance/hold/regress. Without WARMUP_SEED_ADDRESSES the tick
 * holds honestly — fake engagement is reputation fraud, never simulated.
 */
export async function tickWarmup(): Promise<WarmupTickReport> {
  const report: WarmupTickReport = {
    mailboxes: 0, probesSent: 0, advanced: 0, held: 0, regressed: 0, ready: 0, skippedNoSeeds: false,
  };
  const seeds = warmupSeeds();
  const mailboxes = await prisma.mailbox.findMany({ where: { status: "warming" } });
  report.mailboxes = mailboxes.length;
  if (mailboxes.length === 0) return report;
  if (seeds.length === 0) {
    report.skippedNoSeeds = true;
    return report;
  }

  for (const mailbox of mailboxes) {
    const day = Math.max(mailbox.warmupDay, 1);
    const target = targetForDay(day);

    let ledger = await prisma.mailboxWarmupDay.findUnique({
      where: { mailboxId_day: { mailboxId: mailbox.id, day } },
    });
    if (!ledger) {
      ledger = await prisma.mailboxWarmupDay.create({
        data: { mailboxId: mailbox.id, day, target },
      });
    }

    const probesToday = await prisma.outreachSend.count({
      where: { mailboxId: mailbox.id, isWarmup: true, sentAt: { gte: startOfTodayUtc() } },
    });
    let toSend = Math.max(target - probesToday, 0);
    let seedIdx = 0;
    while (toSend > 0) {
      const seed = seeds[seedIdx % seeds.length];
      seedIdx += 1;
      const templateIdx = (ledger.sent + seedIdx) % WARMUP_PROBE_SUBJECTS.length;
      const created = await prisma.outreachSend.create({
        data: {
          userId: mailbox.userId,
          mailboxId: mailbox.id,
          isWarmup: true,
          toAddr: seed,
          fromAddr: "",
          subject: WARMUP_PROBE_SUBJECTS[templateIdx],
          body: WARMUP_PROBE_BODIES[templateIdx],
          step: day,
          status: "queued",
        },
        select: { id: true },
      });
      const outcome = await transmitSend(created.id);
      if (!outcome.ok && outcome.error === "fleet exhausted — no eligible mailbox under cap") {
        await prisma.outreachSend.delete({ where: { id: created.id } }).catch(() => {});
        break;
      }
      if (outcome.ok) {
        report.probesSent += 1;
        toSend -= 1;
      } else {
        break;
      }
      if (seedIdx > target + 5) break;
    }

    const fresh = await prisma.mailboxWarmupDay.findUnique({
      where: { mailboxId_day: { mailboxId: mailbox.id, day } },
    });
    const signals: WarmupSignals = {
      sent: (fresh?.sent ?? 0) + probesToday,
      opened: fresh?.opened ?? 0,
      replied: fresh?.replied ?? 0,
      bounced: fresh?.bounced ?? 0,
      placement: (fresh?.placement as WarmupSignals["placement"]) ?? "unknown",
    };
    const priorSpam = fresh?.placement === "spam" ? 1 : 0;

    if (signals.sent < target) {
      report.held += 1;
      continue;
    }
    const verdict = evaluateWarmupDay(day, signals, priorSpam);
    if (verdict.action === "regress" || verdict.needsReview) {
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { status: "paused", pausedAt: new Date(), pauseWhy: verdict.reason, warmupDay: 1 },
      });
      report.regressed += 1;
    } else if (verdict.action === "hold") {
      report.held += 1;
    } else if (isRampComplete(day)) {
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { status: "ready", readyAt: new Date() },
      });
      report.ready += 1;
    } else {
      await prisma.mailbox.update({ where: { id: mailbox.id }, data: { warmupDay: day + 1 } });
      report.advanced += 1;
    }
  }
  return report;
}

/* ── Domain registration polling ─────────────────────────────────────────── */

export interface DomainPollReport {
  checked: number;
  completed: number;
  failed: number;
}

/** Advance GoDaddy registrations to terminal state; on success publish SPF+DMARC and move to dns_pending. */
export async function pollDomainOrders(): Promise<DomainPollReport> {
  const report: DomainPollReport = { checked: 0, completed: 0, failed: 0 };
  if (!isGoDaddyConfigured()) return report;
  const orders = await prisma.domainOrder.findMany({
    where: { status: "registering" },
    include: { domain: true },
    take: 25,
  });
  for (const order of orders) {
    if (!order.providerOp) continue;
    report.checked += 1;
    let status: string;
    try {
      const polled = await pollOperation(order.providerOp);
      status = polled.status;
      if (status === "FAILED") {
        await prisma.domainOrder.update({
          where: { id: order.id },
          data: { status: "failed", failureWhy: polled.detail?.slice(0, 2000) ?? "registration failed" },
        });
        if (order.domainId) {
          await prisma.outreachDomain.update({ where: { id: order.domainId }, data: { status: "failed" } });
        }
        report.failed += 1;
        continue;
      }
      if (status !== "COMPLETED") continue;
    } catch (e) {
      console.warn(`[outreach] domain poll failed for ${order.domainName}`, e);
      continue;
    }
    await prisma.domainOrder.update({ where: { id: order.id }, data: { status: "done" } });
    if (order.domain) {
      try {
        const spf = buildSpfRecord(["_spf.google.com"]);
        const dmarc = buildDmarcRecord("none", `postmaster@${order.domain.domain}`);
        await setDnsRecords(order.domain.domain, "TXT", "@", [{ data: spf.value }]);
        await setDnsRecords(order.domain.domain, "TXT", "_dmarc", [{ data: dmarc.value }]);
      } catch (e) {
        console.warn(`[outreach] DNS publish failed for ${order.domain.domain}`, e);
      }
      await prisma.outreachDomain.update({
        where: { id: order.domain.id },
        data: { status: "dns_pending", registeredAt: new Date() },
      });
    }
    report.completed += 1;
  }
  return report;
}

/* ── Reply detection via AgentMail ───────────────────────────────────────── */

export interface ReplyPollReport {
  users: number;
  replies: number;
}

/**
 * Stop-on-reply enforcement for operators with an AgentMail key: match each
 * actively-sending contact's threads; a thread updated after our last send is
 * a reply (the existing thread matcher, reused — never a new fuzzy heuristic).
 * Upgrades CONTACTED → REPLIED only (never downgrades a further-along deal),
 * attributes the reply to the bandit variant, logs activity, and wakes the
 * operator's agent webhook.
 */
export async function pollRepliesViaAgentMail(): Promise<ReplyPollReport> {
  const report: ReplyPollReport = { users: 0, replies: 0 };
  const users = await prisma.user.findMany({
    where: { agentMailApiKey: { not: null } },
    select: { id: true, agentMailApiKey: true, taskWebhookUrl: true },
    take: 200,
  });
  for (const user of users) {
    const key = user.agentMailApiKey;
    if (!key) continue;
    report.users += 1;
    const enrollments = await prisma.sequenceEnrollment.findMany({
      where: { userId: user.id, status: "active", approvedAt: { not: null } },
      include: {
        contact: { select: { id: true, email: true, status: true, name: true } },
        sequence: { select: { id: true, stopOnReply: true } },
      },
      take: 100,
    });
    for (const enrollment of enrollments) {
      const email = enrollment.contact.email;
      if (!email) continue;
      const lastSend = await prisma.outreachSend.findFirst({
        where: { enrollmentId: enrollment.id, sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });
      if (!lastSend?.sentAt) continue;
      let threads: Array<{ updatedAt?: string }> = [];
      try {
        threads = await getThreadsForContact(key, email, 10);
      } catch (e) {
        console.warn(`[outreach] agentmail reply poll failed for enrollment ${enrollment.id}`, e);
        continue;
      }
      const replied = threads.some((t) => {
        if (!t.updatedAt) return false;
        const ts = new Date(t.updatedAt).getTime();
        return Number.isFinite(ts) && ts > lastSend.sentAt!.getTime();
      });
      if (!replied) continue;

      report.replies += 1;
      const upgrade =
        enrollment.contact.status === "CONTACTED" ||
        enrollment.contact.status === "NEW" ||
        enrollment.contact.status === "ENRICHED";
      await prisma.$transaction([
        prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: enrollment.sequence.stopOnReply ? "replied" : enrollment.status,
            stopReason: enrollment.sequence.stopOnReply ? "reply" : null,
          },
        }),
        ...(upgrade
          ? [prisma.contact.update({ where: { id: enrollment.contact.id }, data: { status: "REPLIED" } })]
          : []),
        prisma.activity.create({
          data: {
            userId: user.id,
            contactId: enrollment.contact.id,
            kind: "reply",
            channel: "email",
            body: `Reply detected on the outreach thread (via connected inbox). Sequence ${enrollment.sequence.stopOnReply ? "paused" : "continues"} (stop-on-reply ${enrollment.sequence.stopOnReply ? "on" : "off"}).`,
          },
        }),
      ]);
      await attributeReply(enrollment.contact.id).catch(() => {});
      await prisma.outreachSend.updateMany({
        where: { enrollmentId: enrollment.id, repliedAt: null, sentAt: { not: null } },
        data: { status: "replied", repliedAt: new Date() },
      });
      await notifyTaskWebhook(user.taskWebhookUrl, {
        event: "outreach.reply",
        taskId: enrollment.sequence.id,
        name: enrollment.contact.name ?? enrollment.contact.email ?? "reply",
        query: "",
        created: 1,
        items: [{ id: enrollment.contact.id, kind: "contact" }],
        completedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }
  return report;
}

/* ── Bird webhook intake ─────────────────────────────────────────────────── */

async function autoPauseMailbox(mailboxId: string, why: string): Promise<void> {
  await prisma.mailbox.update({
    where: { id: mailboxId },
    data: { status: "paused", pausedAt: new Date(), pauseWhy: why.slice(0, 2000) },
  });
}

/**
 * Apply one parsed Bird delivery event. Correlates by providerMessageId;
 * unknown ids are logged and ignored (never throw on provider noise).
 * Warmup probes route to the warmup ledger; prospect sends route to the
 * enrollment/contact state machine. Complaints pause the mailbox immediately;
 * hard-bounce streaks pause at the threshold — the domain is worth more than
 * any single send.
 */
export async function handleBirdEvent(event: BirdWebhookEvent): Promise<{ handled: boolean }> {
  if (!event.messageId) {
    console.warn("[outreach] bird event without message id ignored");
    return { handled: false };
  }
  const send = await prisma.outreachSend.findFirst({
    where: { providerMessageId: event.messageId },
    include: { enrollment: { include: { sequence: true } }, mailbox: true, contact: true },
  });
  if (!send) {
    console.warn("[outreach] bird event for unknown message ignored");
    return { handled: false };
  }

  const now = new Date();
  switch (event.event) {
    case "delivered":
      await prisma.outreachSend.update({
        where: { id: send.id },
        data: { status: "delivered", deliveredAt: now },
      });
      break;
    case "opened":
      await prisma.outreachSend.update({ where: { id: send.id }, data: { openedAt: now } });
      if (send.isWarmup && send.mailboxId) {
        const day = send.step;
        await prisma.mailboxWarmupDay.updateMany({
          where: { mailboxId: send.mailboxId, day },
          data: { opened: { increment: 1 }, sent: { increment: 0 } },
        });
      }
      break;
    case "bounced": {
      await prisma.outreachSend.update({ where: { id: send.id }, data: { status: "bounced" } });
      if (send.isWarmup && send.mailboxId) {
        await prisma.mailboxWarmupDay.updateMany({
          where: { mailboxId: send.mailboxId, day: send.step },
          data: { bounced: { increment: 1 } },
        });
      } else {
        if (send.contact) {
          await addSuppression(send.userId, send.toAddr, "bounce", `bird:${event.messageId}`).catch(() => {});
        }
        if (send.enrollmentId) {
          await prisma.sequenceEnrollment.update({
            where: { id: send.enrollmentId },
            data: { status: "bounced", stopReason: "bounce" },
          });
        }
      }
      if (send.mailboxId && event.bounceKind !== "soft") {
        const mailbox = await prisma.mailbox.update({
          where: { id: send.mailboxId },
          data: { hardBounces: { increment: 1 } },
        });
        if (mailbox.hardBounces >= MAX_AUTO_HARD_BOUNCES && mailbox.status !== "paused") {
          await autoPauseMailbox(mailbox.id, `auto-paused: ${mailbox.hardBounces} hard bounces`);
        }
      }
      break;
    }
    case "complained": {
      await prisma.outreachSend.update({ where: { id: send.id }, data: { status: "complained" } });
      if (!send.isWarmup && send.contact) {
        await addSuppression(send.userId, send.toAddr, "complaint", `bird:${event.messageId}`).catch(() => {});
        if (send.enrollmentId) {
          await prisma.sequenceEnrollment.update({
            where: { id: send.enrollmentId },
            data: { status: "unsubscribed", stopReason: "unsubscribe" },
          });
        }
      }
      if (send.mailboxId) {
        await prisma.mailbox.update({ where: { id: send.mailboxId }, data: { complaints: { increment: 1 } } });
        await autoPauseMailbox(send.mailboxId, "auto-paused: spam complaint — review copy and targeting");
      }
      break;
    }
    case "rejected":
      // Bird suppressed this recipient on its side (bounce/complaint/unsub
      // history). Mirror into our list so we never try again from any rail.
      await prisma.outreachSend.update({ where: { id: send.id }, data: { status: "skipped", failureWhy: "rejected by Bird suppression" } });
      if (!send.isWarmup && send.contact) {
        await addSuppression(send.userId, send.toAddr, "bounce", `bird:rejected:${event.messageId}`).catch(() => {});
      }
      break;
    case "deferred":
    case "clicked":
    case "unknown":
      break;
  }
  return { handled: true };
}

/** Parse + apply a raw Bird webhook payload in one call (the route's job is auth only). */
export async function ingestBirdWebhook(payload: unknown): Promise<{ handled: boolean }> {
  return handleBirdEvent(parseBirdWebhook(payload));
}

/* ── Test sends ──────────────────────────────────────────────────────────── */

/**
 * Send a test email to the operator's OWN account address. The recipient MUST
 * equal the user's account email — this path can never be aimed at a prospect,
 * so it needs no approval. Proves the Bird rail + DNS end to end before cold
 * volume. Metered like a normal send.
 */
export async function sendTestEmail(
  userId: string,
  input: { subject: string; body: string },
): Promise<{ messageId: string }> {
  if (!isBirdConfigured()) throw new OpError("Email sending is not configured (BIRD_API_KEY missing).", 501);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) throw new OpError("Account has no email for a test send.", 409);
  const subject = input.subject.trim().slice(0, 500);
  const body = input.body.trim().slice(0, 50_000);
  if (!subject || !body) throw new OpError("subject and body are required", 400);

  const candidates = await rotationCandidates(userId);
  const withReady = candidates.filter((c) => c.status === "ready");
  const pick = pickMailbox(withReady.length > 0 ? withReady : candidates);
  if (!pick) throw new OpError("No mailbox available — order and warm a mailbox first.", 409);

  await ensureCredits(userId, "outreach_send");
  const sent = await sendMarketingEmail(
    { from: pick.email, to: user.email, subject, text: body, replyTo: pick.email },
    { unsubscribeUrl: `${appUrl()}/api/outreach/unsubscribe` },
  );
  await spendCredits(userId, "outreach_send");
  return { messageId: sent.messageId };
}
