// Tenant resolution for the voice worker.
//
// WHY there is no database client in this file: this worker is a separate
// always-on deployment with a different blast radius from the Next.js app. It
// runs third party model providers in process, forks a child process per call,
// and holds a long lived socket to LiveKit. Handing it DATABASE_URL plus
// unrestricted network egress would make it exfiltration shaped: one bad
// dependency and the whole CRM is readable. So it never speaks Postgres. It
// calls a narrow, authenticated internal HTTP surface on the app, which is the
// only thing that owns the data, applies tenant scoping, and enforces limits.
//
// The shared secret is sent in a header and is never logged, never put in a
// URL, and never attached to a thrown error. See redact() below.

import { z } from "zod";

// ── Job metadata ────────────────────────────────────────────────────────────
// Per call context arrives as ctx.job.metadata, a STRING. The control plane
// JSON encodes the same payload for both directions: inbound through the SIP
// dispatch rule's roomConfig.agents[].metadata, outbound through
// AgentDispatchClient.createDispatch. One shape, one code path.

export const callDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export type CallDirection = z.infer<typeof callDirectionSchema>;

const rawJobMetadataSchema = z
  .object({
    tenantId: z.string().min(1),
    direction: callDirectionSchema.default("OUTBOUND"),
    // The number we are talking to. Required outbound (we dial it). Optional
    // inbound, where the dispatch rule is created per DID long before the
    // caller exists and the number is read off the SIP participant instead.
    phoneNumber: z.string().min(1).nullish(),
    fromNumber: z.string().min(1),
    crmContactId: z.string().min(1).nullish(),
    systemPrompt: z.string().nullish(),
    purpose: z.string().nullish(),
    // Set when the control plane already created the VoiceCall row. When it is
    // absent the app resolves the call by room name, which is unique.
    callId: z.string().min(1).nullish(),
    // Trunks are per tenant DID, so a tenant may override the deployment default.
    trunkId: z.string().min(1).nullish(),
    maxCallDurationSeconds: z.number().int().positive().max(7200).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.direction === "OUTBOUND" && !value.phoneNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["phoneNumber"],
        message: "phoneNumber is required for an OUTBOUND job",
      });
    }
  });

export type JobMetadata = z.infer<typeof rawJobMetadataSchema>;

export type ParsedJobMetadata =
  | { ok: true; metadata: JobMetadata }
  | { ok: false; reason: string };

/**
 * Parse ctx.job.metadata. Never throws and never falls back to a default
 * tenant: an unreadable payload means we do not know whose data we would be
 * speaking, so the only safe outcome is to refuse the call.
 */
export function parseJobMetadata(raw: unknown): ParsedJobMetadata {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "job metadata is missing or empty" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "job metadata is not valid JSON" };
  }

  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ok: false, reason: "job metadata is not a JSON object" };
  }

  const parsed = rawJobMetadataSchema.safeParse(decoded);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, reason: `job metadata failed validation: ${detail}` };
  }

  return { ok: true, metadata: parsed.data };
}

// ── Internal API shapes ─────────────────────────────────────────────────────

export const voiceCallStatusSchema = z.enum([
  "QUEUED",
  "RINGING",
  "ANSWERED",
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "BUSY",
  "VOICEMAIL",
]);
export type VoiceCallStatus = z.infer<typeof voiceCallStatusSchema>;

export const tenantProfileSchema = z.object({
  id: z.string(),
  displayName: z.string().nullish(),
  /** The tenant's product context: what they sell, to whom, in their words. */
  productContext: z.string().nullish(),
  timezone: z.string().nullish(),
  /** Tenant specific recording disclosure, when their legal wording differs from ours. */
  recordingDisclosure: z.string().nullish(),
  /** Optional per tenant voice override, so one tenant can sound different without a redeploy. */
  ttsVoice: z.string().nullish(),
  /** False when the tenant is out of credits or has voice switched off. The worker must not talk. */
  voiceEnabled: z.boolean().default(true),
});
export type TenantProfile = z.infer<typeof tenantProfileSchema>;

export const contactSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  company: z.string().nullish(),
  title: z.string().nullish(),
  status: z.string().nullish(),
  notes: z.string().nullish(),
  lastContactedAt: z.string().nullish(),
});
export type ContactSummary = z.infer<typeof contactSummarySchema>;

export const historyItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  channel: z.string().nullish(),
  body: z.string(),
  createdAt: z.string(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

export const sessionContextSchema = z.object({
  callId: z.string(),
  tenant: tenantProfileSchema,
  contact: contactSummarySchema.nullable().default(null),
  recentHistory: z.array(historyItemSchema).default([]),
});
export type SessionContext = z.infer<typeof sessionContextSchema>;

export interface StartSessionInput {
  tenantId: string;
  callId?: string | null;
  roomName: string;
  direction: CallDirection;
  phoneNumber?: string | null;
  fromNumber: string;
  crmContactId?: string | null;
  purpose?: string | null;
  agentName: string;
}

export interface ReportStatusInput {
  // Null when the job metadata was unreadable and we never learned whose call
  // this is. The app resolves the row by room name, which is unique.
  tenantId: string | null;
  callId?: string | null;
  roomName: string;
  status: VoiceCallStatus;
  sipStatusCode?: number | null;
  sipStatus?: string | null;
  answeredAt?: string | null;
  startedAt?: string | null;
}

export interface LogOutcomeInput {
  tenantId: string;
  callId?: string | null;
  roomName: string;
  contactId?: string | null;
  /** Short, factual summary of what happened, in the agent's words. */
  summary: string;
  outcome: string;
}

export interface ScheduleFollowUpInput {
  tenantId: string;
  callId?: string | null;
  roomName: string;
  contactId: string;
  /** ISO 8601. The app validates that this is in the future and inside a sane horizon. */
  dueAt: string;
  reason: string;
}

export interface CompleteCallInput {
  /** Null for a refused call whose metadata never identified a tenant. Resolved by room name instead. */
  tenantId: string | null;
  callId?: string | null;
  roomName: string;
  status: VoiceCallStatus;
  sipStatusCode?: number | null;
  sipStatus?: string | null;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt: string;
  durationSeconds?: number | null;
  /** session.history, serialized. */
  transcript?: unknown;
  /** session.modelUsage: one usage summary per model and provider combination. */
  modelUsage?: unknown;
  systemPrompt?: string | null;
  error?: string | null;
}

// ── Client ──────────────────────────────────────────────────────────────────

export interface Logger {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
}

export interface InternalApiOptions {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

export const INTERNAL_SECRET_HEADER = "x-scalar-internal-secret";
export const REDACTED = "[redacted]";

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class InternalApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "InternalApiError";
    this.status = status;
  }
}

