// LiveKit CONTROL PLANE. Stateless HTTPS/Twirp only, so it is safe on Vercel.
//
// WHAT LIVES HERE AND WHAT DOES NOT
//   Here: SipClient, AgentDispatchClient, WebhookReceiver, and the raw Twirp
//   transport. All of it is request/response over plain HTTPS, which is exactly
//   what a serverless route handler is good at.
//
//   NOT here: the voice agent WORKER. A worker holds a persistent WebSocket to
//   LiveKit and forks a process per job. Vercel functions are short lived and
//   cannot fork, so the worker is deployed separately (LiveKit Cloud Agents,
//   see docs/engineering/telephony.md). This file only ever TELLS that worker
//   to show up somewhere; it never runs it.
//
// TENANT ISOLATION MODEL (the important part)
//   One shared inbound trunk per carrier (a trunk authenticates the CARRIER,
//   not the tenant). One dispatch rule PER DID, pinned via
//   SIPDispatchRuleInfo.numbers, carrying { tenantId } in metadata/attributes
//   and a roomConfig.agents[] entry. One agent deployment serves every tenant
//   and reads the tenant off ctx.job.metadata. Room names carry the tenant:
//   `tenant-<id>-call-<uuid>`.

import {
  AccessToken,
  AgentDispatchClient,
  ServerError,
  SipClient,
  SipCallError,
  TwirpRpc,
  WebhookReceiver,
  type WebhookEvent,
} from "livekit-server-sdk";
import {
  CreateSIPDispatchRuleRequest,
  JobRestartPolicy,
  RoomAgentDispatch,
  RoomConfiguration,
  SIPDispatchRule,
  SIPDispatchRuleIndividual,
  SIPDispatchRuleInfo,
} from "@livekit/protocol";
import { randomUUID } from "node:crypto";
import { OpError } from "@/lib/op-error";

export class LiveKitNotConfiguredError extends OpError {
  constructor(detail = "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET") {
    super(`LiveKit is not configured (${detail})`, 501);
    this.name = "LiveKitNotConfiguredError";
  }
}

export interface LiveKitConfig {
  /** As configured, usually wss://<project>.livekit.cloud */
  url: string;
  /** The same host over https, which is what every Twirp client wants. */
  httpUrl: string;
  apiKey: string;
  apiSecret: string;
}

export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL?.trim() &&
      process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim(),
  );
}

export function liveKitConfig(): LiveKitConfig {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) throw new LiveKitNotConfiguredError();
  return { url, httpUrl: url.replace(/^ws/, "http").replace(/\/+$/, ""), apiKey, apiSecret };
}

/** The agent name the worker registers under. ONE deployment serves every
 *  tenant; the tenant arrives in the job metadata, never in the agent name. */
export function agentName(): string {
  return process.env.LIVEKIT_AGENT_NAME?.trim() || "scalar-voice-agent";
}

/** The LiveKit SIP OUTBOUND trunk used to place calls.
 *
 *  Deliberately a SEPARATE env var from everything to do with buying numbers.
 *  LiveKit's own number service is inbound only today, so inbound can be fully
 *  live while outbound stays cleanly dormant. Outbound needs a carrier's
 *  outbound SIP trunk registered with LiveKit; until that exists this returns
 *  null and src/lib/telephony/calls.ts refuses to dial rather than pretending. */
export function outboundTrunkId(): string | null {
  return process.env.LIVEKIT_OUTBOUND_TRUNK_ID?.trim() || null;
}

export function isOutboundCallingConfigured(): boolean {
  return isLiveKitConfigured() && Boolean(outboundTrunkId());
}

/* ----------------------------- client singletons -----------------------------
 * Memoized per process. These are thin HTTP clients (no sockets, no state), so
 * reusing them across invocations on a warm lambda is free and avoids re-signing
 * setup work on every call.
 */

let sipClient: SipClient | null = null;
let dispatchClient: AgentDispatchClient | null = null;
let webhookReceiver: WebhookReceiver | null = null;
let phoneNumberRpc: TwirpRpc | null = null;

export function getSipClient(): SipClient {
  const cfg = liveKitConfig();
  if (!sipClient) sipClient = new SipClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
  return sipClient;
}

