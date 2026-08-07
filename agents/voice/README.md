# Scalar voice agent worker

The always-on process that actually talks on the phone. One deployment, every
tenant.

Scalar's control plane (SIP trunks, dispatch rules, buying numbers, starting an
outbound call, receiving webhooks) lives in the Next.js app on Vercel. This
package is the other half: the LiveKit agent worker that joins the room, runs
the speech pipeline, and holds the conversation.

---

## Why this is not on Vercel

Three properties of the worker are each individually disqualifying for a
serverless platform:

1. **It holds a persistent WebSocket.** The worker registers with LiveKit and
   keeps that socket up through a 10 attempt reconnect loop. Vercel functions
   are request scoped and are frozen or killed between requests.
2. **It forks a child process per job.** Every call runs in its own process so
   one bad call cannot take down the others. Serverless gives you one process
   and no control over its lifetime.
3. **It has native dependencies.** Silero VAD and `@livekit/rtc-node` are
   native modules doing continuous audio work, not an HTTP handler.

There is also a fourth reason that is about blast radius rather than runtime,
and it shapes the whole design of this package: **the worker has no database
connection.** It runs third party model code in process and holds long lived
network egress. Handing it `DATABASE_URL` would make it exfiltration shaped.
Instead it reaches the CRM through a narrow, authenticated internal HTTP API on
the Next.js app, which is the only thing that owns data and applies tenant
scoping. See `src/tenant.ts`.

---

## How one deployment serves every tenant

`agentName` is set to `scalar-agent`, which turns on **explicit dispatch**: jobs
are not auto dispatched to rooms, they are addressed to this agent by name. The
tenant arrives per call, as a JSON string in `ctx.job.metadata`:

```jsonc
{
  "tenantId": "user-uuid",          // required, no default, ever
  "direction": "OUTBOUND",          // or INBOUND
  "phoneNumber": "+15550001111",    // required outbound, the number we dial
  "fromNumber": "+15559998888",     // the tenant's DID
  "crmContactId": "contact-uuid",   // optional
  "systemPrompt": "...",            // optional operator guidance
  "purpose": "confirm Thursday",    // optional
  "callId": "voice-call-uuid",      // optional, when the row already exists
  "trunkId": "ST_...",              // optional per tenant outbound trunk
  "maxCallDurationSeconds": 600     // optional
}
```

Inbound puts that JSON in the SIP dispatch rule's
`roomConfig.agents[].metadata`. Outbound puts the same JSON in
`AgentDispatchClient.createDispatch`. One shape, one code path, both directions.

**A tenant is never baked into a deployment.** If it were, onboarding a customer
would mean shipping infrastructure.

**Unreadable metadata is refused, not defaulted.** No tenant means we do not
know whose data to speak, whose credits to spend, or who consented to a
recording. The worker logs it, says one polite line if somebody is actually on
the line, records the call as `FAILED`, and hangs up.

---

## Outbound call flow

The order matters and is not negotiable:

1. The control plane creates an explicit dispatch into a new room. The agent is
   in the room first.
2. The agent starts its session, then places the call itself with
   `sipClient.createSipParticipant(...)` and `waitUntilAnswered: true`.
3. On failure the Twirp error carries `sip_status_code` and `sip_status`. Those
   are the busy, no answer and rejected signals, and they are recorded. **A
   failed dial is never reported as a conversation.**
4. On answer, answering machine detection runs. Talking to a voicemail and
   talking to a person are different outcomes: a machine gets a short message
   and the call is recorded as `VOICEMAIL`.
5. At shutdown, `session.history` and `session.modelUsage` are pushed back
   through the internal API so the transcript and the per model spend land in
   **our** database, attributed to the tenant who owes for them, rather than
   only in LiveKit's dashboard. Then the room is deleted, which is how you hang
   up.

Never dial before dispatch. Dialling first means a human hears silence while a
worker is still being assigned.

---

## Internal API this worker depends on

