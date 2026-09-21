// Agent outreach mailboxes (Card 0015): unit tests for the pure modules.
// Provider clients (godaddy / bird / premium-inboxes transports) are exercised
// against live keys only (smoke scripts, same drill as agentphone-smoke) —
// never mocked HTTP here, so these tests prove the logic, not the wire.
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  normalizeDomain,
  normalizeEmailAddr,
  parseSequenceSteps,
  isMailboxPlatform,
} from "@/lib/outreach/types";
import {
  buildSpfRecord,
  buildDkimRecord,
  buildDmarcRecord,
  isDnsReady,
  type DnsVerification,
} from "@/lib/outreach/dns";
import {
  targetForDay,
  effectiveDailyCap,
  evaluateWarmupDay,
  isRampComplete,
  WARMUP_DAYS,
} from "@/lib/outreach/warmup";
import { pickMailbox, fleetCapacityToday, type RotationCandidate } from "@/lib/outreach/rotation";
import {
  validateInboxOrder,
  renderIntakeCsv,
  orderInboxCount,
} from "@/lib/outreach/premium-inboxes";
import { parseBirdWebhook, verifyBirdSignature } from "@/lib/outreach/bird";
import { renderTemplate, applyOpener, unsubscribeUrlFor } from "@/lib/outreach-send";
import { runEnvDoctor } from "@/lib/env-doctor";

