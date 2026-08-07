// The data boundary: what may LEAVE the tenant, and what may LAND on a person's
// record. Two guards, one file, no dependencies beyond OpError.
//
// THE PRINCIPLE: the boundary is egress, not reading. Inside their own tenant
// the agent may read everything - it is the operator's own data, and a signature
// block or a thread reply is the best evidence there is. What matters is what
// leaves for a third party, and what gets written onto a person's record.
//
// Scalar ships strings to a lot of other people's APIs (Exa, Tavily, Linkup,
// Firecrawl, Bright Data, Apify, and more arriving). Every one of those calls is
// a transfer to a processor we do not control. A derived question ("what did
// Acme announce in 2026") is a legitimate transfer. A pasted customer email is
// not: it moves a data subject's own words to a party they never heard of, for a
// purpose they never consented to. So we refuse the second and allow the first.
//
// This module extends OpError so a refusal arrives as a 400 the agent can act
// on, cleanly distinguishable from a provider outage (502 / "failed (503)").
//
// Both guards are pure, synchronous, allocation-light and safe to call on every
// request. Both return STRUCTURED results so a caller can log WHY something was
// refused. Neither ever puts the offending value, or any fragment of it, into a
// result, an error message, or a log line - that would defeat the point.

import { OpError } from "@/lib/op-error";

// ── Egress: is this a question, or is it pasted customer text? ───────────────

export type EgressRule =
  | "email-header"
  | "quoted-reply"
  | "signature-block"
  | "embedded-email-address"
  | "embedded-phone-number"
  | "verbatim-quote"
  | "pasted-block"
  | "prose-block"
  | "over-length";

export interface EgressFinding {
  rule: EgressRule;
  /** Safe to log: describes the SHAPE that matched, never the text. */
  detail: string;
}

export interface EgressInspection {
  /** true when the text is safe to send to a third party. */
  ok: boolean;
  rules: EgressRule[];
  findings: EgressFinding[];
}

// THE TUNING TRADEOFF, stated honestly: false positives here break real
// searches, which is worse for the operator than an occasional miss, because a
// broken search is felt immediately and silently trains people to route around
// the guard. So every threshold below is deliberately loose. We catch text that
// is OBVIOUSLY a pasted message (headers, reply markers, signature blocks, a
// wall of prose) and let borderline cases through. This is a tripwire on the
// careless path, not a DLP system, and it should never be described as one.
//
// The single tightest rule is the raw identifier one (email address / phone
// number in a search string): those are cheap to spot, almost never belong in a
// question about a public fact, and are exactly the transfer that is hardest to
// defend afterwards.

/** Nothing longer than this is a search query. Deep-research prompts in this
 *  repo top out around 300 chars (see swarm.ts angle derivation), so 600 leaves
 *  a wide margin. */
const MAX_QUERY_CHARS = 600;

/** A pasted block: several real lines AND enough volume to be a message. */
const PASTED_MIN_LINES = 4;
const PASTED_MIN_CHARS = 280;

/** Flowing prose: many sentences AND high function-word density. A long,
 *  specific research prompt is usually one or two sentences of nouns; a pasted
 *  message is many sentences of connective tissue. */
const PROSE_MIN_SENTENCES = 5;
const PROSE_MIN_CHARS = 400;
const PROSE_MIN_STOPWORD_RATIO = 0.22;

/** A quoted span this long is someone's words, not a phrase you are searching. */
const VERBATIM_QUOTE_MIN_CHARS = 160;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// Phone candidates, then a digit-count check so "+1 500 employees" and
// "2020-2024" cannot masquerade as a number.
const PHONE_CANDIDATE_RE = /\+?\d[\d\s().-]{7,20}\d/g;
const PHONE_MIN_DIGITS = 9;