/**
 * Last line of defence. Everything this client logs or throws goes through
 * here, so a secret that leaks into an upstream error body or a redirected URL
 * still cannot reach the log stream. The header itself is never included in
 * any message in the first place; this is the belt to that pair of braces.
 */
export function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join(REDACTED);
}

export class InternalApiClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;

  constructor(options: InternalApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.secret = options.secret;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.logger = options.logger ?? noopLogger;
  }

  private url(path: string, query?: Record<string, string | undefined | null>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    init: { query?: Record<string, string | undefined | null>; body?: unknown; schema?: z.ZodType<T> },
  ): Promise<T> {
    const target = this.url(path, init.query);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(target, {
          method,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            // The secret lives here and nowhere else. Not in the URL, so it
            // cannot end up in an access log or a redirect Referer.
            [INTERNAL_SECRET_HEADER]: this.secret,
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const detail = await safeText(response);
          const error = new InternalApiError(
            redact(`${method} ${path} failed with ${response.status}: ${detail}`, this.secret),
            response.status,
          );
          // A 4xx is our bug or a rejected tenant. Retrying it just burns the
          // call clock while someone is on the line, so fail immediately.
          if (response.status < 500) throw error;
          lastError = error;
        } else {
          const payload = (await response.json().catch(() => null)) as unknown;
          if (!init.schema) return payload as T;
          const parsed = init.schema.safeParse(payload);
          if (!parsed.success) {
            throw new InternalApiError(
              `${method} ${path} returned an unexpected shape: ${parsed.error.issues
                .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
                .join("; ")}`,
              502,
            );
          }
          return parsed.data;
        }
      } catch (error) {
        if (error instanceof InternalApiError && error.status < 500) throw error;
        lastError = error;
      }

      if (attempt < this.retries) {
        await sleep(150 * 2 ** attempt);
      }
    }

    const message = redact(
      `${method} ${path} failed after ${this.retries + 1} attempts: ${describe(lastError)}`,
      this.secret,
    );
    this.logger.error("internal api request failed", { method, path, message });
    throw new InternalApiError(message, 502);
  }

  /** Resolve tenant, contact and recent history, and open (or adopt) the VoiceCall row. */
  startSession(input: StartSessionInput): Promise<SessionContext> {
    return this.request("POST", "/api/internal/voice/session", {
      body: input,
      schema: sessionContextSchema,
    });
  }

  /** Look up the contact we are speaking to, by id or by the number on the line. */
  lookupContact(input: {
    tenantId: string;
    contactId?: string | null;
    phone?: string | null;
  }): Promise<{ contact: ContactSummary | null }> {
    return this.request("GET", "/api/internal/voice/contact", {
      query: {
        tenantId: input.tenantId,
        contactId: input.contactId ?? undefined,
        phone: input.phone ?? undefined,
      },
      schema: z.object({ contact: contactSummarySchema.nullable() }),
    });
  }

  /** Recent activity for a contact, newest first, already trimmed by the app. */
  recentHistory(input: {
    tenantId: string;
    contactId: string;
    limit?: number;
  }): Promise<{ items: HistoryItem[] }> {
    return this.request("GET", "/api/internal/voice/contact/history", {
      query: {
        tenantId: input.tenantId,
        contactId: input.contactId,
        limit: input.limit ? String(input.limit) : undefined,
      },
      schema: z.object({ items: z.array(historyItemSchema) }),
    });
  }

  reportStatus(input: ReportStatusInput): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/internal/voice/call/status", {
      body: input,
      schema: z.object({ ok: z.boolean() }),
    });
  }

  logOutcome(input: LogOutcomeInput): Promise<{ ok: boolean; activityId: string | null }> {
    return this.request("POST", "/api/internal/voice/call/outcome", {
      body: input,
      schema: z.object({ ok: z.boolean(), activityId: z.string().nullable() }),
    });
  }

  scheduleFollowUp(input: ScheduleFollowUpInput): Promise<{ ok: boolean; taskId: string | null }> {
    return this.request("POST", "/api/internal/voice/follow-up", {
      body: input,
      schema: z.object({ ok: z.boolean(), taskId: z.string().nullable() }),
    });
  }

  completeCall(input: CompleteCallInput): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/internal/voice/call/complete", {
      body: input,
      schema: z.object({ ok: z.boolean() }),
    });
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "(no body)";
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