export function getAgentDispatchClient(): AgentDispatchClient {
  const cfg = liveKitConfig();
  if (!dispatchClient) dispatchClient = new AgentDispatchClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
  return dispatchClient;
}

export function getWebhookReceiver(): WebhookReceiver {
  const cfg = liveKitConfig();
  if (!webhookReceiver) webhookReceiver = new WebhookReceiver(cfg.apiKey, cfg.apiSecret);
  return webhookReceiver;
}

/** Test seam: drop the memoized clients so a changed env is picked up. */
export function resetLiveKitClients(): void {
  sipClient = null;
  dispatchClient = null;
  webhookReceiver = null;
  phoneNumberRpc = null;
}

/* -------------------------------- raw Twirp --------------------------------
 * Some LiveKit services (PhoneNumberService) ship message types but no service
 * client, so the transport has to be driven by hand. TwirpRpc is the SDK's own
 * transport: it builds `{host}/twirp/livekit.{Service}/{Method}`, POSTs JSON,
 * and fails over across cloud regions. Reusing it means we inherit that
 * behaviour instead of reimplementing it badly with fetch.
 */

/** A short-lived JWT carrying the SIP admin grant, the credential every
 *  SIP/number control-plane call needs. */
async function sipAdminHeader(): Promise<Record<string, string>> {
  const cfg = liveKitConfig();
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { ttl: "10m" });
  at.addSIPGrant({ admin: true });
  return { Authorization: `Bearer ${await at.toJwt()}` };
}

/** Issue a raw Twirp call against a livekit.* service. `service` is the bare
 *  service name ("PhoneNumberService"); TwirpRpc prefixes the package. */
export async function livekitTwirp(
  service: string,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const cfg = liveKitConfig();
  if (!phoneNumberRpc) phoneNumberRpc = new TwirpRpc(cfg.httpUrl, "livekit");
  return phoneNumberRpc.request(service, method, body, await sipAdminHeader());
}

/* ----------------------------- dispatch rules ----------------------------- */

export interface DidDispatchRuleInput {
  tenantId: string;
  /** The DID this rule is pinned to. */
  e164: string;
  /** Carrier trunks this rule applies to. Empty means every trunk, which is
   *  correct for a LiveKit-native number (there is no carrier trunk). */
  trunkIds?: string[];
  /** Extra job metadata handed to the agent alongside the tenant id. */
  agentMetadata?: Record<string, unknown>;
}

/**
 * Create the ONE dispatch rule for ONE DID.
 *
 * Built by hand rather than through SipClient.createSipDispatchRule() for a
 * concrete reason: that helper only populates the DEPRECATED flat fields of
 * CreateSIPDispatchRuleRequest and has no way to set `numbers`, which is the
 * field that pins a rule to a specific DID. Without it the rule is a wildcard
 * over the whole shared trunk, which would route every tenant's inbound call
 * into whichever rule matched first. So we build SIPDispatchRuleInfo directly
 * and send it in the modern `dispatchRule` field.
 *
 * `.toJson()` emits camelCase (`roomConfig`, `agentName`), which is what the
 * server expects. Sending snake_case here reportedly surfaces as a confusing
 * "missing rule" error rather than a validation failure.
 */
export async function createDidDispatchRule(input: DidDispatchRuleInput): Promise<string> {
  const info = new SIPDispatchRuleInfo({
    name: `scalar-${input.tenantId}-${input.e164}`,
    // Pins this rule to this DID. The whole tenant isolation model rests here.
    numbers: [input.e164],
    trunkIds: input.trunkIds ?? [],
    rule: new SIPDispatchRule({
      rule: {
        case: "dispatchRuleIndividual",
        // Room names carry the tenant, so a room name is self-describing in
        // logs, webhooks and egress records.
        value: new SIPDispatchRuleIndividual({ roomPrefix: roomPrefixFor(input.tenantId) }),
      },
    }),
    metadata: JSON.stringify({ tenantId: input.tenantId, ...input.agentMetadata }),
    attributes: { tenantId: input.tenantId },
    roomConfig: new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: agentName(),
          metadata: JSON.stringify({ tenantId: input.tenantId, direction: "inbound", ...input.agentMetadata }),
        }),
      ],
    }),
  });

  const req = new CreateSIPDispatchRuleRequest({ dispatchRule: info }).toJson();
  const data = await livekitTwirp("SIP", "CreateSIPDispatchRule", req as Record<string, unknown>);
  const parsed = SIPDispatchRuleInfo.fromJson(data as never, { ignoreUnknownFields: true });
  if (!parsed.sipDispatchRuleId) {
    throw new OpError("LiveKit created a dispatch rule but returned no id, refusing to treat that as wired", 502);
  }
  return parsed.sipDispatchRuleId;
}

