// Internal API surface for the voice agent worker (agents/voice).
//
// WHY THIS EXISTS
//   The worker is a separate always-on deployment and deliberately holds no
//   DATABASE_URL and no Clerk keys: a process with a shell-adjacent runtime,
//   network egress AND database credentials is exfiltration-shaped. Instead it
//   reaches the CRM only through these handlers, authenticated with one shared
//   secret, so its blast radius is exactly this file's surface and nothing
//   more.
//
// CONTRACT RULES (the worker's client, agents/voice/src/tenant.ts, relies on
// these; change them together or not at all):
//   - Auth is the x-scalar-internal-secret header, compared timing-safe.
//   - The worker retries 5xx up to 3 times and never retries 4xx, so every
//     handler here must be idempotent keyed on the room name.
//     VoiceCall.livekitRoomName is @unique for exactly this.
//   - tenantId may be null only on a refused call whose job metadata was
//     unreadable; those resolve by roomName instead.
//   - Dates cross the wire as ISO strings.

import { timingSafeEqual } from "node:crypto";
import type { Prisma, VoiceCallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { enqueueTask } from "@/lib/tasks";

/* --------------------------------- auth --------------------------------- */

export function isInternalApiConfigured(): boolean {
  return Boolean(process.env.SCALAR_INTERNAL_SECRET?.trim());
}

/** Throws unless the request carries the shared worker secret. 501 when the
 *  integration is not configured at all, 403 on a wrong secret; both are 4xx
 *  or treated as terminal by the worker, so neither is retried into a storm. */
export function requireInternalAuth(req: Request): void {
  const expected = process.env.SCALAR_INTERNAL_SECRET?.trim();
  if (!expected) throw new OpError("Internal API is not configured (SCALAR_INTERNAL_SECRET).", 501);
  const got = req.headers.get("x-scalar-internal-secret") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual demands equal lengths; comparing against self on mismatch
  // keeps the comparison constant-time without leaking the expected length.
  const ok = a.length === b.length ? timingSafeEqual(a, b) : (timingSafeEqual(b, b), false);
  if (!ok) throw new OpError("Forbidden.", 403);
}

/* ------------------------------ wire shapes ------------------------------ */

export interface ContactSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  status: string | null;
  notes: string | null;
  lastContactedAt: string | null;
}

export interface HistoryItem {
  id: string;
  kind: string;
  channel: string | null;
  body: string;
  createdAt: string;
}

function toContactSummary(c: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  status: string;
  notes: string | null;
  lastContactedAt: Date | null;
}): ContactSummary {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    title: c.title,
    status: c.status,
    notes: c.notes,
    lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
  };
}

const CONTACT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  company: true,
  title: true,
  status: true,
  notes: true,
  lastContactedAt: true,
} as const;

/* ------------------------------- session -------------------------------- */

export interface SessionInput {
  tenantId: string;
  roomName: string;
  direction: "INBOUND" | "OUTBOUND";
  phoneNumber?: string | null;
  fromNumber: string;
  crmContactId?: string | null;
  purpose?: string | null;
}

/** Bootstrap one call session: upsert the VoiceCall by room name (idempotent
 *  under worker retries) and hand back everything the agent needs to speak
 *  with context. voiceEnabled=false is a polite refusal, not an error, so the
 *  agent can say so out loud instead of dropping the line. */
export async function bootstrapVoiceSession(input: SessionInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      productContext: true,
      voiceEnabled: true,
      creditsRemaining: true,
    },
  });
  if (!user) throw new OpError("Unknown tenant.", 404);

  const call = await prisma.voiceCall.upsert({
    where: { livekitRoomName: input.roomName },
    update: {},
    create: {
      userId: user.id,
      livekitRoomName: input.roomName,
      direction: input.direction,
      fromNumber: input.fromNumber,
      toNumber: input.phoneNumber ?? "",
      contactId: input.crmContactId ?? null,
      status: "QUEUED",
    },
    select: { id: true, contactId: true },
  });

  // Resolve the person on the line: the explicit contact when the dial knew
  // one, else an exact phone match inside this tenant. Never a fuzzy guess.
  let contact = null;
  const contactId = input.crmContactId ?? call.contactId;
  if (contactId) {
    contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: user.id },
      select: CONTACT_SELECT,
    });
  } else if (input.phoneNumber) {
    contact = await prisma.contact.findFirst({
      where: { userId: user.id, phone: input.phoneNumber },
      select: CONTACT_SELECT,
    });
  }

  const recentHistory = contact
    ? await contactHistory(user.id, contact.id, 10)
    : [];

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return {
    callId: call.id,
    tenant: {
      id: user.id,
      displayName,
      productContext: user.productContext,
      voiceEnabled: user.voiceEnabled && user.creditsRemaining > 0,
    },
    contact: contact ? toContactSummary(contact) : null,
    recentHistory,
  };
}

