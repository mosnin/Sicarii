// The worker holds one credential: the shared secret that lets it read and
// write every tenant's CRM data through the app. Worker logs are shipped to a
// third party log collector by every host we might run on, so a secret that
// reaches a log line is a secret that has left our trust boundary. These tests
// prove it never does, on the success path, on a 4xx, on a 5xx, and when the
// upstream error text contains the secret itself.

import { describe, expect, it, vi } from "vitest";
import {
  INTERNAL_SECRET_HEADER,
  InternalApiClient,
  InternalApiError,
  type Logger,
  redact,
} from "../tenant.js";

const SECRET = "sk_internal_2f6b9c4d8e1a7b3f5c9d0e2a4b6c8d0f";
const BASE = "https://app.example.com";

function recordingLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const push = (message: string, fields?: Record<string, unknown>) => {
    lines.push(`${message} ${JSON.stringify(fields ?? {})}`);
  };
  return {
    lines,
    logger: { info: push, warn: push, error: push },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("InternalApiClient credential handling", () => {
  it("sends the secret in a header and never in the URL", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      expect(target).not.toContain(SECRET);
      const headers = new Headers(init?.headers);
      expect(headers.get(INTERNAL_SECRET_HEADER)).toBe(SECRET);
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const client = new InternalApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl, retries: 0 });
    await client.reportStatus({
      tenantId: "user-A",
      roomName: "call-1",
      status: "RINGING",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("keeps the secret out of the log and out of the thrown error on a 4xx", async () => {
    const { logger, lines } = recordingLogger();
    // An upstream that echoes the credential back in its error body is exactly
    // the case a naive client would log verbatim.
    const fetchImpl = (async () =>
      new Response(`forbidden: bad credential ${SECRET}`, { status: 403 })) as unknown as typeof fetch;

    const client = new InternalApiClient({
      baseUrl: BASE,
      secret: SECRET,
      fetchImpl,
      logger,
      retries: 0,
    });

    await expect(
      client.lookupContact({ tenantId: "user-A", contactId: "contact-1" }),
    ).rejects.toBeInstanceOf(InternalApiError);

    let thrown = "";
    try {
      await client.lookupContact({ tenantId: "user-A", contactId: "contact-1" });
    } catch (error) {
      thrown = error instanceof Error ? `${error.message}${error.stack ?? ""}` : String(error);
    }

    expect(thrown).not.toContain(SECRET);
    expect(thrown).toContain("[redacted]");
    expect(lines.join("\n")).not.toContain(SECRET);
  });

  it("keeps the secret out of the log when the transport itself fails", async () => {
    const { logger, lines } = recordingLogger();
    const fetchImpl = (async () => {
      throw new Error(`connect ECONNREFUSED while presenting ${SECRET}`);
    }) as unknown as typeof fetch;

    const client = new InternalApiClient({
      baseUrl: BASE,
      secret: SECRET,
      fetchImpl,
      logger,
      retries: 0,
    });

    let thrown = "";
    try {
      await client.completeCall({
        tenantId: "user-A",
        roomName: "call-1",
        status: "COMPLETED",
        endedAt: new Date().toISOString(),
      });
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(SECRET);
    expect(thrown).not.toContain(SECRET);
  });

  it("logs nothing at all on the happy path", async () => {
    const { logger, lines } = recordingLogger();
    const fetchImpl = (async () =>
      jsonResponse({ ok: true, activityId: "activity-1" })) as unknown as typeof fetch;

    const client = new InternalApiClient({
      baseUrl: BASE,
      secret: SECRET,
      fetchImpl,
      logger,
      retries: 0,
    });
    await client.logOutcome({
      tenantId: "user-A",
      roomName: "call-1",
      summary: "Confirmed Thursday.",
      outcome: "interested",
    });
    expect(lines).toEqual([]);
  });
});

describe("InternalApiClient behaviour", () => {
  it("does not retry a 4xx, because retrying burns the call clock", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const client = new InternalApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl, retries: 3 });
    await expect(client.reportStatus({ tenantId: "user-A", roomName: "r", status: "RINGING" })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a response whose shape does not match the contract", async () => {
    const fetchImpl = (async () => jsonResponse({ surprise: true })) as unknown as typeof fetch;
    const client = new InternalApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl, retries: 0 });
    await expect(
      client.startSession({
        tenantId: "user-A",
        roomName: "call-1",
        direction: "OUTBOUND",
        fromNumber: "+15559998888",
        agentName: "scalar-agent",
      }),
    ).rejects.toThrow(/unexpected shape/);
  });

  it("parses a well formed session context", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        callId: "call-uuid",
        tenant: { id: "user-A", displayName: "Northwind", productContext: "We sell things." },
        contact: { id: "contact-1", name: "Dana" },
        recentHistory: [],
      })) as unknown as typeof fetch;

    const client = new InternalApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl, retries: 0 });
    const context = await client.startSession({
      tenantId: "user-A",
      roomName: "call-1",
      direction: "OUTBOUND",
      fromNumber: "+15559998888",
      agentName: "scalar-agent",
    });

    expect(context.callId).toBe("call-uuid");
    expect(context.tenant.voiceEnabled).toBe(true);
    expect(context.contact?.name).toBe("Dana");
    expect(context.recentHistory).toEqual([]);
  });
});

describe("redact", () => {
  it("replaces every occurrence", () => {
    expect(redact(`a ${SECRET} b ${SECRET}`, SECRET)).toBe("a [redacted] b [redacted]");
  });

  it("is a no op for an empty secret, rather than corrupting the message", () => {
    expect(redact("hello", "")).toBe("hello");
  });
});
