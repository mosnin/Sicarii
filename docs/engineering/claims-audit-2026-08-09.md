# Claims-vs-delivery audit - 2026-08-09

> Method: 23-agent sweep. 256 concrete claims extracted from the marketing
> site, foundation docs, and every agent-facing tool description; six code
> probes (send path, outreach mechanics, reply-loop reach, compliance
> enforcement, metering, ops integrity); every candidate gap then
> adversarially verified by an agent instructed to REFUTE it with a missed
> implementation. 12 gaps confirmed with file-level proof, 2 refuted.
> Run after Card 0015 landed (post-integration, 796 tests green).

## Fixed since this audit (2026-08-09, same day)

- **Tier 0 (the send) - BUILT.** Scalar can now send email through the
  operator's connected Gmail, via ONE chokepoint (`src/lib/email-send.ts`) that
  enforces, in order: a connected mailbox, suppression (hard refusal), daily cap
  + send window, credit pre-flight, and an unsubscribe link + List-Unsubscribe
  header on every message. Exposed as the `send_email` MCP tool; breakup-draft
  approval now does a REAL send (gap 12) and only marks SENT after it succeeds.
  The Composio read fence is untouched - send is a separate single-purpose door
  (`executeSendEmail`, `GMAIL_SEND_SLUG`), never reachable from a raw agent
  slug. This closes or de-fangs gaps 1, 2 (send step now exists), 3, 4, 9, 12,
  and 13 (sent mail is now a real EmailMessage row). Env-gated: dormant until
  Composio is configured with send scope. Tests: `email-send`, `suppression`,
  `unsubscribe` (23 new cases).
- **Gap 3/9 (suppression unmanageable/unenforced) - FIXED.** `src/lib/
  suppression.ts` is the management surface (add/remove/list via
  `/api/suppressions` and the `add_suppression`/`remove_suppression`/
  `list_suppressions` MCP tools) AND the shared enforcement primitive
  (`assertNotSuppressed`), now enforced on the email send path, scoped by
  direction. Recipient opt-out lands via the public `/api/unsubscribe` route.
- **Gap 5 (voice billing race) - FIXED.** Settles on `creditsCharged`, not
  `endedAt` (`src/lib/voice-billing.ts`, `tests/voice-billing.test.ts`).
- **Monitor cap bypass - FIXED.** Intent + social share one allotment
  (`tests/social-monitor-cap.test.ts`).

Still open from the list below: deliverability warmup (17, partial - cap +
window exist, warmup ramp does not), the operator-facing inbox UI (13, the
contact page still does not render synced threads), the compliance sweep (10,
11, 12-export), number renewal billing (14), sequences (15), and revenue
attribution (18). Everything else below stands as found.

## The one-sentence answer

**Scalar cannot send an email, and every autonomous-outreach claim hangs off
that one absence.** The AgentMail client is GET-only, the Composio execution
layer deny-lists every SEND/DRAFT/REPLY slug behind `MUTATING_SLUG_RE`, no
mail SDK is installed, and the autopilot outreach category lists due
follow-ups at cost 0. The fence is deliberate and well-built; the door was
never added.

## Confirmed gaps (all with file-level proof of absence)

### Tier 0 - the send, and the claims it breaks

1. **No email send path anywhere** (`agentmail.ts` GET-only; `composio.ts`
   read-only allowlist + SEND deny-regex; no SMTP/resend/nodemailer). Breaks
   "agents run email relationships" (product.md, CLAUDE.md), the Settings
   copy "send and sync email", and the founder's stated goal.
2. **Autopilot outreach surfaces, never executes** (`autopilot-run.ts`
   "surfacing, not sending - free"). "Agents work while you're away" is
   discovery+enrichment only.