/* ------------------------------- lookups -------------------------------- */

export async function lookupContact(
  tenantId: string,
  by: { contactId?: string | null; phone?: string | null },
): Promise<ContactSummary | null> {
  if (by.contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: by.contactId, userId: tenantId },
      select: CONTACT_SELECT,
    });
    return c ? toContactSummary(c) : null;
  }
  if (by.phone) {
    const c = await prisma.contact.findFirst({
      where: { userId: tenantId, phone: by.phone },
      select: CONTACT_SELECT,
    });
    return c ? toContactSummary(c) : null;
  }
  return null;
}

export async function contactHistory(
  tenantId: string,
  contactId: string,
  limit: number,
): Promise<HistoryItem[]> {
  const capped = Math.min(Math.max(1, limit), 50);
  const rows = await prisma.activity.findMany({
    where: { userId: tenantId, contactId },
    orderBy: { createdAt: "desc" },
    take: capped,
    select: { id: true, kind: true, channel: true, body: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    channel: r.channel,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* ----------------------------- call updates ------------------------------ */

/** Resolve a call by roomName within the tenant, or by roomName alone when
 *  the worker could not read a tenant off the job metadata. */
async function findCall(tenantId: string | null, roomName: string) {
  const call = await prisma.voiceCall.findUnique({
    where: { livekitRoomName: roomName },
    select: { id: true, userId: true },
  });
  if (!call) return null;
  if (tenantId && call.userId !== tenantId) throw new OpError("Room does not belong to tenant.", 403);
  return call;
}

export interface StatusInput {
  tenantId: string | null;
  roomName: string;
  status: VoiceCallStatus;
  sipStatusCode?: number | null;
  sipStatus?: string | null;
  startedAt?: string | null;
  answeredAt?: string | null;
}

export async function updateCallStatus(input: StatusInput): Promise<boolean> {
  const call = await findCall(input.tenantId, input.roomName);
  if (!call) return false;
  await prisma.voiceCall.update({
    where: { id: call.id },
    data: {
      status: input.status,
      sipStatusCode: input.sipStatusCode ?? undefined,
      sipStatus: input.sipStatus ?? undefined,
      startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
      answeredAt: input.answeredAt ? new Date(input.answeredAt) : undefined,
    },
  });
  return true;
}

export const CALL_OUTCOMES = [
  "interested",
  "not_interested",
  "callback_requested",
  "wrong_number",
  "do_not_call",
  "left_message",
  "no_decision",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export async function recordCallOutcome(input: {
  tenantId: string;
  roomName: string;
  contactId?: string | null;
  outcome: CallOutcome;
  summary: string;
}): Promise<string | null> {
  const call = await findCall(input.tenantId, input.roomName);
  if (!call) return null;

  // do_not_call is a legally binding opt-out however it was said; it lands on
  // the suppression list in the same breath as the activity, scope ALL so
  // neither a dial nor a future email can reach them again. Phone numbers go
  // into SuppressedContact too (as E.164), matching the convention
  // assertNotSuppressed in telephony/calls.ts checks against.
  if (input.outcome === "do_not_call" && input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, userId: input.tenantId },
      select: { phone: true, email: true },
    });
    const reason = "Asked not to be contacted, on a phone call.";
    const entries = [contact?.email?.trim().toLowerCase(), contact?.phone?.trim().toLowerCase()]
      .filter((v): v is string => Boolean(v));
    for (const email of entries) {
      await prisma.suppressedContact.upsert({
        where: { userId_email: { userId: input.tenantId, email } },
        update: {},
        create: { userId: input.tenantId, email, scope: "ALL", reason },
      });
    }
  }

  if (!input.contactId) return null;
  const activity = await prisma.activity.create({
    data: {
      userId: input.tenantId,
      contactId: input.contactId,
      kind: "call",
      channel: "phone",
      body: `[${input.outcome}] ${input.summary}`.slice(0, 5000),
      actorLabel: "Scalar voice agent",
    },
    select: { id: true },
  });
  return activity.id;
}

export async function scheduleVoiceFollowUp(input: {
  tenantId: string;
  roomName: string;
  contactId: string;
  dueAt: string;
  reason: string;
}): Promise<string | null> {
  const due = new Date(input.dueAt);
  const now = Date.now();
  // The worker validates these too; re-validating here keeps the invariant
  // even if a compromised worker key sends garbage.
  if (Number.isNaN(due.getTime()) || due.getTime() <= now) throw new OpError("dueAt must be in the future.", 400);
  if (due.getTime() > now + 180 * 24 * 60 * 60 * 1000) throw new OpError("dueAt is too far out (max 180 days).", 400);

  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, userId: input.tenantId },
    select: { id: true },
  });
  if (!contact) throw new OpError("Unknown contact.", 404);

  const { task } = await enqueueTask(input.tenantId, {
    kind: "voice_follow_up",
    contactId: input.contactId,
    reason: input.reason,
    dueAt: due,
  });
  return task.id;
}

