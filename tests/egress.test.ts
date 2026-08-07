// The data boundary is a legal boundary, so these tests pin both halves of it:
// what may leave for a third party, and what may land on a person's record.
//
// Two failure modes matter and they pull in opposite directions. A MISS ships a
// customer's words to Exa. A FALSE POSITIVE breaks a real search, which the
// operator feels immediately. The false-positive block below is therefore not
// decoration: it is the constraint that keeps the guard shippable.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  assertNoCustomerText,
  inspectEgressText,
  redactForEgress,
  EgressBlockedError,
  containsSpecialCategory,
  inspectRecordable,
  assertRecordable,
  filterRecordable,
  SpecialCategoryError,
  SPECIAL_CATEGORIES,
} from "@/lib/egress";

// ── Fixtures ────────────────────────────────────────────────────────────────

const PASTED_THREAD = `From: Jane Whitfield <jane.whitfield@northwind-logistics.com>
To: Sam Reyes <sam@scalar.example>
Subject: Re: Q3 renewal and the warehouse rollout
Date: Tue, 14 Apr 2026 09:12:04 +0100

Hi Sam,

Thanks for jumping on the call yesterday. I spoke to our ops lead and she is
happy with the pricing, but we need the warehouse rollout to land before the
peak season or finance will push the whole thing to next year. Can you send
over the revised SOW with the November date in it?

Best regards,
Jane`;

const QUOTED_REPLY = `Sounds good, let's do Thursday.

On Tue, 14 Apr 2026 at 09:12, Jane Whitfield <jane@northwind.example> wrote:
> Thanks for jumping on the call yesterday. I spoke to our ops lead and she
> is happy with the pricing, but we need the rollout before peak season.`;

const SIGNATURE_BLOCK = `Jane Whitfield
VP Operations, Northwind Logistics

--
Jane Whitfield
Northwind Logistics Ltd`;

// Realistic, legitimate searches an agent actually runs in this product. Every
// one of these MUST pass. They are drawn from the real call sites: discovery
// prompts, swarm angles, entity news lookups, social lookups.
const LEGITIMATE_QUERIES = [
  "what did Acme announce in 2026",
  "nail salons in Miami",
  "Northwind Logistics news",
  "Northwind Logistics hiring OR funding OR acquisition OR expansion OR launch OR partnership",
  "B2B SaaS companies in Austin with 10 to 50 employees that raised a seed round in the last year",
  '"Jane Whitfield" "Northwind Logistics" profile (site:linkedin.com/in OR site:x.com OR site:twitter.com)',
  "Leadership team, executives, and key decision makers at Northwind Logistics (northwind.example)",
  "independent physical therapy clinics in Greater Manchester",
  "credit unions in Ohio offering commercial lending",
  "companies mentioning warehouse automation in their 2026 annual report",
  "who is the VP of Operations at Northwind Logistics",
  "Subject: renewals as a search topic for B2B pricing pages",
  "logistics firms that switched ERP vendors between 2024 and 2026",
];

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every log line written during `fn`, joined. Used to prove nothing leaked. */
function logsDuring(fn: () => void): string {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => void lines.push(a.join(" ")));
  const error = vi.spyOn(console, "error").mockImplementation((...a) => void lines.push(a.join(" ")));
  warnSpy.mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
  try {
    fn();
  } catch {
    // The throw is the point; we only care about what was logged on the way out.
  }
  log.mockRestore();
  error.mockRestore();
  return lines.join("\n");
}

// ── Egress: catching pasted customer text ───────────────────────────────────

describe("inspectEgressText: pasted thread detection", () => {
  it("blocks a full pasted email thread", () => {
    const r = inspectEgressText(PASTED_THREAD);
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("email-header");
    expect(r.rules).toContain("pasted-block");
  });

  it("blocks on email headers alone, without the body", () => {
    const r = inspectEgressText("From: jane@northwind.example\nSubject: Q3 renewal");
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("email-header");
  });

  it("does not block a single header-shaped word in a real query", () => {
    expect(inspectEgressText("subject matter experts in cold chain logistics").ok).toBe(true);
  });
});