3. **Every "sent" email is agent self-report** (`log_outreach` advances state
   on the agent's unverified word). Undermines "single source of truth that
   stays consistent" precisely where it matters most.
4. **Approving a breakup draft writes "Breakup email sent" without sending
   anything** - a documented debt (Card 0012), but the Activity trail and
   the MCP description still assert a send that never happened, and the
   stall clock resets on the phantom.

### Tier 1 - bugs in what 0015 built (will bite at first contact with reality)

5. **Voice billing race, deterministic revenue loss**: the worker's
   `completeCall` stamps `endedAt`; the LiveKit webhook's idempotency guard
   (`if (call.endedAt) return`) then returns BEFORE metering, so any call
   whose worker write lands first is billed zero. Fix: meter on either path
   idempotently (per-ref ledger keys already exist), not on webhook order.
6. **Queue drain is ~5 tasks per 5 minutes, globally**: one Inngest cron,
   batch of 5, and the `/api/tasks/dispatch` route is guarded but never
   invoked by anything. A mailbox webhook burst backs up reply detection for
   every tenant by hours. The lease architecture already supports N
   dispatchers; nothing runs them.
7. **The Composio webhook subscription is never created in code** and the
   manual dashboard step is documented nowhere; **no backfill or
   gap-repair exists** (`GMAIL_LIST_HISTORY` allowlisted but never called,
   `MailboxSync.cursor` never read or written) - a missed webhook is mail
   lost forever; **ProcessedEvent pruning** rides on Stripe traffic only,
   so a mail-heavy tenant grows the table unbounded.
8. **Dead-lettered tasks are invisible**: `retireExhausted` overwrites the
   last real error with a generic outcome and no surface (API, MCP, UI)
   ever shows retired tasks. Failures are silent exactly where the operator
   most needs to see them.

### Tier 2 - claims broken today (compliance and honesty)

9. **Suppression is unmanageable and unenforced for email**: no route, UI,
   or MCP tool adds/removes/lists suppressions (the only writer is the voice
   `do_not_call` outcome; nothing ever writes `SuppressedDomain`), and
   OUTBOUND scope gates only phone dialing - `log_outreach`, `saveEmail` and
   breakup approval never consult it. Breaks acceptable-use's "honor
   opt-outs" the moment any send path ships.
10. **FieldProvenance survives account deletion** (no user relation, no
    cascade, no cleanup beyond one narrow re-verify path), with
    `valueSnapshot` copies of personal data. Breaks the privacy page's
    retention promise. Contact deletion similarly retains the person's
    synced email bodies, calendar events, call transcripts and facts
    (SetNull/orphan, not delete).
11. **The subprocessors page predates the foundation**: Composio (entire
    mailbox contents), LiveKit, SocQ, Firecrawl, Apify, Findymail,
    Anymailfinder, Bouncer, AgentPhone are all absent from the page whose
    own copy promises "we list them here in the open". `user.deleted` also
    never revokes third-party resources (Composio accounts/triggers,
    LiveKit rules/numbers).
12. **"Exportable any time" is two flat CSVs** (17 + 12 columns): no
    emails, meetings, facts, custom fields, deals/money, calls, or social
    data can leave the product.

### Tier 3 - the loop never reaches the operator's eyes

13. **No UI reads EmailThread/EmailMessage at all**: the contact page still
    renders only the self-reported ContactEmail store, the "unified
    Conversations" card excludes synced mail and calls, synced calendar
    events have zero UI consumers, and signature blocks (the sync's
    flagship evidence source) are never shown. A synced reply reaches the
    operator as a status badge and a one-line note; the message itself is
    invisible. The welcome flow and the Pulse predate the foundation
    (neither mentions connecting Gmail; Pulse counts none of the new
    activity).

### Tier 4 - revenue and plan-gating leaks

14. **Phone numbers bill once** (50 credits at activation); monthlyCostCents
    is display-only, no renewal job exists - every number is a recurring
    carrier cost against a one-time charge. **Nothing new is plan-gated**:
    a free user gets unlimited mailbox sync (ingest is priced in
    CREDIT_COSTS but never spent), can buy numbers, and can create
    unlimited social monitors (no count cap; plan allotments ignored).

### Tier 5 - the remaining autonomy stack (design gaps, not bugs)

15. **No sequence/cadence model** (no ordered steps, delays, channels,
    max-touches) - nothing for an autonomous agent to execute repeatably.
16. **Stop-on-reply is implicit only**: REPLIED drops a contact from the
    due-followups query, but pending AgentTask rows for that contact are
    never cancelled (no cancel-by-contact exists; a queued voice_follow_up
    still fires after a reply).
17. **No deliverability governance**: no warmup, daily caps, send windows,
    quiet hours, or per-contact timezone on any mailbox model.
18. **The bandit optimizes reply rate, not revenue**: deal money exists but
    is never attributed to variants, so copy converges on what gets replies
    rather than what closes.

## Refuted by verification (kept honest)

- "No email opt-out mechanism exists at all" - overstated: the tenant-scoped
  suppression ledger exists and is enforced on inbound auto-create and
  outbound dialing; what is missing is management surfaces and email-path
  enforcement (gap 9).
- "Follow-up logic is a single staleness heuristic" - overstated: four
  mechanisms exist (due-followups, breakup drafts, schedule_recheck, voice
  follow-ups); what is missing is the sequence model (gap 15).
- Also verified CLEAN: the voice worker <-> app API contract has no drift
  (all 7 endpoints, field names, and the 8-value status enum match), teams/
  workspace scoping works structurally across the whole new surface, SocQ
  per-result billing debits correctly exactly once, and x402 self-payment
  covers the new 402 paths.

## The build order that closes the claims

1. **The send** (one cycle, everything exists around it): allow
   `GMAIL_SEND_EMAIL` through a new `sendEmail()` in the Composio layer,
   gated in ONE chokepoint by: suppression check (OUTBOUND/ALL) -> List-
   Unsubscribe header + footer link + recipient-facing unsubscribe route
   (writes SuppressedContact) -> per-mailbox daily cap + send window ->
   then auto `log_outreach` with a verified=true source, wire breakup
   approval and an autopilot send step through it. Gaps 1-4, 9, 13, 17
   collapse into this one cycle.
2. **Billing correctness**: fix the voice metering race; renewal billing for
   numbers; spend mailbox_ingest or delete the price; plan-gate sync,
   numbers, social monitors.
3. **Sync operability**: create the webhook subscription in code at first
   connect; historyId-checkpoint backfill + reconciliation sweep; prune
   ProcessedEvent from the composio route; scale dispatch (invoke
   /api/tasks/dispatch from the webhook on burst, or N parallel Inngest
   invocations - the leases already make this safe); dead-letter surface.
4. **Show the loop**: synced threads + meetings + signature blocks on the
   contact page; Conversations card merges all channels; welcome + Pulse
   learn about connections.
5. **Compliance sweep**: FieldProvenance userId + cascade; contact-level
   deletion that actually deletes the person's data; third-party revocation
   on user.deleted; subprocessors page update; full export (all tables);
   voice retention window.
6. **Sequences + revenue attribution**: the cadence model with stop-on-reply
   task cancellation; bandit rewards weighted by deal outcomes.