describe("normalizeDomain", () => {
  it("accepts a bare domain and lowercases it", () => {
    expect(normalizeDomain("GetAcme.CO")).toBe("getacme.co");
  });
  it("rejects schemes, paths, ports, and single labels", () => {
    expect(normalizeDomain("https://acme.co")).toBeNull();
    expect(normalizeDomain("acme.co/path")).toBeNull();
    expect(normalizeDomain("acme.co:443")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });
});

describe("normalizeEmailAddr", () => {
  it("lowercases and validates", () => {
    expect(normalizeEmailAddr("Leo@GetAcme.co")).toBe("leo@getacme.co");
    expect(normalizeEmailAddr("not-an-email")).toBeNull();
    expect(normalizeEmailAddr("a@b")).toBeNull();
  });
});

describe("parseSequenceSteps", () => {
  it("accepts 1-10 valid steps and slices overlong copy", () => {
    const steps = parseSequenceSteps([
      { dayOffset: 0, subject: "hi", body: "x".repeat(60_000), variantKind: "subject" },
      { dayOffset: 3, subject: "bump", body: "short {{firstName}}" },
    ]);
    expect(steps?.length).toBe(2);
    expect(steps?.[0].body.length).toBe(50_000);
    expect(steps?.[1].variantKind).toBeNull();
  });
  it("rejects empty, oversized, and malformed step lists", () => {
    expect(parseSequenceSteps([])).toBeNull();
    expect(parseSequenceSteps(new Array(11).fill({ dayOffset: 0, subject: "s", body: "b" }))).toBeNull();
    expect(parseSequenceSteps([{ dayOffset: -1, subject: "s", body: "b" }])).toBeNull();
    expect(parseSequenceSteps([{ subject: "s", body: "b" }])).toBeNull();
    expect(isMailboxPlatform("yahoo")).toBe(false);
    expect(isMailboxPlatform("google")).toBe(true);
  });
});

describe("dns builders", () => {
  it("builds a single SPF record (never two — receivers permerror on two)", () => {
    const spf = buildSpfRecord(["_spf.google.com"]);
    expect(spf).toEqual({ type: "TXT", host: "@", value: "v=spf1 include:_spf.google.com ~all" });
  });
  it("builds DKIM CNAME + DMARC starting at p=none", () => {
    expect(buildDkimRecord("google", "google._domainkey.example.com")).toEqual({
      type: "CNAME",
      host: "google._domainkey",
      value: "google._domainkey.example.com",
    });
    const dmarc = buildDmarcRecord();
    expect(dmarc.host).toBe("_dmarc");
    expect(dmarc.value).toContain("p=none");
    expect(buildDmarcRecord("reject", "post@example.com").value).toContain("p=reject");
  });
  it("isDnsReady requires all three checks", () => {
    const base: DnsVerification = {
      spf: true, dkim: true, dmarc: true, dmarcPolicy: "none", checkedAt: "", detail: [],
    };
    expect(isDnsReady(base)).toBe(true);
    expect(isDnsReady({ ...base, dkim: false })).toBe(false);
  });
});

describe("warmup ramp", () => {
  it("starts at a trickle and grows to full pace over 30 days", () => {
    expect(WARMUP_DAYS).toBe(30);
    expect(targetForDay(0)).toBe(0);
    expect(targetForDay(1)).toBe(5);
    expect(targetForDay(7)).toBeLessThanOrEqual(12);
    expect(targetForDay(30)).toBe(120);
    expect(targetForDay(99)).toBe(120);
  });
  it("caps warming mailboxes at the ramp, ready ones at config", () => {
    expect(effectiveDailyCap({ warmupDay: 1, status: "warming", dailyCap: 150 })).toBe(5);
    expect(effectiveDailyCap({ warmupDay: 30, status: "ready", dailyCap: 150 })).toBe(150);
    expect(effectiveDailyCap({ warmupDay: 5, status: "paused", dailyCap: 150 })).toBe(0);
  });
  it("holds on weak signal, regresses on sustained damage", () => {
    const clean = { sent: 10, opened: 4, replied: 1, bounced: 0, placement: "inbox" as const };
    expect(evaluateWarmupDay(3, clean, 0).action).toBe("advance");
    const spammy = { ...clean, placement: "spam" as const };
    expect(evaluateWarmupDay(3, spammy, 0).action).toBe("hold");
    expect(evaluateWarmupDay(3, spammy, 1).action).toBe("regress");
    const bouncy = { ...clean, bounced: 1 };
    expect(evaluateWarmupDay(3, bouncy, 0).action).toBe("hold");
    const veryBouncy = { ...clean, bounced: 2 };
    expect(evaluateWarmupDay(3, veryBouncy, 0).action).toBe("regress");
    expect(isRampComplete(30)).toBe(true);
    expect(isRampComplete(29)).toBe(false);
  });
});

function candidate(over: Partial<RotationCandidate> = {}): RotationCandidate {
  return {
    id: "mb-1",
    email: "leo@getacme.co",
    domainId: "d-1",
    status: "ready",
    warmupDay: 30,
    dailyCap: 100,
    sentToday: 0,
    capDay: new Date().toISOString().slice(0, 10),
    hardBounces: 0,
    complaints: 0,
    domainQuarantined: false,
    ...over,
  };
}

describe("rotation picker", () => {
  it("picks least-sent eligible and skips the unhealthy", () => {
    const busy = candidate({ id: "mb-busy", sentToday: 90 });
    const fresh = candidate({ id: "mb-fresh", sentToday: 2 });
    const quarantined = candidate({ id: "mb-q", domainQuarantined: true });
    const complained = candidate({ id: "mb-c", complaints: 1 });
    const bouncy = candidate({ id: "mb-b", hardBounces: 9 });
    const warming = candidate({ id: "mb-w", status: "warming", warmupDay: 1, sentToday: 0 });
    const pick = pickMailbox([busy, fresh, quarantined, complained, bouncy, warming]);
    expect(pick?.mailboxId).toBe("mb-w"); // warming day-1 target is 5, sent 0 → least sent
    expect(pickMailbox([quarantined, complained, bouncy])).toBeNull();
  });
  it("respects caps and resets on day rollover", () => {
    const capped = candidate({ sentToday: 100, dailyCap: 100 });
    expect(pickMailbox([capped])).toBeNull();
    const stale = candidate({ sentToday: 100, capDay: "2001-01-01" });
    expect(pickMailbox([stale])?.mailboxId).toBe("mb-1");
    expect(fleetCapacityToday([capped, stale])).toBe(100);
  });
});

describe("premium-inboxes adapter", () => {
  it("validates orders before they touch provider or DB", () => {
    expect(validateInboxOrder({ lines: [] })).toMatch(/at least one/);
    expect(validateInboxOrder({ lines: [{ domain: "getacme.co", count: 0, platform: "google" }] })).toMatch(/1–100/);
    expect(
      validateInboxOrder({ lines: [{ domain: "getacme.co", count: 2, platform: "yahoo" as never }] }),
    ).toMatch(/google\|microsoft/);
    expect(
      validateInboxOrder({ lines: [{ domain: "getacme.co", count: 2, platform: "microsoft", localParts: ["a", "b"] }] }),
    ).toBeNull();
  });
  it("renders a manual intake CSV and counts inboxes", () => {
    const order = { lines: [{ domain: "getacme.co", count: 2, platform: "google" as const }] };
    expect(orderInboxCount(order)).toBe(2);
    const csv = renderIntakeCsv({ ...order, sequencerTarget: "scalar", customerRef: "u-1" });
    expect(csv.split("\n").length).toBe(3); // header + 2 rows
    expect(csv).toContain("getacme.co");
  });
});

describe("bird webhook parsing", () => {
  it("classifies delivery events and never throws on drift", () => {
    expect(parseBirdWebhook({ type: "email.delivered", data: { message_id: "m-1", to: "a@b.co" } }).event).toBe("delivered");
    expect(
      parseBirdWebhook({ event: "bounce", data: { messageId: "m-2", bounce_kind: "hard" } }),
    ).toMatchObject({ event: "bounced", bounceKind: "hard", messageId: "m-2" });
    expect(parseBirdWebhook({ type: "weird.future", data: {} }).event).toBe("unknown");
    expect(parseBirdWebhook(null).event).toBe("unknown");
  });
  it("rejects bad signatures and accepts good ones", () => {
    process.env.BIRD_WEBHOOK_SECRET = "test-secret";
    const body = '{"hello":"world"}';
    expect(verifyBirdSignature(body, null)).toBe(false);
    expect(verifyBirdSignature(body, "deadbeef")).toBe(false);
    const good = createHmac("sha256", "test-secret").update(body, "utf8").digest("hex");
    expect(verifyBirdSignature(body, good)).toBe(true);
    expect(verifyBirdSignature(body, `sha256=${good}`)).toBe(true);
    delete process.env.BIRD_WEBHOOK_SECRET;
  });
});

describe("copy rendering", () => {
  it("fills tokens from the contact and never invents data", () => {
    expect(renderTemplate("Hi {{firstName}} at {{company}}", { name: "Leo Park", company: "Acme" })).toBe(
      "Hi Leo at Acme",
    );
    expect(renderTemplate("Hi {{firstName}}", { name: null, company: null })).toBe("Hi ");
  });
  it("slots openers into {{opener}} or prepends", () => {
    expect(applyOpener("Line1\n{{opener}}\nLine3", "HOOK")).toBe("Line1\nHOOK\nLine3");
    expect(applyOpener("Body here", "HOOK")).toBe("HOOK\n\nBody here");
  });
  it("builds send-scoped unsubscribe URLs", () => {
    expect(unsubscribeUrlFor("send-123")).toContain("/api/outreach/unsubscribe?send=send-123");
  });
});

describe("env doctor outreach group", () => {
  it("reports the outreach integrations missing on a bare env, passing when set", () => {
    const bare = runEnvDoctor({});
    const names = bare.groups.flatMap((g) => g.checks.map((c) => c.name));
    expect(names).toContain("GoDaddy domains (buy + DNS)");
    expect(names).toContain("Bird email rail (send + webhooks)");
    expect(names).toContain("PremiumInboxes DFY inboxes");
    const set = runEnvDoctor({
      GODADDY_PAT: "pat",
      BIRD_API_KEY: "k",
      BIRD_WEBHOOK_SECRET: "s",
      PREMIUMINBOXES_API_KEY: "k",
      WARMUP_SEED_ADDRESSES: "seed@example.com",
    });
    const group = set.groups.find((g) => g.group === "Outreach infrastructure");
    expect(group?.checks.every((c) => c.status === "pass")).toBe(true);
  });
});