describe("inspectEgressText: quoted-reply detection", () => {
  it("blocks an \"On <date>, <name> wrote:\" reply", () => {
    const r = inspectEgressText(QUOTED_REPLY);
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("quoted-reply");
  });

  it("blocks an original-message separator", () => {
    const r = inspectEgressText("interesting\n-----Original Message-----\nfrom the buyer");
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("quoted-reply");
  });

  it("blocks two or more \">\" quoted lines", () => {
    const r = inspectEgressText("> we need the rollout before peak\n> or finance pushes it");
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("quoted-reply");
  });
});

describe("inspectEgressText: signature blocks and raw identifiers", () => {
  it("blocks a signature block", () => {
    const r = inspectEgressText(SIGNATURE_BLOCK);
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("signature-block");
  });

  it("blocks a mobile mail-client footer", () => {
    const r = inspectEgressText("can we move to Thursday\n\nSent from my iPhone");
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("signature-block");
  });

  it("blocks a raw email address in a search string", () => {
    const r = inspectEgressText("who is jane.whitfield@northwind-logistics.com");
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("embedded-email-address");
  });

  it("blocks a raw phone number in a search string", () => {
    for (const q of [
      "company for +44 20 7946 0958",
      "who owns (415) 555-0134",
      "reverse lookup 415-555-0134",
    ]) {
      expect(inspectEgressText(q).rules, q).toContain("embedded-phone-number");
    }
  });

  it("blocks a long verbatim quote", () => {
    const quote = `"${"we need the warehouse rollout to land before peak season or finance will push it ".repeat(3)}"`;
    const r = inspectEgressText(quote);
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("verbatim-quote");
  });

  it("blocks anything past the query ceiling", () => {
    const r = inspectEgressText("logistics companies in Manchester ".repeat(30));
    expect(r.ok).toBe(false);
    expect(r.rules).toContain("over-length");
  });
});

// This block is the one that matters most in production: it is the reason the
// thresholds are loose. If a change here starts failing, the guard has become
// too aggressive and will break real searches.
describe("inspectEgressText: legitimate queries pass cleanly", () => {
  for (const q of LEGITIMATE_QUERIES) {
    it(`passes: ${q.slice(0, 56)}`, () => {
      const r = inspectEgressText(q);
      expect(r.ok, `blocked by ${r.rules.join(", ")}`).toBe(true);
      expect(r.rules).toEqual([]);
    });
  }

  it("does not mistake numeric business detail for a phone number", () => {
    for (const q of [
      "SaaS companies with 500 to 1000 employees",
      "logistics deals between 2020 and 2024",
      "companies that raised 25000000 in series B",
    ]) {
      expect(inspectEgressText(q).rules, q).not.toContain("embedded-phone-number");
    }
  });

  it("treats empty and whitespace input as safe", () => {
    expect(inspectEgressText("").ok).toBe(true);
    expect(inspectEgressText("   ").ok).toBe(true);
  });
});

describe("assertNoCustomerText", () => {
  it("is a no-op for a legitimate query", () => {
    expect(() => assertNoCustomerText("what did Acme announce in 2026", "exa.search")).not.toThrow();
  });

  it("throws EgressBlockedError carrying the rules and the call-site label", () => {
    try {
      assertNoCustomerText(PASTED_THREAD, "exa.search");
      throw new Error("expected assertNoCustomerText to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EgressBlockedError);
      const err = e as EgressBlockedError;
      expect(err.name).toBe("EgressBlockedError");
      expect(err.context).toBe("exa.search");
      expect(err.rules.length).toBeGreaterThan(0);
      // 400 (fix the request) and NOT 502 (provider outage) - the two must never
      // be confused, or an agent will retry a refusal forever.
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/ask about the public fact/i);
    }
  });

  it("is distinguishable from a provider outage", () => {
    const outage = new Error("Exa /search failed (503): upstream unavailable");
    expect(outage instanceof EgressBlockedError).toBe(false);
  });
});