/* ------------------------------ follow-up task ---------------------------- */

export const VOICE_FOLLOW_UP_KIND = "voice_follow_up";

/** When a promised follow-up comes due, land it on the contact's activity feed
 *  so it shows up in the operator's queue. The task's own reason stays on the
 *  AgentTask row; this makes the due moment visible where the operator works. */
export async function handleVoiceFollowUp(task: {
  id: string;
  userId: string;
  contactId: string | null;
  reason: string;
}): Promise<{ outcome: string }> {
  if (!task.contactId) return { outcome: "No contact on the task; nothing to surface." };
  const contact = await prisma.contact.findFirst({
    where: { id: task.contactId, userId: task.userId },
    select: { id: true },
  });
  if (!contact) return { outcome: "Contact no longer exists; follow-up dropped." };
  await prisma.activity.create({
    data: {
      userId: task.userId,
      contactId: task.contactId,
      kind: "note",
      channel: "phone",
      body: `Follow-up due (promised on a call): ${task.reason}`.slice(0, 5000),
      actorLabel: "Scalar voice agent",
    },
  });
  return { outcome: "Follow-up surfaced on the contact's activity feed." };
}

export interface CompleteInput {
  tenantId: string | null;
  roomName: string;
  status: VoiceCallStatus;
  sipStatusCode?: number | null;
  sipStatus?: string | null;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt: string;
  durationSeconds?: number | null;
  transcript?: unknown;
  modelUsage?: unknown;
  systemPrompt?: string | null;
}

/** Final write for one call. recordingUrl and creditsCharged are deliberately
 *  NOT set here: the recording arrives on a LiveKit webhook, and metering runs
 *  off room_finished in the webhook route so billing has exactly one author. */
export async function completeCall(input: CompleteInput): Promise<boolean> {
  const call = await findCall(input.tenantId, input.roomName);
  if (!call) return false;
  await prisma.voiceCall.update({
    where: { id: call.id },
    data: {
      status: input.status,
      sipStatusCode: input.sipStatusCode ?? undefined,
      sipStatus: input.sipStatus ?? undefined,
      startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
      answeredAt: input.answeredAt ? new Date(input.answeredAt) : undefined,
      endedAt: new Date(input.endedAt),
      durationSeconds: input.durationSeconds ?? undefined,
      transcript: (input.transcript as Prisma.InputJsonValue) ?? undefined,
      modelUsage: (input.modelUsage as Prisma.InputJsonValue) ?? undefined,
      systemPrompt: input.systemPrompt ?? undefined,
    },
  });
  return true;
}
