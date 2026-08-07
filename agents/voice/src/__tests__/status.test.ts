// Status mapping decides two things that cost real money: whether a failed
// dial gets billed as a conversation, and whether the retry policy tries the
// number again. A busy line that lands as FAILED is never retried; a dead
// number that lands as NO_ANSWER is retried forever.

import { describe, expect, it } from "vitest";
import {
  type CallState,
  createCallState,
  durationSeconds,
  finalCallStatus,
  serializeHistory,
  sipStatusToCallStatus,
} from "../lifecycle.js";

function state(overrides: Partial<CallState> = {}): CallState {
  return {
    ...createCallState({ tenantId: "user-A", roomName: "call-1", direction: "OUTBOUND" }),
    ...overrides,
  };
}

describe("sipStatusToCallStatus", () => {
  it("maps busy codes to BUSY", () => {
    expect(sipStatusToCallStatus(486)).toBe("BUSY");
    expect(sipStatusToCallStatus(600)).toBe("BUSY");
  });

  it("maps ring out and timeout codes to NO_ANSWER", () => {
    expect(sipStatusToCallStatus(408)).toBe("NO_ANSWER");
    expect(sipStatusToCallStatus(480)).toBe("NO_ANSWER");
    expect(sipStatusToCallStatus(487)).toBe("NO_ANSWER");
    expect(sipStatusToCallStatus(504)).toBe("NO_ANSWER");
  });

  it("maps refusals and dead numbers to FAILED", () => {
    for (const code of [401, 403, 404, 407, 410, 484, 485, 488, 502, 503, 603, 604, 606]) {
      expect(sipStatusToCallStatus(code)).toBe("FAILED");
    }
  });

  it("maps a 2xx to ANSWERED", () => {
    expect(sipStatusToCallStatus(200)).toBe("ANSWERED");
  });

  it("falls back to FAILED for an unmapped code rather than inventing a category", () => {
    expect(sipStatusToCallStatus(499)).toBe("FAILED");
    expect(sipStatusToCallStatus(302)).toBe("FAILED");
  });

  it("reads the reason phrase when no code came back", () => {
    expect(sipStatusToCallStatus(null, "Busy Here")).toBe("BUSY");
    expect(sipStatusToCallStatus(undefined, "no answer from the far end")).toBe("NO_ANSWER");
    expect(sipStatusToCallStatus(null, "Temporarily Unavailable")).toBe("NO_ANSWER");
  });

  it("treats a missing code with no usable reason as FAILED, not busy", () => {
    expect(sipStatusToCallStatus(null)).toBe("FAILED");
    expect(sipStatusToCallStatus(undefined, "")).toBe("FAILED");
    expect(sipStatusToCallStatus(Number.NaN)).toBe("FAILED");
  });
});

describe("finalCallStatus", () => {
  it("never returns an in flight status", () => {
    const terminal = ["COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "VOICEMAIL"];
    expect(terminal).toContain(finalCallStatus(state()));
  });

  it("reports a busy dial as BUSY, not as a conversation", () => {
    expect(
      finalCallStatus(state({ dialFailed: true, sipStatusCode: 486, sipStatus: "Busy Here" })),
    ).toBe("BUSY");
  });

  it("never lets a failed dial come out as ANSWERED", () => {
    expect(finalCallStatus(state({ dialFailed: true, sipStatusCode: 200 }))).toBe("FAILED");
  });

  it("reports a machine as VOICEMAIL even though the line was answered", () => {
    expect(finalCallStatus(state({ answeredAt: new Date(), reachedVoicemail: true }))).toBe(
      "VOICEMAIL",
    );
  });

  it("reports an answered call as COMPLETED even if something failed afterwards", () => {
    expect(
      finalCallStatus(state({ answeredAt: new Date(), failureReason: "tts provider blew up" })),
    ).toBe("COMPLETED");
  });

  it("reports a call that never connected as FAILED", () => {
    expect(finalCallStatus(state({ failureReason: "tenant resolution failed" }))).toBe("FAILED");
  });

  it("honors an explicit override, which is how a refused call is recorded", () => {
    expect(finalCallStatus(state({ statusOverride: "FAILED", answeredAt: new Date() }))).toBe(
      "FAILED",
    );
  });
});

describe("durationSeconds", () => {
  it("measures from answer, not from dispatch, so ring time is not billed", () => {
    const started = new Date("2026-08-07T10:00:00Z");
    const answered = new Date("2026-08-07T10:00:20Z");
    const ended = new Date("2026-08-07T10:01:20Z");
    const s = state({ startedAt: started, answeredAt: answered });
    expect(durationSeconds(s, ended)).toBe(60);
  });

  it("is null when the call was never answered", () => {
    expect(durationSeconds(state(), new Date())).toBeNull();
  });
});

describe("serializeHistory", () => {
  it("uses toJSON when the ChatContext offers one", () => {
    expect(serializeHistory({ toJSON: () => ({ items: [1, 2] }) })).toEqual({ items: [1, 2] });
  });

  it("passes a plain value through", () => {
    expect(serializeHistory({ items: [] })).toEqual({ items: [] });
  });

  it("returns null rather than throwing when serialization fails", () => {
    expect(
      serializeHistory({
        toJSON: () => {
          throw new Error("circular");
        },
      }),
    ).toBeNull();
    expect(serializeHistory(undefined)).toBeNull();
    expect(serializeHistory(null)).toBeNull();
  });
});
