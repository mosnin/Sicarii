---
name: scalar-outreach
description: Run native cold/warm email in Scalar from mailbox to reply.
---

# Run cold email with Scalar

Native outreach lives in the same CRM as your research. The loop:

## 1. Check the fleet
- Call list_mailboxes. Only ready mailboxes (or warming ones under their ramp
  target) carry sends. If everything is ordered/provisioning, tell the operator
  to finish mailbox setup first — never promise sending capacity you don't have.

## 2. Build the sequence
- create_sequence with 2-4 steps: dayOffset (days after the previous send),
  subject, body. Use {{firstName}} {{company}} tokens so copy personalizes per
  contact. Set variantKind subject|opener on a step to pull the bandit's pick
  at send time (create variants first with create_variant).
- Keep requireApproval true (default). Every send queues as pending_approval
  and a human releases it from the dashboard. You cannot release sends, and
  you must say so honestly — report queued vs approved, never promise delivery.

## 3. Enroll honestly
- enroll_sequence returns per-contact verdicts: enrolled vs skipped (no email,
  suppressed, already enrolled). Fix the list for the skipped — don't re-enroll
  blindly. Suppressed addresses are never mailed, on any rail.

## 4. Singles and tests
- One important mail: queue_send (still needs human release).
- Before cold volume on a new mailbox: send-test from the dashboard proves the
  Bird rail + DNS end to end (it only ever sends to the operator's own inbox).

## Rules
- Confirm before queueing anything to a real prospect.
- Stop-on-reply is automatic (sequence pauses, contact moves to REPLIED, the
  operator's webhook fires). Never follow up a thread that replied.
- Every send carries one-click unsubscribe. Never mail around it.
