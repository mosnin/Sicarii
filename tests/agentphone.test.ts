// AgentPhone defensive parsing: the response shapes are unverified against
// the live API, so placeCall()/getCall() must degrade gracefully - never
// throw, never fabricate a value, and never look like a success - when the
// API returns something other than the documented shape. See the doc
// comment at the top of src/lib/agentphone.ts.
import { describe, it, expect, vi, afterEach } from "vitest";
import { placeCall, getCall, isAgentPhoneConfigured } from "@/lib/agentphone";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}
function rawResponse(text: string, ok = true, status = 200) {
  return { ok, status, text: async () => text } as Response;
}

function stubFetch(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isAgentPhoneConfigured", () => {
  it("is false for empty/missing keys, true for a real one", () => {
    expect(isAgentPhoneConfigured(undefined)).toBe(false);
    expect(isAgentPhoneConfigured(null)).toBe(false);
    expect(isAgentPhoneConfigured("")).toBe(false);
    expect(isAgentPhoneConfigured("   ")).toBe(false);
    expect(isAgentPhoneConfigured("sk_live_abc")).toBe(true);
  });
});

describe("placeCall - well-formed response", () => {
  it("parses id/status/startedAt", async () => {
    stubFetch(jsonResponse({ id: "call_123", status: "queued", startedAt: "2026-07-18T00:00:00Z" }));
    const result = await placeCall("key", { toNumber: "+15551234567", systemPrompt: "hi" });
    expect(result).toEqual({ callId: "call_123", status: "queued", startedAt: "2026-07-18T00:00:00Z" });
  });

  it("falls back to snake_case field names", async () => {
    stubFetch(jsonResponse({ call_id: "call_456", status: "queued", started_at: "2026-07-18T00:00:00Z" }));
    const result = await placeCall("key", { toNumber: "+15551234567", systemPrompt: "hi" });
    expect(result.callId).toBe("call_456");
    expect(result.startedAt).toBe("2026-07-18T00:00:00Z");
  });
});

describe("placeCall - malformed response", () => {
  it("degrades to callId: '' and warns when the response has no usable id, without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(jsonResponse({ status: "queued" })); // no id / call_id / callId at all
    const result = await placeCall("key", { toNumber: "+15551234567", systemPrompt: "hi" });
    expect(result.callId).toBe("");
    expect(result.status).toBe("queued");
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("no usable call id"))).toBe(true);
  });

  it("does not throw and does not fabricate a callId when the top-level response is an array", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(jsonResponse([{ id: "looks_like_a_call_but_is_not" }]));
    const result = await placeCall("key", { toNumber: "+15551234567", systemPrompt: "hi" });
    expect(result.callId).toBe("");
    expect(result.status).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("does not throw when the response body is 'null'", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(rawResponse("null"));
    const result = await placeCall("key", { toNumber: "+15551234567", systemPrompt: "hi" });
    expect(result.callId).toBe("");
    expect(warn).toHaveBeenCalled();
  });

  it("does not throw when the response body is not valid JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(rawResponse("<html>not json</html>"));
    const result = await placeCall("key", { toNumber: "+15551234567", systemPrompt: "hi" });
    expect(result.callId).toBe("");
    expect(warn).toHaveBeenCalled();
  });

  it("ignores a numeric or empty-string id rather than coercing it into a fake callId", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(jsonResponse({ id: 12345, status: "queued" })); // id is a number, not a string
    const result = await placeCall("key", { toNumber: "+15551234567", systemPrompt: "hi" });
    expect(result.callId).toBe("");
    expect(warn).toHaveBeenCalled();
  });
});

describe("getCall - well-formed response", () => {
  it("parses status/duration/transcript/recordingUrl/toNumber/fromNumber", async () => {
    stubFetch(
      jsonResponse({
        status: "completed",
        durationSec: 42,
        transcripts: [
          { role: "agent", text: "Hello, this is Scalar." },
          { role: "user", text: "Who is this?" },
        ],
        recordingUrl: "https://cdn.agentphone.ai/rec/abc.mp3",
        toNumber: "+15551234567",
        fromNumber: "+15557654321",
      }),
    );
    const result = await getCall("key", "call_123");
    expect(result).toEqual({
      status: "completed",
      durationSec: 42,
      transcript: "agent: Hello, this is Scalar.\nuser: Who is this?",
      recordingUrl: "https://cdn.agentphone.ai/rec/abc.mp3",
      toNumber: "+15551234567",
      fromNumber: "+15557654321",
    });
  });

  it("falls back to snake_case field names", async () => {
    stubFetch(
      jsonResponse({
        status: "completed",
        duration_sec: 10,
        recording_url: "https://cdn.agentphone.ai/rec/def.mp3",
        to_number: "+1",
        from_number: "+2",
      }),
    );
    const result = await getCall("key", "call_123");
    expect(result.durationSec).toBe(10);
    expect(result.recordingUrl).toBe("https://cdn.agentphone.ai/rec/def.mp3");
    expect(result.toNumber).toBe("+1");
    expect(result.fromNumber).toBe("+2");
  });

  it("accepts a plain string transcript", async () => {
    stubFetch(jsonResponse({ status: "completed", transcript: "agent: hi\nuser: hello" }));
    const result = await getCall("key", "call_123");
    expect(result.transcript).toBe("agent: hi\nuser: hello");
  });
});

describe("getCall - malformed response", () => {
  it("degrades every field to undefined and warns when the top-level shape is unexpected, without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(jsonResponse("just a string, not an object"));
    const result = await getCall("key", "call_123");
    expect(result).toEqual({
      status: undefined,
      durationSec: undefined,
      transcript: undefined,
      recordingUrl: undefined,
      toNumber: undefined,
      fromNumber: undefined,
    });
    expect(warn).toHaveBeenCalled();
  });

  it("drops non-object transcript entries instead of throwing, and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(
      jsonResponse({
        status: "completed",
        transcripts: [null, "a bare string entry", 42, { role: "agent", text: "the only valid one" }],
      }),
    );
    const result = await getCall("key", "call_123");
    expect(result.transcript).toBe("agent: the only valid one");
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("skipped"))).toBe(true);
  });

  it("does not treat a duration string as a number", async () => {
    stubFetch(jsonResponse({ status: "completed", durationSec: "42 seconds" }));
    const result = await getCall("key", "call_123");
    expect(result.durationSec).toBeUndefined();
  });

  it("returns undefined transcript (not a throw, not a garbage string) for a transcript object with no recognizable shape", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(jsonResponse({ status: "completed", transcript: { unexpected: "shape" } }));
    const result = await getCall("key", "call_123");
    expect(result.transcript).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