describe("redactForEgress", () => {
  it("produces a derived string that passes the guard", () => {
    for (const source of [PASTED_THREAD, QUOTED_REPLY, SIGNATURE_BLOCK]) {
      const redacted = redactForEgress(source);
      expect(() => assertNoCustomerText(redacted, "test")).not.toThrow();
    }
  });

  it("removes email addresses, phone numbers, headers and quoted history", () => {
    const redacted = redactForEgress(PASTED_THREAD);
    expect(redacted).not.toContain("@");
    expect(redacted).not.toContain("Subject:");
    expect(redacted).not.toContain("\n");
    expect(redacted.length).toBeLessThanOrEqual(240);
  });

  it("returns an empty string for empty input", () => {
    expect(redactForEgress("")).toBe("");
    expect(redactForEgress("   ")).toBe("");
  });
});

// ── Special categories: what may never land on a record ─────────────────────

const SPECIAL_VALUES: Record<string, { value: string; category: string }> = {
  health: { value: "Deal slipped because he is undergoing chemotherapy until March", category: "health" },
  "health (contextual)": { value: "She has been diagnosed with cancer and is off work", category: "health" },
  political: { value: "Voted for the incumbent, strong political views on trade", category: "political" },
  "political (contextual)": { value: "He leans socialist and dislikes our pricing page", category: "political" },
  religion: { value: "Devout, will not take meetings on Saturdays", category: "religion" },
  "religion (contextual)": { value: "He is a practising catholic, avoid Sunday calls", category: "religion" },
  "sexual-orientation": { value: "Buyer's sexual orientation came up on the call", category: "sexual-orientation" },
  ethnicity: { value: "Contact is a green card holder, mentioned visa status", category: "ethnicity" },
  "trade-union": { value: "Procurement lead is a union member and a shop steward", category: "trade-union" },
  criminal: { value: "Background check flagged a felony conviction in 2019", category: "criminal" },
};

