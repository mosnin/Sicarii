// Sequences: the ops layer that turns the one-shot send path into self-driving
// outreach. A cadence is data (ordered steps with per-step delays); enrolling a
// contact schedules the first step; the leased task queue fires each due step
// through sendOutboundEmail, so every automated touch clears suppression, the
// daily cap, and the unsubscribe link exactly like a manual send. The instant a
// contact replies or is suppressed, their enrollment stops - a reply is the
// goal, never a step to talk over.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { enqueueTask } from "@/lib/tasks";
import { sendOutboundEmail } from "@/lib/email-send";
import { checkSuppressed } from "@/lib/suppression";

export const SEQUENCE_STEP_KIND = "sequence_step";

const MAX_STEPS = 20;
const MAX_ACTIVE_SEQUENCES = 50;

/* ------------------------------ definitions ----------------------------- */

export interface StepInput {
  delayDays: number;
  subject: string;
  body: string;
}

export interface CreateSequenceInput {
  name: string;
  steps: StepInput[];
}

function validateSteps(steps: StepInput[]): void {
  if (!steps.length) throw new OpError("A sequence needs at least one step.", 400);
  if (steps.length > MAX_STEPS) throw new OpError(`A sequence can have at most ${MAX_STEPS} steps.`, 400);
  for (const s of steps) {
    if (!s.subject?.trim() || !s.body?.trim()) throw new OpError("Every step needs a subject and a body.", 400);
    if (!Number.isFinite(s.delayDays) || s.delayDays < 0 || s.delayDays > 365) {
      throw new OpError("Each step's delayDays must be between 0 and 365.", 400);
    }
  }
}

export async function createSequence(userId: string, input: CreateSequenceInput) {
  const name = input.name?.trim();
  if (!name) throw new OpError("A sequence needs a name.", 400);
  validateSteps(input.steps);
  const active = await prisma.sequence.count({ where: { userId, active: true } });
  if (active >= MAX_ACTIVE_SEQUENCES) throw new OpError(`You have reached the limit of ${MAX_ACTIVE_SEQUENCES} active sequences.`, 402);

  return prisma.sequence.create({
    data: {
      userId,
      name: name.slice(0, 200),
      steps: {
        create: input.steps.map((s, i) => ({
          order: i,
          delayDays: Math.trunc(s.delayDays),
          subject: s.subject.slice(0, 300),
          body: s.body.slice(0, 20000),
        })),
      },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });
}

export function listSequences(userId: string) {
  return prisma.sequence.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { enrollments: true } } },
  });
}

export async function setSequenceActive(userId: string, sequenceId: string, active: boolean) {
  const seq = await prisma.sequence.findFirst({ where: { id: sequenceId, userId } });
  if (!seq) throw new OpError("Sequence not found", 404);
  return prisma.sequence.update({ where: { id: sequenceId }, data: { active } });
}

/* ------------------------------ enrollment ------------------------------ */

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Enroll a contact. Idempotent on (sequence, contact): a contact already
 * enrolled is returned untouched rather than given a second cadence. Refuses up
 * front if the contact has no email or is already suppressed, so a doomed
 * enrollment never sits ACTIVE pretending it will send.
 */
export async function enrollContact(userId: string, sequenceId: string, contactId: string) {
  const [sequence, contact] = await Promise.all([
    prisma.sequence.findFirst({ where: { id: sequenceId, userId }, include: { steps: { orderBy: { order: "asc" } } } }),
    prisma.contact.findFirst({ where: { id: contactId, userId }, select: { id: true, email: true } }),
  ]);
  if (!sequence) throw new OpError("Sequence not found", 404);
  if (!sequence.active) throw new OpError("This sequence is paused; resume it before enrolling.", 409);
  if (!sequence.steps.length) throw new OpError("This sequence has no steps.", 400);
  if (!contact) throw new OpError("Contact not found", 404);
  if (!contact.email) throw new OpError("This contact has no email address, so it cannot be enrolled.", 400);

  const existing = await prisma.sequenceEnrollment.findUnique({
    where: { sequenceId_contactId: { sequenceId, contactId } },
  });
  if (existing) return { enrollment: existing, alreadyEnrolled: true };

  const suppressed = await checkSuppressed(userId, contact.email, "outbound");
  if (suppressed.suppressed) {
    throw new OpError(`Not enrolled: ${suppressed.reason}. Remove the suppression first if this is intentional.`, 409);
  }

  const nextStepAt = addDays(new Date(), sequence.steps[0].delayDays);
  const enrollment = await prisma.sequenceEnrollment.create({
    data: { userId, sequenceId, contactId, currentStep: 0, nextStepAt, status: "ACTIVE" },
  });
  await scheduleNextStep(userId, enrollment.id, contactId, nextStepAt);
  return { enrollment, alreadyEnrolled: false };
}

