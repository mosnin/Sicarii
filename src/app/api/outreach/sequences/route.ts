// Outreach sequences: build, enroll, release, test (Card 0015).
//
// GET  /api/outreach/sequences — your sequences with enrollment counts.
// POST /api/outreach/sequences — { action }:
//   create:             { name, steps[{dayOffset,subject,body,variantKind?}], requireApproval?, stopOnReply?, dailyCap? }
//   enroll:             { sequenceId, contactIds[] } → per-contact verdicts.
//   approve-enrollment: { enrollmentId } — HUMAN SESSION ONLY (this route
//                       resolves a Clerk session via getAuthContext; agent API
//                       keys take a different auth path and never land here,
//                       so a prompt-injected agent can never release sends —
//                       the breakup-drafts approve precedent).
//   queue-send:         { contactId, subject, body, enrollmentId?, variantId? } → pending_approval row.
//   approve-send:       { sendId } — same session-only release.
//   send-test:          { subject, body } — immediate send to YOUR OWN account
//                       address (recipient pinned server-side, never from input).
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import {
  createSequence,
  listSequences,
  enrollContacts,
  approveEnrollment,
  queueSingleSend,
  approveSend,
} from "@/lib/outreach-operations";
import { sendTestEmail } from "@/lib/outreach-send";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    return NextResponse.json({ sequences: await listSequences(ctx.account.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/outreach/sequences", e);
    return NextResponse.json({ error: "Failed to list sequences" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.account;

    const rate = await checkRateLimit(`outreach-sequences:${user.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as {
      action?: string;
      name?: string;
      steps?: unknown;
      requireApproval?: boolean;
      stopOnReply?: boolean;
      dailyCap?: number;
      sequenceId?: string;
      contactIds?: string[];
      enrollmentId?: string;
      contactId?: string;
      subject?: string;
      bodyText?: string;
      variantId?: string;
      sendId?: string;
    } | null;
    const action = body?.action;

    if (action === "create") {
      if (!body?.name || body.steps === undefined)
        return NextResponse.json({ error: "name and steps are required" }, { status: 400 });
      return NextResponse.json(
        await createSequence(user.id, {
          name: body.name,
          steps: body.steps,
          requireApproval: body.requireApproval,
          stopOnReply: body.stopOnReply,
          dailyCap: body.dailyCap,
        }),
      );
    }
    if (action === "enroll") {
      if (!body?.sequenceId || !Array.isArray(body.contactIds))
        return NextResponse.json({ error: "sequenceId and contactIds[] are required" }, { status: 400 });
      return NextResponse.json(await enrollContacts(user.id, body.sequenceId, body.contactIds));
    }
    if (action === "approve-enrollment") {
      if (!body?.enrollmentId) return NextResponse.json({ error: "enrollmentId is required" }, { status: 400 });
      return NextResponse.json(await approveEnrollment(user.id, body.enrollmentId));
    }
    if (action === "queue-send") {
      if (!body?.contactId || !body.subject || !body.bodyText)
        return NextResponse.json({ error: "contactId, subject, and bodyText are required" }, { status: 400 });
      return NextResponse.json(
        await queueSingleSend(user.id, {
          contactId: body.contactId,
          subject: body.subject,
          body: body.bodyText,
          enrollmentId: body.enrollmentId,
          variantId: body.variantId,
        }),
      );
    }
    if (action === "approve-send") {
      if (!body?.sendId) return NextResponse.json({ error: "sendId is required" }, { status: 400 });
      return NextResponse.json(await approveSend(user.id, body.sendId));
    }
    if (action === "send-test") {
      if (!body?.subject || !body.bodyText)
        return NextResponse.json({ error: "subject and bodyText are required" }, { status: 400 });
      return NextResponse.json(await sendTestEmail(user.id, { subject: body.subject, body: body.bodyText }));
    }
    return NextResponse.json(
      { error: "action must be create, enroll, approve-enrollment, queue-send, approve-send, or send-test" },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/outreach/sequences", e);
    return NextResponse.json({ error: "Sequence request failed" }, { status: 500 });
  }
}
