# Telephony - in-house voice on LiveKit

> Status: built 2026-08-07, dormant until env is set. Replaces the third-party
> AgentPhone path for new work (the legacy path still runs; removal is a
> tracked debt on the ledger).

## The architecture, in one look

```
Vercel (Next.js)                       LiveKit Cloud
 - buy-a-number UI + API                - SIP + media
 - SipClient / AgentDispatchClient      - PhoneNumberService (DIDs)
 - /api/webhooks/livekit (billing)      - Cloud Agents: agents/voice worker
 - /api/internal/voice/* (worker API)       one deployment, every tenant
```

Two constraints force this split, both verified against LiveKit source:

1. **The agent worker cannot run on Vercel.** It holds a persistent WebSocket
   with a reconnect loop and forks a child process per call. So the worker is
   its own deployable (`agents/voice/`, deployed to LiveKit Cloud Agents) and
   the Next.js side is control plane only: stateless HTTPS calls that are
   exactly what a route handler is good at.
2. **The worker holds no database credentials.** A separate deployment with
   network egress and a DB connection is exfiltration-shaped. It reaches the
   CRM only through `/api/internal/voice/*`, authenticated with
   `SCALAR_INTERNAL_SECRET` (timing-safe header check), idempotent by room
   name so worker retries are safe.

## Tenant isolation

One shared trunk per carrier (a trunk authenticates the carrier, not the
tenant). One dispatch rule per DID, pinned via `numbers: [e164]` and carrying
`{ tenantId }` in metadata plus a `roomConfig.agents[]` entry. One worker
deployment under one agentName; the tenant arrives in `ctx.job.metadata`,
never in the deployment. Room names carry the tenant.

## Numbers: LiveKit, US only, inbound only (founder call, 2026-08-07)

Numbers are bought through LiveKit's own `PhoneNumberService` (search /
purchase / release, buy-and-wire in one call via `sip_dispatch_rule_id`),
behind a `NumberProvider` adapter (`src/lib/telephony/provider.ts`). Telnyx
and Twilio adapters exist as secondaries because **LiveKit numbers cannot
place outbound calls**: outbound needs a carrier SIP trunk regardless of who
sold the DID. Consequences, enforced in code:

- `place_call` and the calls lib fail loudly with `OUTBOUND_UNAVAILABLE_REASON`
  and charge nothing until `LIVEKIT_OUTBOUND_TRUNK_ID` is set.
- Inbound is fully live once LiveKit env + a purchased number exist.
- When LiveKit ships outbound, the carrier adapters can be deleted; the
  adapter interface is the migration path.
- The PhoneNumberService Twirp path/casing is UNVERIFIED against a live
  project; `livekitTwirp` fails loudly with the raw body so one live call
  settles it without touching call sites.

## Money and honesty rules

- Billing has exactly one author: the `room_finished` webhook (authoritative
  duration). The worker's `complete` endpoint records, never meters.
- A failed dial is never billed and can never be recorded as ANSWERED; an
  answering machine is VOICEMAIL even though the line technically answered.
- `session.modelUsage` is persisted per call so STT/LLM/TTS spend is
  attributed per tenant, not averaged.
- A number's `spamScore` is surfaced in the buy UI: a flagged DID gets
  outbound tagged as spam and is worthless.
- `do_not_call`, said out loud on a call, lands the person on the suppression
  list (scope ALL) in the same write as the activity.

## OPEN QUESTIONS (before outbound is switched on)

1. **STIR/SHAKEN attestation when reselling DIDs.** Wrong attestation means
   outbound gets tagged "Spam Likely" and the product stops working. The ISV
   attestation path (per-tenant identity vs ours) is unverified with any
   carrier. Highest-risk unknown.
2. **Recording consent.** The worker's prompt announces recording in the
   opening line (two-party-consent states, GDPR), and `redaction` is on by
   default; counsel should still sign off before scale.
3. **Carrier resale terms.** Whether Telnyx/Twilio permit our
   buy-in-our-UI-for-end-users model needs written confirmation if the
   carrier path is ever enabled.
4. **Owed to reality:** one real inbound and one real outbound call. AMD
   categories, voicemail-beep timing and redaction output are all untested
   against a live trunk.