async function scheduleNextStep(userId: string, enrollmentId: string, contactId: string, dueAt: Date) {
  await enqueueTask(userId, {
    kind: SEQUENCE_STEP_KIND,
    contactId,
    reason: "Send the next step of an outreach sequence.",
    dueAt,
    payload: { enrollmentId },
  });
}

/** Stop every active enrollment for a contact. The one call the reply path and
 *  the suppression path use, so an enrollment can never keep sending after the
 *  relationship has a reason to pause. Safe to call with no active enrollments. */
export async function stopEnrollmentsForContact(
  userId: string,
  contactId: string,
  reason: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const { count } = await client.sequenceEnrollment.updateMany({
    where: { userId, contactId, status: "ACTIVE" },
    data: { status: "STOPPED", stoppedReason: reason, nextStepAt: null },
  });
  return count;
}

/* ------------------------------ the engine ------------------------------ */

/**
 * Fire one enrollment's current step. Called by the leased dispatcher, one task
 * per due step. Re-checks everything at send time (the world moves between
 * scheduling and firing): the enrollment is still ACTIVE, the contact still has
 * an email and is not suppressed, the sequence still active. Sends through the
 * chokepoint, advances to the next step or completes, and schedules the follow.
 */
export async function runSequenceStep(userId: string, enrollmentId: string): Promise<{ outcome: string }> {
  const enrollment = await prisma.sequenceEnrollment.findFirst({
    where: { id: enrollmentId, userId },
    include: {
      sequence: { include: { steps: { orderBy: { order: "asc" } } } },
      contact: { select: { id: true, email: true } },
    },
  });
  if (!enrollment) return { outcome: "Enrollment gone; nothing to do." };
  if (enrollment.status !== "ACTIVE") return { outcome: `Enrollment is ${enrollment.status}; skipped.` };
  if (!enrollment.sequence.active) {
    await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { status: "STOPPED", stoppedReason: "sequence paused", nextStepAt: null } });
    return { outcome: "Sequence paused; enrollment stopped." };
  }

  const step = enrollment.sequence.steps.find((s) => s.order === enrollment.currentStep);
  if (!step) {
    await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { status: "COMPLETED", nextStepAt: null } });
    return { outcome: "No more steps; enrollment completed." };
  }

  const email = enrollment.contact.email;
  if (!email) {
    await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { status: "STOPPED", stoppedReason: "no email", nextStepAt: null } });
    return { outcome: "Contact has no email; enrollment stopped." };
  }

  // Suppression is also enforced inside sendOutboundEmail, but checking here
  // lets a suppressed enrollment stop cleanly instead of erroring every cycle.
  const suppressed = await checkSuppressed(userId, email, "outbound");
  if (suppressed.suppressed) {
    await stopEnrollmentsForContact(userId, enrollment.contactId, "suppressed");
    return { outcome: `Contact suppressed (${suppressed.reason}); enrollment stopped.` };
  }

  try {
    await sendOutboundEmail(userId, {
      to: email,
      subject: step.subject,
      body: step.body,
      contactId: enrollment.contactId,
    });
  } catch (e) {
    // A daily-cap or send-window refusal is transient: leave the enrollment
    // ACTIVE and reschedule for tomorrow rather than killing the cadence. Any
    // other error stops it so a broken enrollment does not retry forever.
    // Duck-type the status: an OpError crossing a module/bundle boundary can
    // fail instanceof, and the status is what actually matters here.
    const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 0;
    if (status === 429 || status === 425) {
      const retryAt = addDays(new Date(), 1);
      await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { nextStepAt: retryAt } });
      await scheduleNextStep(userId, enrollmentId, enrollment.contactId, retryAt);
      return { outcome: "Send deferred (cap or window); retrying tomorrow." };
    }
    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "FAILED", stoppedReason: e instanceof Error ? e.message.slice(0, 300) : "send failed", nextStepAt: null },
    });
    return { outcome: "Send failed; enrollment stopped." };
  }

  // Advance. If a next step exists, schedule it; otherwise complete.
  const next = enrollment.sequence.steps.find((s) => s.order === enrollment.currentStep + 1);
  if (!next) {
    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED", currentStep: enrollment.currentStep + 1, lastStepAt: new Date(), nextStepAt: null },
    });
    return { outcome: `Sent final step ${step.order + 1}; enrollment completed.` };
  }
  const nextAt = addDays(new Date(), next.delayDays);
  await prisma.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: { currentStep: enrollment.currentStep + 1, lastStepAt: new Date(), nextStepAt: nextAt },
  });
  await scheduleNextStep(userId, enrollmentId, enrollment.contactId, nextAt);
  return { outcome: `Sent step ${step.order + 1}; next step scheduled.` };
}