All routes are on the Next.js app, authenticated by the
`x-scalar-internal-secret` header (constant time compare), never a query
parameter. Full request and response types are in `src/tenant.ts`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/internal/voice/session` | Resolve tenant, contact and recent history; open or adopt the `VoiceCall` row |
| GET | `/api/internal/voice/contact` | Look up the contact by id or by the number on the line |
| GET | `/api/internal/voice/contact/history` | Recent activity for a contact, newest first |
| POST | `/api/internal/voice/call/status` | In flight transitions (`RINGING`, `ANSWERED`) |
| POST | `/api/internal/voice/call/outcome` | Log what happened, mid call, from a tool |
| POST | `/api/internal/voice/follow-up` | Schedule a follow up (requires spoken confirmation first) |
| POST | `/api/internal/voice/call/complete` | Final status, transcript, model usage, duration |

Statuses are exactly the Prisma `VoiceCallStatus` enum: `QUEUED`, `RINGING`,
`ANSWERED`, `COMPLETED`, `FAILED`, `NO_ANSWER`, `BUSY`, `VOICEMAIL`.

---

## Running locally

```bash
pnpm install                 # from this directory
cp .env.example .env.local   # fill in the keys
pnpm dev                     # tsx watch src/agent.ts dev
```

`dev` mode registers with LiveKit and waits for a dispatched job. To exercise it
end to end you need a SIP trunk pointed at LiveKit and either a real inbound
call or an outbound dispatch created by the app.

Tests need no credentials and no network:

```bash
pnpm test
```

---

## Environment

See `.env.example` for the annotated list. The required ones:

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
`SCALAR_INTERNAL_API_URL`, `SCALAR_INTERNAL_SECRET`.

Provider keys for whatever pipeline is selected: `DEEPGRAM_API_KEY`,
`OPENAI_API_KEY`, `CARTESIA_API_KEY` by default.

Everything about the pipeline is env driven (`VOICE_STT_*`, `VOICE_LLM_*`,
`VOICE_TTS_*`), so changing the voice or the model is a config change on a
running deployment, not a code release of a worker that is currently holding
live calls.

---

## Deploying

### Recommended: LiveKit Cloud Agents

```bash
lk agent create      # writes the generated id back into livekit.toml
lk agent env set OPENAI_API_KEY=... SCALAR_INTERNAL_SECRET=...
lk agent deploy
```

`livekit.toml` in this directory is the deployment config. Recommended because
it is the only option where the worker and the SIP infrastructure are the same
system: no cross cloud hop on the media path, rolling deploys that drain live
calls instead of dropping them, and per agent secrets without standing up a
secret manager. Roughly 2 replicas at 2 vCPU and 4 GiB is the sensible floor
(one replica means a deploy drops calls).

Cost, so nobody is surprised: LiveKit Cloud bills the agent compute plus
participant minutes, and on top of that sit the per minute costs that dominate
anyway. A rough order of magnitude for a hosted Deepgram plus GPT-4o-mini plus
Cartesia pipeline is a few cents per minute of conversation, plus carrier
termination for the PSTN leg. The compute is the small number here. The model
and carrier minutes are the real bill, which is exactly why `session.modelUsage`
is persisted per call per tenant rather than averaged.

### If we outgrow it

The image in `Dockerfile` is portable and needs no LiveKit specific runtime:

- **Fly.io**: closest to LiveKit Cloud in feel. Cheapest way to run a couple of
  always-on instances near the numbers.
- **Render**: a background worker service. Simplest operationally, least control
  over regions.
- **AWS ECS**: correct when the rest of the infrastructure is already AWS and
  the security review wants a VPC.
- **Kubernetes**: only when there is already a cluster and someone who owns it.

Working manifests for all four live in `livekit-examples/agent-deployment`.

The two constraints any host must satisfy: the process runs continuously (not
request scoped), and a deploy drains rather than kills, because instances are
holding live phone calls.

---

## Files

| File | What it is |
|---|---|
| `src/agent.ts` | The `defineAgent` entrypoint, prewarm, and outbound dial |
| `src/tenant.ts` | Job metadata parsing and the internal API client |
| `src/prompt.ts` | System prompt, opening line, voicemail line |
| `src/tools.ts` | The four function tools available during a call |
| `src/lifecycle.ts` | Final status, transcript and usage persistence, hangup |
| `src/config.ts` | Env driven provider and model selection |
| `src/logger.ts` | One line of JSON per event, on stdout |