const EMAIL_HEADER_RE = /^[ \t]*(from|to|cc|bcc|subject|sent|date|reply-to)[ \t]*:[ \t]*\S/gim;
const ORIGINAL_MESSAGE_RE = /-{2,}\s*(original message|forwarded message)\s*-{2,}/i;
const WROTE_MARKER_RE = /\bon\b[^\n]{0,140}?\bwrote\s*:/i;
const QUOTED_LINE_RE = /^[ \t]*>[ \t]?\S/gm;
const SIG_SEPARATOR_RE = /^[ \t]*--[ \t]*$/m;
const SENT_FROM_RE = /\bsent from my (iphone|ipad|android|samsung|blackberry|mobile)\b/i;
// A sign-off only counts as a signature when a name line follows it. "cheers"
// on its own is a word people type; "Cheers,\nJane" is a signature block.
const SIGN_OFF_RE =
  /\b(best regards|kind regards|warm regards|best wishes|yours sincerely|yours truly|sincerely|many thanks|thanks again|cheers|regards)\b[,!.]?[ \t]*\r?\n[ \t]*[A-Z][\w'’.-]+/i;

const VERBATIM_QUOTE_RE = new RegExp(
  `["“]([^"“”]{${VERBATIM_QUOTE_MIN_CHARS},})["”]`,
);

// Enough English function words to stand in for an entropy measure without the
// cost or the false precision of one. Prose leans on these; queries do not.
const STOPWORDS = new Set([
  "the", "and", "but", "that", "this", "with", "have", "has", "had", "was",
  "were", "would", "could", "should", "you", "your", "our", "we", "they",
  "them", "there", "here", "just", "will", "been", "about", "which", "when",
  "then", "than", "from", "into", "over", "very", "also", "because", "if",
  "so", "as", "it", "is", "of", "to", "in", "on", "for", "at", "be", "are",
]);

function digitsIn(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= "0" && ch <= "9") n += 1;
  return n;
}

function hasPhoneNumber(text: string): boolean {
  PHONE_CANDIDATE_RE.lastIndex = 0;
  for (const m of text.matchAll(PHONE_CANDIDATE_RE)) {
    if (digitsIn(m[0]) >= PHONE_MIN_DIGITS) return true;
  }
  return false;
}

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) n += 1;
  re.lastIndex = 0;
  return n;
}