describe("containsSpecialCategory", () => {
  it("exports every Article 9 category we claim to cover", () => {
    expect([...SPECIAL_CATEGORIES].sort()).toEqual(
      ["criminal", "ethnicity", "health", "political", "religion", "sexual-orientation", "trade-union"],
    );
  });

  for (const [label, { value, category }] of Object.entries(SPECIAL_VALUES)) {
    it(`detects ${label}`, () => {
      const r = containsSpecialCategory(value);
      expect(r.found, value).toBe(true);
      expect(r.categories).toContain(category);
    });
  }

  it("returns a structured result, never the matched value", () => {
    const r = containsSpecialCategory(SPECIAL_VALUES.health.value);
    expect(r.findings.every((f) => f.signal === "explicit-term" || f.signal === "personal-context")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("chemotherapy");
  });

  it("ignores non-string and empty values", () => {
    for (const v of [null, undefined, 42, {}, "", "   "]) {
      expect(containsSpecialCategory(v).found).toBe(false);
    }
  });

  // The false-positive edge for the record guard: business context that merely
  // uses a sensitive-sounding word. Refusing these would make the CRM unusable
  // for anyone selling into healthcare, finance, or the public sector.
  it("allows business context that only resembles special-category data", () => {
    for (const v of [
      "Physical therapy clinic, 40 practitioners, Manchester",
      "Regional credit union, commercial lending division",
      "Oncology software vendor, Series B",
      "Conservatory installation company in Surrey",
      "Sells disability insurance to mid-market employers",
      "Church Street office, second floor",
      "European Union grant recipient",
      "Union Square, San Francisco",
      "Black Forest Coffee Roasters, wholesale accounts",
      "Head of Diversity, Equity and Inclusion",
    ]) {
      expect(containsSpecialCategory(v).found, v).toBe(false);
    }
  });
});

describe("assertRecordable", () => {
  it("allows ordinary business fields", () => {
    for (const [field, value] of [
      ["industry", "Third-party logistics"],
      ["title", "VP of Operations"],
      ["notes", "Renewal due in November, wants the revised SOW first"],
      ["location", "Manchester, UK"],
      ["website", "https://northwind.example"],
    ] as const) {
      expect(() => assertRecordable(field, value)).not.toThrow();
    }
  });

  for (const [label, { value, category }] of Object.entries(SPECIAL_VALUES)) {
    it(`refuses ${label} whichever provider supplied it`, () => {
      try {
        assertRecordable("notes", value);
        throw new Error(`expected assertRecordable to refuse ${label}`);
      } catch (e) {
        expect(e).toBeInstanceOf(SpecialCategoryError);
        expect((e as SpecialCategoryError).categories).toContain(category);
        expect((e as SpecialCategoryError).status).toBe(400);
      }
    });
  }

  it("refuses on the field name alone, whatever the value is", () => {
    expect(() => assertRecordable("health_status", "green")).toThrow(SpecialCategoryError);
    expect(() => assertRecordable("criminal record", "none")).toThrow(SpecialCategoryError);
    expect(() => assertRecordable("ethnicity", "prefer not to say")).toThrow(SpecialCategoryError);
  });

  it("allows clearing a field", () => {
    expect(() => assertRecordable("notes", null)).not.toThrow();
    expect(() => assertRecordable("notes", "")).not.toThrow();
    expect(() => assertRecordable("notes", undefined)).not.toThrow();
  });
});

describe("filterRecordable", () => {
  it("keeps the safe rows and reports the refused fields", () => {
    const { kept, refused } = filterRecordable([
      { field: "industry", value: "Third-party logistics" },
      { field: "notes", value: SPECIAL_VALUES.health.value },
      { field: "phone", value: "+44 20 7946 0958" },
    ]);
    expect(kept.map((r) => r.field)).toEqual(["industry", "phone"]);
    expect(refused).toEqual([{ field: "notes", categories: ["health"] }]);
  });
});

// ── The non-negotiable: nothing sensitive ever leaves in an error or a log ──

describe("no sensitive value ever reaches an error message or a log line", () => {
  const SECRETS = [
    "chemotherapy",
    "jane.whitfield@northwind-logistics.com",
    "warehouse rollout",
    "peak season",
    "Jane Whitfield",
    "+44 20 7946 0958",
    "felony",
    "shop steward",
  ];

  function assertClean(text: string, secrets: string[]) {
    for (const s of secrets) {
      expect(text.toLowerCase(), `leaked "${s}"`).not.toContain(s.toLowerCase());
    }
  }

  it("keeps the blocked query out of the egress error and its logs", () => {
    let message = "";
    const logs = logsDuring(() => {
      try {
        assertNoCustomerText(PASTED_THREAD, "exa.search");
      } catch (e) {
        message = `${(e as Error).message} ${JSON.stringify(e as EgressBlockedError)}`;
        throw e;
      }
    });
    assertClean(message, SECRETS);
    assertClean(logs, SECRETS);
    // It still says something useful: the shape, and the call site.
    expect(logs).toContain("exa.search");
  });

  it("keeps the refused value out of the special-category error and its logs", () => {
    let message = "";
    const logs = logsDuring(() => {
      try {
        assertRecordable("notes", SPECIAL_VALUES.health.value);
      } catch (e) {
        const err = e as SpecialCategoryError;
        message = `${err.message} ${err.categories.join(",")} ${JSON.stringify(err.categories)}`;
        throw e;
      }
    });
    assertClean(message, SECRETS);
    assertClean(logs, SECRETS);
    // The field name and the category are safe and are what an operator needs.
    expect(logs).toContain("notes");
    expect(logs).toContain("health");
  });

  it("keeps values out of every structured result", () => {
    assertClean(JSON.stringify(inspectEgressText(PASTED_THREAD)), SECRETS);
    assertClean(JSON.stringify(containsSpecialCategory(SPECIAL_VALUES.criminal.value)), SECRETS);
    assertClean(JSON.stringify(inspectRecordable("notes", SPECIAL_VALUES["trade-union"].value)), SECRETS);
  });
});