export async function deleteDispatchRule(ruleId: string): Promise<void> {
  await getSipClient().deleteSipDispatchRule(ruleId);
}

/* -------------------------------- dispatch -------------------------------- */

export interface AgentDispatchInput {
  roomName: string;
  metadata: Record<string, unknown>;
}

/**
 * Outbound: dispatch the agent into a room WITH metadata and let the agent
 * place the SIP call itself. We deliberately do NOT dial first.
 *
 * Dialing first races the answer: the callee can pick up before the agent has
 * joined and read the CRM context, so the first thing a real human hears is
 * silence. Dispatching first means the agent already holds the contact, the
 * purpose and the prompt before the phone even rings.
 *
 * restartPolicy is JRP_NEVER: if an outbound job crashes it must NOT be
 * retried, because a retry re-dials a real person who has already been called.
 */
export async function dispatchOutboundAgent(input: AgentDispatchInput): Promise<string> {
  const dispatch = await getAgentDispatchClient().createDispatch(input.roomName, agentName(), {
    metadata: JSON.stringify(input.metadata),
    restartPolicy: JobRestartPolicy.JRP_NEVER,
  });
  return dispatch.id;
}

/* --------------------------------- rooms --------------------------------- */

export function roomPrefixFor(tenantId: string): string {
  return `tenant-${tenantId}-call`;
}

export function newRoomName(tenantId: string): string {
  return `${roomPrefixFor(tenantId)}-${randomUUID()}`;
}

/** Recover the tenant from a room name. Returns null for any room that does
 *  not match our shape, so a foreign room can never be attributed to a tenant. */
export function tenantIdFromRoomName(roomName: string): string | null {
  const m = /^tenant-(.+)-call-[0-9a-fA-F-]{36}$/.exec(roomName);
  return m ? m[1] : null;
}

/* ------------------------------- SIP errors ------------------------------- */

export interface SipFailure {
  sipStatusCode?: number;
  sipStatus?: string;
  message: string;
}

/** Pull the SIP rejection detail out of a LiveKit error. TwirpError.metadata
 *  carries sip_status_code / sip_status, which are our busy, no-answer and
 *  rejected signals. Without these a failed dial looks identical to a
 *  conversation, and a failed dial must NEVER be billed as one. */
export function sipFailureFrom(e: unknown): SipFailure {
  if (e instanceof SipCallError) {
    return { sipStatusCode: e.sipStatusCode, sipStatus: e.sipStatus, message: e.message };
  }
  if (e instanceof ServerError) {
    const raw = e.metadata?.sip_status_code;
    const code = raw === undefined ? undefined : Number(raw);
    return {
      sipStatusCode: Number.isFinite(code) ? code : undefined,
      sipStatus: e.metadata?.sip_status,
      message: e.message,
    };
  }
  return { message: e instanceof Error ? e.message : String(e) };
}

export type CallOutcome = "ANSWERED" | "BUSY" | "NO_ANSWER" | "VOICEMAIL" | "FAILED";

/** Map a SIP response code onto a call status. Anything we do not recognise is
 *  FAILED, never ANSWERED: guessing "answered" is what bills a customer for a
 *  call that never happened. */
export function callOutcomeFromSip(code: number | undefined | null): CallOutcome {
  if (code == null || !Number.isFinite(code)) return "FAILED";
  if (code >= 200 && code < 300) return "ANSWERED";
  switch (code) {
    case 486: // Busy Here
    case 600: // Busy Everywhere
      return "BUSY";
    case 408: // Request Timeout
    case 480: // Temporarily Unavailable
    case 487: // Request Terminated (we gave up ringing)
      return "NO_ANSWER";
    default:
      return "FAILED";
  }
}

export type { WebhookEvent };