function stopwordRatio(text: string): number {
  const words = text.toLowerCase().match(/[a-z']+/g);
  if (!words || words.length < 20) return 0;
  let hits = 0;
  for (const w of words) if (STOPWORDS.has(w)) hits += 1;
  return hits / words.length;
}

/**
 * Inspect an outbound string. Never throws, never reveals the text.
 * Use this when you want to decide something; use assertNoCustomerText when you
 * want to stop something.
 */
export function inspectEgressText(text: string): EgressInspection {
  const findings: EgressFinding[] = [];
  const add = (rule: EgressRule, detail: string) => findings.push({ rule, detail });

  if (typeof text !== "string" || !text.trim()) {
    return { ok: true, rules: [], findings };
  }

  // Two or more header lines is an email, not a query. One alone is not enough:
  // "subject: renewals" is a thing people legitimately type.
  const headerLines = countMatches(text, EMAIL_HEADER_RE);
  if (headerLines >= 2) {
    add("email-header", `${headerLines} email header lines`);
  }

  if (WROTE_MARKER_RE.test(text)) {
    add("quoted-reply", "an \"On <date>, <name> wrote:\" marker");
  } else if (ORIGINAL_MESSAGE_RE.test(text)) {
    add("quoted-reply", "an original/forwarded message separator");
  } else if (countMatches(text, QUOTED_LINE_RE) >= 2) {
    add("quoted-reply", "two or more \">\" quoted lines");
  }

  if (SIG_SEPARATOR_RE.test(text)) {
    add("signature-block", "a \"--\" signature separator");
  } else if (SENT_FROM_RE.test(text)) {
    add("signature-block", "a mobile mail-client footer");
  } else if (SIGN_OFF_RE.test(text)) {
    add("signature-block", "a sign-off followed by a name line");
  }

  EMAIL_RE.lastIndex = 0;
  if (EMAIL_RE.test(text)) {
    EMAIL_RE.lastIndex = 0;
    add("embedded-email-address", "a raw email address");
  }

  if (hasPhoneNumber(text)) {
    add("embedded-phone-number", "a raw phone number");
  }

  if (VERBATIM_QUOTE_RE.test(text)) {
    add("verbatim-quote", `a quoted span over ${VERBATIM_QUOTE_MIN_CHARS} chars`);
  }

  const lines = text.split("\n").filter((l) => l.trim()).length;
  if (lines >= PASTED_MIN_LINES && text.length >= PASTED_MIN_CHARS) {
    add("pasted-block", `${lines} lines and ${text.length} chars`);
  }

  const sentences = countMatches(text, /[.!?](\s|$)/g);
  if (
    sentences >= PROSE_MIN_SENTENCES &&
    text.length >= PROSE_MIN_CHARS &&
    stopwordRatio(text) >= PROSE_MIN_STOPWORD_RATIO
  ) {
    add("prose-block", `${sentences} sentences of connective prose`);
  }

  if (text.length > MAX_QUERY_CHARS) {
    add("over-length", `${text.length} chars, over the ${MAX_QUERY_CHARS} char query ceiling`);
  }

  return { ok: findings.length === 0, rules: findings.map((f) => f.rule), findings };
}

/**
 * Thrown when an outbound third-party query looks like pasted customer content.
 * Carries a 400 so REST routes, the MCP server, and the in-app agent all report
 * it as a request the caller can fix - never as a provider outage (those surface
 * as 502s and "<provider> failed (<status>)" messages).
 */
export class EgressBlockedError extends OpError {
  readonly rules: EgressRule[];
  readonly findings: EgressFinding[];
  /** The static call-site label, e.g. "tavily.search". Never data. */
  readonly context: string;

  constructor(context: string, inspection: EgressInspection) {
    super(
      `That query contains message text (${inspection.rules.join(", ")}), so it was not sent to ${context}. ` +
        `Ask about the public fact instead of pasting the customer's own words. ` +
        `Read the record inside Scalar, derive the question, then search.`,
      400,
    );
    this.name = "EgressBlockedError";
    this.rules = inspection.rules;
    this.findings = inspection.findings;
    this.context = context;
  }
}

/**
 * Fail closed before a user- or agent-supplied string becomes a request to
 * someone else's API.
 *
 * `context` MUST be a static call-site label ("exa.search", "tavily.search").
 * It appears in the error and in logs, so passing data through it would leak.
 */
export function assertNoCustomerText(query: string, context: string): void {
  const inspection = inspectEgressText(query);
  if (inspection.ok) return;
  // Log the shape, never the query. This is the whole reason findings exist.
  console.warn(`[egress] blocked ${context}: ${inspection.rules.join(", ")}`);
  throw new EgressBlockedError(context, inspection);
}

const REDACT_MAX_CHARS = 240;

/**
 * Strip a block of customer text down to something a caller may legitimately
 * send onward: identifiers removed, quoted history and signature dropped,
 * newlines collapsed, hard-capped in length.
 *
 * This is a convenience for the honest caller who genuinely holds a message and
 * needs a derived string out of it. It is NOT a laundering step: the output is
 * still the customer's phrasing, minus the obvious identifiers. Prefer writing
 * the question yourself. The output always passes assertNoCustomerText.
 */
export function redactForEgress(text: string): string {
  if (typeof text !== "string" || !text.trim()) return "";
  let out = text;
  // Everything from a reply marker onward is the other party's words.
  out = out.replace(/\bon\b[^\n]{0,140}?\bwrote\s*:[\s\S]*$/i, " ");
  out = out.replace(/-{2,}\s*(original message|forwarded message)\s*-{2,}[\s\S]*$/i, " ");
  out = out.replace(/^[ \t]*--[ \t]*$[\s\S]*/m, " ");
  out = out.replace(/^[ \t]*>.*$/gm, " ");
  out = out.replace(EMAIL_HEADER_RE, " ");
  out = out.replace(EMAIL_RE, " ");
  out = out.replace(PHONE_CANDIDATE_RE, (m) => (digitsIn(m) >= PHONE_MIN_DIGITS ? " " : m));
  out = out.replace(SENT_FROM_RE, " ");
  out = out.replace(/["“”]/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > REDACT_MAX_CHARS) {
    out = out.slice(0, REDACT_MAX_CHARS).replace(/\s+\S*$/, "");
  }
  return out;
}

// ── Special categories: what may never land on a record ──────────────────────
//
// GDPR Article 9 forbids processing of "special categories" of personal data
// without a narrow lawful basis that a CRM does not have: racial or ethnic
// origin, political opinions, religious or philosophical beliefs, trade union
// membership, health, and sex life or sexual orientation. Article 10 covers
// criminal convictions and offences separately, on the same footing for our
// purposes. We treat immigration status as ethnic origin: it is not literally
// Article 9, but it carries the same blast radius.
//
// The plain version: a CRM that knows a customer's health status is a CRM
// somebody has to explain. Not to a regulator first - to the customer, and to
// the operator's own team when they see it on the screen. There is no sales
// question this data answers. So it does not get written, no matter which
// provider volunteered it: Explorium, Pipe0, an LLM summary, a scraped page.
// The refusal is upstream of consent, because we cannot verify consent for a
// fact a third party guessed.

export type SpecialCategory =
  | "health"
  | "political"
  | "religion"
  | "sexual-orientation"
  | "ethnicity"
  | "trade-union"
  | "criminal";

export const SPECIAL_CATEGORIES: readonly SpecialCategory[] = [
  "health",
  "political",
  "religion",
  "sexual-orientation",
  "ethnicity",
  "trade-union",
  "criminal",
] as const;

export type SpecialCategorySignal = "field-name" | "explicit-term" | "personal-context";

export interface SpecialCategoryFinding {
  category: SpecialCategory;
  /** How it matched. Never the term, never the value. */
  signal: SpecialCategorySignal;
}

export interface SpecialCategoryResult {
  /** true when the value carries special-category data. */
  found: boolean;
  categories: SpecialCategory[];
  findings: SpecialCategoryFinding[];
}

// TERM TIERS, and why there are two.
//
// `explicit` terms are specific enough to refuse on sight: nobody writes
// "chemotherapy" on a CRM record for a business reason.
//
// `contextual` terms are sensitive only when attached to a person. "Physical
// therapy" is an industry; "he is in therapy" is health data. "Conservative"
// is half the company names in Britain; "leans conservative" is a political
// opinion. Contextual terms only fire when a personal marker sits within
// CONTEXT_WINDOW chars, which is what keeps this guard from refusing to store
// an oncology clinic's industry or a credit union's name.
interface CategorySpec {
  category: SpecialCategory;
  explicit: string[];
  contextual: string[];
  /** Field NAMES that are special-category by their very existence. */
  fieldNames: string[];
}

const CONTEXT_WINDOW = 70;

const PERSONAL_MARKER_RE =
  /\b(he|she|they|him|her|his|hers|their|theirs|is|was|has|had|been|identifies|self-identifies|describes|suffers|suffering|battling|struggling|recovering|diagnosed|undergoing|attends|attended|practising|practicing|devout|observant|openly|member|belongs|supports|supported|votes|voted|leans|converted|came out|declared|disclosed|mentioned|told us|said)\b/i;

const SPECS: CategorySpec[] = [
  {
    category: "health",
    fieldNames: ["health", "medical", "diagnosis", "disability", "condition", "illness", "meds", "medication"],
    explicit: [
      "chemotherapy", "chemo session", "hiv positive", "hiv-positive", "aids diagnosis",
      "diabetes", "diabetic", "epilepsy", "epileptic", "cystic fibrosis", "multiple sclerosis",
      "crohn's", "crohns", "lupus", "schizophrenia", "schizophrenic", "bipolar disorder",
      "autism", "autistic", "asperger", "adhd", "dyslexia", "dyslexic",
      "alzheimer", "dementia", "parkinson", "terminal illness", "palliative",
      "medical condition", "medical leave", "sick leave", "immunocompromised",
      "mental health", "mental illness", "clinical depression", "anxiety disorder",
      "ptsd", "eating disorder", "anorexia", "bulimia", "self-harm", "suicidal",
      "addiction", "alcoholism", "alcoholic", "substance abuse", "overdose", "in rehab",
      "miscarriage", "ivf", "fertility treatment", "pregnant", "pregnancy",
      "long covid", "chronic fatigue", "chronic pain", "chronic illness",
    ],
    contextual: [
      "cancer", "tumour", "tumor", "surgery", "diagnosis", "diagnosed", "prescription",
      "medication", "therapy", "treatment", "hospital", "hospitalised", "hospitalized",
      "stroke", "heart attack", "cardiac", "depression", "disability", "disabled",
      "blind", "deaf", "wheelchair", "illness", "unwell", "injury", "injured",
    ],
  },
  {
    category: "political",
    fieldNames: ["politics", "political", "party", "voting", "vote"],
    explicit: [
      "political views", "political opinion", "political affiliation", "political party",
      "party membership", "voted for", "votes for", "pro-life", "pro-choice",
      "maga supporter", "far-right", "far right", "far-left", "far left",
      "brexiteer", "remainer", "anti-vax", "antivax",
    ],
    contextual: [
      "republican", "democrat", "conservative", "liberal", "labour party", "tory",
      "socialist", "communist", "libertarian", "green party", "nationalist",
      "activist", "campaigner", "left-wing", "right-wing",
    ],
  },
  {
    category: "religion",
    fieldNames: ["religion", "religious", "faith", "belief", "beliefs"],
    explicit: [
      "religious belief", "religious affiliation", "philosophical belief",
      "devout", "born again", "born-again", "jehovah's witness", "jehovahs witness",
      "orthodox jew", "practising muslim", "practicing muslim",
      "practising christian", "practicing christian",
    ],
    contextual: [
      "christian", "catholic", "protestant", "evangelical", "muslim", "islam",
      "jewish", "judaism", "hindu", "buddhist", "sikh", "atheist", "agnostic",
      "mormon", "church", "synagogue", "mosque", "ramadan", "shabbat", "faith",
    ],
  },
  {
    category: "sexual-orientation",
    fieldNames: ["orientation", "sexuality", "sexual_orientation", "sex life"],
    explicit: [
      "sexual orientation", "sex life", "homosexual", "heterosexual", "bisexual",
      "closeted", "came out as", "same-sex partner", "same sex partner",
    ],
    contextual: ["gay", "lesbian", "queer", "lgbt", "lgbtq", "transgender", "non-binary", "nonbinary"],
  },
  {
    category: "ethnicity",
    fieldNames: ["ethnicity", "ethnic", "race", "racial", "nationality", "immigration", "visa_status"],
    explicit: [
      "ethnic origin", "ethnicity", "racial origin", "mixed race", "mixed-race",
      "person of colour", "person of color", "bipoc", "caucasian", "hispanic",
      "latino", "latina", "african american", "african-american", "asian american",
      "black british", "indigenous", "aboriginal", "romani",
      "asylum seeker", "refugee status", "undocumented", "immigration status",
      "green card holder", "visa status", "naturalised citizen", "naturalized citizen",
    ],
    contextual: ["black", "white", "asian", "arab", "native", "immigrant", "foreign-born"],
  },
  {
    category: "trade-union",
    fieldNames: ["union", "union_membership"],
    explicit: [
      "trade union", "trades union", "union member", "union membership",
      "unionised", "unionized", "shop steward", "labor union", "labour union",
      "teamsters member", "collective bargaining unit",
    ],
    // Deliberately empty: bare "union" collides with credit unions, Union
    // Square, the European Union, and half of American rail. The multiword
    // explicit terms carry this category on their own.
    contextual: [],
  },
  {
    category: "criminal",
    fieldNames: ["criminal", "convictions", "offences", "offenses", "arrest", "background_check"],
    explicit: [
      "criminal record", "criminal conviction", "criminal charge", "criminal history",
      "convicted of", "convicted felon", "felony", "misdemeanor", "misdemeanour",
      "arrested for", "arrest record", "indicted", "on probation", "on parole",
      "served time", "incarcerated", "prison sentence", "jail time",
      "pleaded guilty", "pled guilty", "found guilty", "sex offender",
      "restraining order", "police record", "dui conviction", "dwi conviction",
    ],
    contextual: [],
  },
];

// Word-boundary matching, compiled once at module load so calls stay cheap.
function escapeTerm(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  // \b does not fire after a trailing "'s" or a hyphen, so anchor on a
  // non-word char or string edge at each end instead.
  return new RegExp(`(^|[^A-Za-z0-9])(${terms.map(escapeTerm).join("|")})([^A-Za-z0-9]|$)`, "gi");
}

interface CompiledSpec {
  category: SpecialCategory;
  explicit: RegExp | null;
  contextual: RegExp | null;
  fieldName: RegExp | null;
}

const COMPILED: CompiledSpec[] = SPECS.map((s) => ({
  category: s.category,
  explicit: termPattern(s.explicit),
  contextual: termPattern(s.contextual),
  fieldName: termPattern(s.fieldNames),
}));

function testOnce(re: RegExp | null, text: string): boolean {
  if (!re) return false;
  re.lastIndex = 0;
  const hit = re.test(text);
  re.lastIndex = 0;
  return hit;
}

/**
 * Does this value carry special-category personal data?
 * Pure, cheap, and value-blind in its output: the result names the CATEGORY and
 * the SIGNAL, never the matched term. Log the result freely; never log the input.
 */
export function containsSpecialCategory(value: unknown): SpecialCategoryResult {
  const findings: SpecialCategoryFinding[] = [];
  if (typeof value !== "string" || !value.trim()) {
    return { found: false, categories: [], findings };
  }

  for (const spec of COMPILED) {
    if (testOnce(spec.explicit, value)) {
      findings.push({ category: spec.category, signal: "explicit-term" });
      continue;
    }
    if (!spec.contextual) continue;
    spec.contextual.lastIndex = 0;
    for (const m of value.matchAll(spec.contextual)) {
      const idx = m.index ?? 0;
      const window = value.slice(
        Math.max(0, idx - CONTEXT_WINDOW),
        idx + m[0].length + CONTEXT_WINDOW,
      );
      if (PERSONAL_MARKER_RE.test(window)) {
        findings.push({ category: spec.category, signal: "personal-context" });
        break;
      }
    }
    spec.contextual.lastIndex = 0;
  }

  return {
    found: findings.length > 0,
    categories: [...new Set(findings.map((f) => f.category))],
    findings,
  };
}

/**
 * The same check with the FIELD taken into account. A field named
 * "health_status" is special-category by its existence: whatever value it
 * carries, the column itself is the disclosure.
 */
export function inspectRecordable(field: string, value: unknown): SpecialCategoryResult {
  const findings: SpecialCategoryFinding[] = [];
  const fieldLabel = typeof field === "string" ? field.replace(/[_-]+/g, " ") : "";

  for (const spec of COMPILED) {
    if (testOnce(spec.fieldName, fieldLabel)) {
      findings.push({ category: spec.category, signal: "field-name" });
    }
  }

  const hasValue = value !== null && value !== undefined && String(value).trim() !== "";
  if (!hasValue) {
    // An empty write clears a field; nothing is disclosed by clearing it.
    return { found: false, categories: [], findings: [] };
  }

  findings.push(...containsSpecialCategory(value).findings);

  return {
    found: findings.length > 0,
    categories: [...new Set(findings.map((f) => f.category))],
    findings,
  };
}

/**
 * Thrown when a value would put special-category data onto a record. 400 (a
 * request we refuse), never 502 (a provider that failed).
 */
export class SpecialCategoryError extends OpError {
  readonly field: string;
  readonly categories: SpecialCategory[];

  constructor(field: string, categories: SpecialCategory[]) {
    super(
      `Refused to write "${field}": that value looks like special-category personal data ` +
        `(${categories.join(", ")}). Scalar does not store health, political, religious, ethnic, ` +
        `trade-union, sexual-orientation, or criminal-history data on a record, whichever provider ` +
        `supplied it. Keep business context only.`,
      400,
    );
    this.name = "SpecialCategoryError";
    this.field = field;
    this.categories = categories;
  }
}

/**
 * Fail closed before a value is written onto a contact or entity record.
 * Call this at the write path, not at the read path: reading a customer's own
 * message inside the tenant is fine, copying a fact out of it onto their
 * permanent record is what we refuse.
 *
 * The field name is caller-supplied and safe to surface. The VALUE never is:
 * it does not appear in the error, and it is never logged.
 */
export function assertRecordable(field: string, value: unknown): void {
  const result = inspectRecordable(field, value);
  if (!result.found) return;
  console.warn(
    `[egress] refused write to "${field}": special-category (${result.categories.join(", ")})`,
  );
  throw new SpecialCategoryError(field, result.categories);
}

/**
 * Non-throwing convenience for bulk writes: keep the entries that are safe to
 * record and report which fields were dropped, so a caller can persist the rest
 * instead of losing a whole enrichment to one bad field.
 */
export function filterRecordable<T extends { field: string; value?: string | null }>(
  rows: T[],
): { kept: T[]; refused: { field: string; categories: SpecialCategory[] }[] } {
  const kept: T[] = [];
  const refused: { field: string; categories: SpecialCategory[] }[] = [];
  for (const row of rows) {
    const result = inspectRecordable(row.field, row.value);
    if (result.found) refused.push({ field: row.field, categories: result.categories });
    else kept.push(row);
  }
  return { kept, refused };
}
