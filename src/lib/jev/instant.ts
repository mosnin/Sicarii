// Instant local routes. The X posts (Hermes 100x, LangChain 200x classify,
// Pokemon Showdown harness) are the same split: Jev is System One for
// *ambiguous* judgments. An obvious "show me Acme" is an if-statement.
// Code owns it. TypeSafe stays dark. Qwen stays dark.

import { lookupQuery, splitLocalQuery } from "./query";

export type InstantRoute = {
  tool: string;
  query: string;
  location?: string;
  name?: string;
  domain?: string;
  email?: string;
  company?: string;
  title?: string;
  phone?: string;
  field?: "linkedin" | "email" | "phone";
  status?: "NEW" | "ENRICHED" | "CONTACTED" | "REPLIED" | "QUALIFIED" | "WON" | "LOST" | "ARCHIVED";
  channel?: "email" | "linkedin" | "phone" | "x" | "instagram" | "facebook" | "other";
  note?: string;
  durationSec?: number;
  stage?: "NEW" | "ENRICHED" | "PROSPECTING" | "ENGAGING" | "REPLYING" | "WON" | "LOST";
  conversationStatus?: "OPEN" | "AWAITING_REPLY" | "STALLED" | "CLOSED";
  subject?: string;
  industry?: string;
  website?: string;
  description?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  dealScore?: number;
  direction?: "INBOUND" | "OUTBOUND";
  size?: string;
  entityStatus?: "NEW" | "ENRICHED" | "ARCHIVED";
  crmSource?: string;
  tags?: string[];
  staleDays?: number;
  detail?: boolean;
  source: "instant";
};

const CONTACT_STATUS_WORDS: Record<string, NonNullable<InstantRoute["status"]>> = {
  new: "NEW",
  enriched: "ENRICHED",
  contacted: "CONTACTED",
  replied: "REPLIED",
  qualified: "QUALIFIED",
  won: "WON",
  lost: "LOST",
  archived: "ARCHIVED",
};

const OUTREACH_CHANNEL: Record<string, NonNullable<InstantRoute["channel"]>> = {
  emailed: "email",
  called: "phone",
  texted: "other",
  messaged: "other",
  dm: "other",
  dms: "other",
  pinged: "other",
  linkedin: "linkedin",
  linkedined: "linkedin",
};

function parseSyncCall(text: string): { query: string } | null {
  if (!/^(please\s+)?(sync|refresh)\b/i.test(text) || !/\bcall\b/i.test(text)) return null;
  const query = text
    .replace(/^(please\s+)?(sync|refresh)\s+/i, "")
    .replace(/\b(the|a|an|contact|person|last|call|with|for)\b/gi, " ")
    .replace(/'s\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query || query.length > 80) return null;
  return { query };
}

function parseOutsideCall(text: string): { query: string; note?: string; durationSec?: number } | null {
  const timed = text.match(
    /^(please\s+)?log (?:an? )?(\d+)[ -]?(minute|min|hour|hr)s? (?:outside )?call with (.+?)(?:[:\-]\s*(.+))?$/i,
  );
  const outside = text.match(
    /^(please\s+)?log (?:an? )?outside call with (.+?)(?:[:\-]\s*(.+))?$/i,
  );
  if (timed?.[4]) {
    const n = Number(timed[2]);
    const unit = (timed[3] ?? "minute").toLowerCase();
    const durationSec = Number.isFinite(n) ? Math.round(n * (unit.startsWith("h") ? 3600 : 60)) : undefined;
    const query = timed[4].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
    const note = timed[5]?.trim();
    if (!query || query.length > 80) return null;
    return { query, note, durationSec };
  }
  if (outside?.[2]) {
    const query = outside[2].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
    const note = outside[3]?.trim();
    if (!query || query.length > 80) return null;
    return { query, note };
  }
  return null;
}

function parseRenameField(text: string): {
  query: string;
  name: string;
  tool: "update_segment" | "update_pipeline";
} | null {
  const typed = text.match(/^(please\s+)?rename (?:the )?(.+?) (segment|pipeline) to (.+)$/i);
  const prefixed = text.match(/^(please\s+)?rename (segment|pipeline) (.+?) to (.+)$/i);
  const kind = (typed?.[3] ?? prefixed?.[2] ?? "").toLowerCase();
  const query = (typed?.[2] ?? prefixed?.[3] ?? "").replace(/\b(the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();
  const name = (typed?.[4] ?? prefixed?.[4] ?? "").trim().replace(/[.!?]+$/, "");
  if ((kind !== "segment" && kind !== "pipeline") || !query || !name || query.length > 80 || name.length > 80) {
    return null;
  }
  return { query, name, tool: kind === "segment" ? "update_segment" : "update_pipeline" };
}

function parseAddNote(text: string): { query: string; note: string } | null {
  const m = text.match(
    /^(please\s+)?(add a note|log a note|jot down|note) (on|for|about) (.+?)[:\-]\s*(.+)$/i,
  );
  if (!m?.[4] || !m[5]) return null;
  const query = m[4].replace(/\b(the|a|an|contact|person|company)\b/gi, " ").replace(/\s+/g, " ").trim();
  const note = m[5].trim();
  if (!query || !note || query.length > 80 || note.length > 2000) return null;
  return { query, note };
}

function parseLogOutreach(text: string): {
  query: string;
  channel: NonNullable<InstantRoute["channel"]>;
} | null {
  const direct = text.match(
    /^(please\s+)?(i |just )?(emailed|called|texted|messaged|dms?|pinged|linkedin(?:ed)?)\s+(.+)$/i,
  );
  const logged = text.match(
    /^(please\s+)?(log|record|note) (that i )?(emailed|called|texted|messaged|dms?|pinged|linkedin(?:ed)?|outreach to|a call with)\s+(.+)$/i,
  );
  const verb = (direct?.[3] ?? logged?.[4] ?? "").toLowerCase();
  const rawWho = direct?.[4] ?? logged?.[5] ?? "";
  const channel =
    OUTREACH_CHANNEL[verb] ??
    (verb.includes("call") ? "phone" : verb.includes("email") || verb.includes("outreach") ? "other" : null);
  const query = rawWho
    .replace(/\s+(about|regarding|re:|that)\b[\s\S]*$/i, "")
    .replace(/\b(the|a|an|contact|person)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!channel || !query || query.length > 80) return null;
  return { query, channel };
}

function parseRemoveFromField(text: string): {
  query: string;
  name: string;
  tool: "remove_pipeline_entry" | "remove_segment_member";
} | null {
  const m = text.match(
    /^(please\s+)?(remove|drop|take)\s+(.+?)\s+(?:from|out of|off)\s+(?:the\s+)?(.+?)\s+(pipeline|segment)\b/i,
  );
  if (!m?.[3] || !m[4] || !m[5]) return null;
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const name = m[4].replace(/\b(the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!query || !name || query.length > 80 || name.length > 80) return null;
  return {
    query,
    name,
    tool: m[5].toLowerCase() === "segment" ? "remove_segment_member" : "remove_pipeline_entry",
  };
}

function parseAddToField(text: string): {
  query: string;
  name: string;
  tool: "add_to_pipeline" | "add_to_segment";
} | null {
  const m = text.match(
    /^(please\s+)?(add|put)\s+(.+?)\s+(?:to|into|in)\s+(?:the\s+)?(.+?)\s+(pipeline|segment)\b/i,
  );
  if (!m?.[3] || !m[4] || !m[5]) return null;
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const name = m[4].replace(/\b(the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!query || !name || query.length > 80 || name.length > 80) return null;
  return {
    query,
    name,
    tool: m[5].toLowerCase() === "segment" ? "add_to_segment" : "add_to_pipeline",
  };
}

const PIPELINE_STAGE_WORDS: Record<string, NonNullable<InstantRoute["stage"]>> = {
  new: "NEW",
  enriched: "ENRICHED",
  prospecting: "PROSPECTING",
  engaging: "ENGAGING",
  replying: "REPLYING",
  won: "WON",
  lost: "LOST",
};

const CONVERSATION_STATUS_WORDS: Record<string, NonNullable<InstantRoute["conversationStatus"]>> = {
  open: "OPEN",
  "awaiting reply": "AWAITING_REPLY",
  awaiting_reply: "AWAITING_REPLY",
  stalled: "STALLED",
  closed: "CLOSED",
};

function parseConversationStatus(text: string): {
  query: string;
  name: string;
  conversationStatus: NonNullable<InstantRoute["conversationStatus"]>;
} | null {
  const m = text.match(
    /^(please\s+)?(mark|set|move)\s+(.+?)\s+(as|to)\s+(?:the\s+)?(open|awaiting reply|awaiting_reply|stalled|closed)(?:\s+(?:status|conversation))?\s+(?:in|on|of)\s+(?:the\s+)?(.+?)$/i,
  );
  if (!m?.[3] || !m[5] || !m[6]) return null;
  const conversationStatus = CONVERSATION_STATUS_WORDS[m[5].toLowerCase()];
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const name = m[6]
    .replace(/\s+pipeline\s*$/i, "")
    .replace(/\b(the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!conversationStatus || !query || !name || query.length > 80 || name.length > 80) return null;
  return { query, name, conversationStatus };
}

function parseLogSocial(text: string): {
  query: string;
  channel: NonNullable<InstantRoute["channel"]>;
  note: string;
  direction: NonNullable<InstantRoute["direction"]>;
} | null {
  const m = text.match(
    /^(please\s+)?(save|log|record)\s+(?:this |the |a |an )?(inbound\s+)?(linkedin|x|twitter|instagram|facebook|social)\s+(dm|message|comment)\s+(to|from|on|with|for)\s+(.+?)[:\-]\s*(.+)$/i,
  );
  if (!m?.[4] || !m[6] || !m[7] || !m[8]) return null;
  const raw = m[4].toLowerCase();
  const channel: NonNullable<InstantRoute["channel"]> =
    raw === "linkedin"
      ? "linkedin"
      : raw === "x" || raw === "twitter"
        ? "x"
        : raw === "instagram"
          ? "instagram"
          : raw === "facebook"
            ? "facebook"
            : "other";
  const query = m[7].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const note = m[8].trim();
  const direction: NonNullable<InstantRoute["direction"]> =
    m[3] || m[6].toLowerCase() === "from" ? "INBOUND" : "OUTBOUND";
  if (!query || !note || query.length > 80 || note.length > 10_000) return null;
  return { query, channel, note, direction };
}

function parseEntityNotes(text: string): { query: string; note: string } | null {
  const prefixed = text.match(
    /^(please\s+)?(set|update|change)\s+(?:the\s+)?(?:company|entity)\s+(.+?)(?:'s)?\s+notes?\s+to\s+(.+)$/i,
  );
  const suffixed = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+(?:company|entity)\s+notes?\s+to\s+(.+)$/i,
  );
  const query = (prefixed?.[3] ?? suffixed?.[3] ?? "")
    .replace(/\b(the|a|an|company|business|entity)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const note = (prefixed?.[4] ?? suffixed?.[4] ?? "").trim();
  if (!query || !note || query.length > 80 || note.length > 2000) return null;
  return { query, note };
}

function isTwitterHandleOrUrl(value: string): boolean {
  return isSocialHandleOrUrl(value, ["x.com", "twitter.com"], /^@?[A-Za-z0-9_]{1,15}$/);
}

function isSocialHandleOrUrl(value: string, hosts: string[], handle = /^@?[A-Za-z0-9._]{1,30}$/): boolean {
  if (value.length > 500) return false;
  if (handle.test(value)) return true;
  return hosts.some((host) => {
    const escaped = host.replace(/\./g, "\\.");
    return new RegExp(`^https?:\\/\\/(www\\.)?${escaped}\\/`, "i").test(value);
  });
}

function parseQualifiedContactPatch(text: string): {
  query: string;
  website?: string;
  location?: string;
} | null {
  const prefixed = text.match(
    /^(please\s+)?(set|update|change)\s+(?:the\s+)?(?:contact|person)\s+(.+?)(?:'s)?\s+(website|location)\s+to\s+(.+)$/i,
  );
  const suffixed = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+(?:contact|person)\s+(website|location)\s+to\s+(.+)$/i,
  );
  const query = (prefixed?.[3] ?? suffixed?.[3] ?? "")
    .replace(/\b(the|a|an|contact|person)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const field = (prefixed?.[4] ?? suffixed?.[4] ?? "").toLowerCase();
  const value = (prefixed?.[5] ?? suffixed?.[5] ?? "").trim().replace(/[.!?]+$/, "");
  if (!query || !value || query.length > 80) return null;
  if (field === "website") {
    if (value.length > 500) return null;
    return { query, website: value };
  }
  if (field === "location") {
    if (value.length > 200) return null;
    return { query, location: value };
  }
  return null;
}

function parseEntityPhone(text: string): { query: string; phone: string } | null {
  const prefixed = text.match(
    /^(please\s+)?(set|update|change)\s+(?:the\s+)?(?:company|entity)\s+(.+?)(?:'s)?\s+phone\s+to\s+(.+)$/i,
  );
  const suffixed = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+(?:company|entity)\s+phone\s+to\s+(.+)$/i,
  );
  const query = (prefixed?.[3] ?? suffixed?.[3] ?? "")
    .replace(/\b(the|a|an|company|business|entity)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const phone = (prefixed?.[4] ?? suffixed?.[4] ?? "").trim().replace(/[.!?]+$/, "");
  if (!query || !phone || query.length > 80 || phone.length < 5 || phone.length > 50) return null;
  return { query, phone };
}

function parseEntityPatch(text: string): {
  query: string;
  industry?: string;
  location?: string;
  domain?: string;
  website?: string;
  description?: string;
  size?: string;
} | null {
  const m = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+(industry|location|domain|website|description|size)\s+to\s+(.+)$/i,
  );
  if (!m?.[3] || !m[4] || !m[5]) return null;
  const query = m[3]
    .replace(/\b(the|a|an|company|business|entity)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const field = m[4].toLowerCase();
  if (!query || query.length > 80) return null;
  if (field === "description") {
    const description = m[5].trim();
    if (!description || description.length > 2000) return null;
    return { query, description };
  }
  const value = m[5].trim().replace(/[.!?]+$/, "");
  if (!value) return null;
  if (field === "website") {
    if (value.length > 500) return null;
    return { query, website: value };
  }
  if (value.length > 80) return null;
  if (field === "industry") return { query, industry: value };
  if (field === "location") return { query, location: value };
  if (field === "size") {
    if (value.length > 40) return null;
    return { query, size: value };
  }
  return { query, domain: value.toLowerCase() };
}

const ENTITY_STATUS_WORDS: Record<string, NonNullable<InstantRoute["entityStatus"]>> = {
  new: "NEW",
  enriched: "ENRICHED",
  archived: "ARCHIVED",
};

function parseEntityStatus(text: string): {
  query: string;
  entityStatus: NonNullable<InstantRoute["entityStatus"]>;
} | null {
  if (/\bautopilot\b/i.test(text)) return null;
  const archive = text.match(
    /^(please\s+)?archive\s+(?:the\s+)?(?:company|business|entity)\s+(.+)$/i,
  );
  if (archive?.[2]) {
    const query = archive[2].replace(/\b(the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (query && query.length <= 80) return { query, entityStatus: "ARCHIVED" };
  }
  const qualified = text.match(
    /^(please\s+)?(mark|set|move)\s+(?:the\s+)?(?:company|business|entity)\s+(.+?)\s+(as|to)\s+(?:the\s+)?(new|enriched|archived)\b/i,
  );
  if (qualified?.[3] && qualified[5]) {
    const query = qualified[3].replace(/\b(the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();
    const entityStatus = ENTITY_STATUS_WORDS[qualified[5].toLowerCase()];
    if (query && query.length <= 80 && entityStatus) return { query, entityStatus };
  }
  const field = text.match(
    /^(please\s+)?(set|update|change)\s+(?:the\s+)?(?:company|business|entity)\s+(.+?)(?:'s)?\s+status\s+to\s+(new|enriched|archived)\b/i,
  );
  if (field?.[3] && field[4]) {
    const query = field[3].replace(/\b(the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();
    const entityStatus = ENTITY_STATUS_WORDS[field[4].toLowerCase()];
    if (query && query.length <= 80 && entityStatus) return { query, entityStatus };
  }
  return null;
}

function parseContactPatch(text: string): {
  query: string;
  title?: string;
  email?: string;
  phone?: string;
  company?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  note?: string;
} | null {
  const m = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+(title|email|phone|company|linkedin|twitter|x|facebook|instagram|notes)\s+to\s+(.+)$/i,
  );
  if (!m?.[3] || !m[4] || !m[5]) return null;
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const field = m[4].toLowerCase();
  if (!query || query.length > 80) return null;
  if (field === "notes") {
    const note = m[5].trim();
    if (!note || note.length > 2000) return null;
    return { query, note };
  }
  const value = m[5].trim().replace(/[.!?]+$/, "");
  if (!value) return null;
  if (field === "email") {
    if (!value.includes("@") || value.length > 320) return null;
    return { query, email: value };
  }
  if (field === "phone") {
    if (value.length < 5 || value.length > 50) return null;
    return { query, phone: value };
  }
  if (field === "linkedin") {
    if (value.length > 500) return null;
    return { query, linkedin: value };
  }
  if (field === "twitter" || field === "x") {
    if (!isTwitterHandleOrUrl(value)) return null;
    return { query, twitter: value };
  }
  if (field === "facebook") {
    if (!isSocialHandleOrUrl(value, ["facebook.com"])) return null;
    return { query, facebook: value };
  }
  if (field === "instagram") {
    if (!isSocialHandleOrUrl(value, ["instagram.com"])) return null;
    return { query, instagram: value };
  }
  if (field === "title") {
    if (value.length > 80) return null;
    return { query, title: value };
  }
  if (value.length > 80) return null;
  return { query, company: value };
}

function parseTagList(raw: string): string[] | null {
  const tags = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (tags.length === 0 || tags.length > 8) return null;
  if (tags.some((t) => t.length > 50)) return null;
  return tags;
}

function parseContactSource(text: string): { query: string; crmSource: string } | null {
  if (/\b(company|business|entity)\b/i.test(text)) return null;
  if (/\b(source of|where did|how do we know|provenance)\b/i.test(text)) return null;
  const m = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+(?:lead )?source\s+to\s+(.+)$/i,
  );
  if (!m?.[3] || !m[4]) return null;
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const crmSource = m[4].trim().replace(/[.!?]+$/, "");
  if (!query || query.length > 80 || !crmSource || crmSource.length > 100) return null;
  return { query, crmSource };
}

function parseContactTags(text: string): { query: string; tags: string[] } | null {
  if (/\b(company|business|entity)\b/i.test(text)) return null;
  const tagged = text.match(/^(please\s+)?tag\s+(.+?)\s+as\s+(.+)$/i);
  const setTags = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+tags?\s+to\s+(.+)$/i,
  );
  const query = (tagged?.[2] ?? setTags?.[3] ?? "")
    .replace(/\b(the|a|an|contact|person)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tags = parseTagList(tagged?.[3] ?? setTags?.[4] ?? "");
  if (!query || query.length > 80 || !tags) return null;
  return { query, tags };
}

function parseEntityTags(text: string): { query: string; tags: string[] } | null {
  if (!/\b(company|business|entity)\b/i.test(text)) return null;
  const tagged = text.match(
    /^(please\s+)?tag\s+(?:the\s+)?(?:company|business|entity)\s+(.+?)\s+as\s+(.+)$/i,
  );
  const setTags = text.match(
    /^(please\s+)?(set|update|change)\s+(?:the\s+)?(?:company|business|entity)\s+(.+?)(?:'s)?\s+tags?\s+to\s+(.+)$/i,
  );
  const query = (tagged?.[2] ?? setTags?.[3] ?? "")
    .replace(/\b(the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tags = parseTagList(tagged?.[3] ?? setTags?.[4] ?? "");
  if (!query || query.length > 80 || !tags) return null;
  return { query, tags };
}

function parseDealScore(text: string): { query: string; dealScore: number } | null {
  const m = text.match(
    /^(please\s+)?(set|update|change)\s+(.+?)(?:'s)?\s+deal(?:\s+|-)?score\s+to\s+(\d{1,3})\s*$/i,
  );
  if (!m?.[3] || !m[4]) return null;
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const dealScore = Number(m[4]);
  if (!query || query.length > 80 || !Number.isFinite(dealScore) || dealScore < 1 || dealScore > 100) {
    return null;
  }
  return { query, dealScore };
}

function parseDraftBreakups(text: string): { staleDays?: number } | null {
  if (/\b(pending drafts?|draft queue)\b/i.test(text)) return null;
  if (/^(please\s+)?(list|show)\b/i.test(text)) return null;
  if (!/\bbreakup/i.test(text) && !/\bstalled deals?\b/i.test(text)) return null;
  if (!/^(please\s+)?(draft|write|compose)\b/i.test(text)) return null;
  if (SEND.test(text) || COMPOUND.test(text) || DESTRUCTIVE.test(text)) return null;
  if (/\b(for|to|about)\s+[A-Z][a-z]+\b/.test(text)) return null;
  if (/\ba breakup email\b/i.test(text) && !/\b(stalled|cold|stale)\b/i.test(text)) return null;
  const days = text.match(/\b(\d{1,3})\s*-?\s*days?\b/i)?.[1];
  const staleDays = days ? Number(days) : undefined;
  if (staleDays != null && (!Number.isFinite(staleDays) || staleDays < 1 || staleDays > 365)) {
    return null;
  }
  return staleDays != null ? { staleDays } : {};
}

function parseExtractContacts(text: string): { query: string } | null {
  if (!/\b(extract|scrape|pull)\b/i.test(text)) return null;
  if (!/\b(contacts?|emails?|phones?|socials?)\b/i.test(text)) return null;
  const url = text.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[.,)]+$/, "");
  const domain = text.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i)?.[1]?.toLowerCase();
  const query = url ?? (domain && !/^(www|http|https)$/i.test(domain) ? `https://${domain}` : "");
  if (!query || query.length > 500) return null;
  return { query };
}

function parsePipelineStage(text: string): {
  query: string;
  name: string;
  stage: NonNullable<InstantRoute["stage"]>;
} | null {
  const m = text.match(
    /^(please\s+)?(move|advance|set)\s+(.+?)\s+to\s+(?:the\s+)?(new|enriched|prospecting|engaging|replying|won|lost)(?:\s+stage)?\s+(?:in|on|of)\s+(?:the\s+)?(.+?)$/i,
  );
  if (!m?.[3] || !m[4] || !m[5]) return null;
  const stage = PIPELINE_STAGE_WORDS[m[4].toLowerCase()];
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const name = m[5]
    .replace(/\s+pipeline\s*$/i, "")
    .replace(/\b(the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stage || !query || !name || query.length > 80 || name.length > 80) return null;
  return { query, name, stage };
}

function parseSaveEmail(text: string): { query: string; note: string; subject?: string } | null {
  const m = text.match(
    /^(please\s+)?(save|log|record)\s+(?:this |the |an )?(email|message)\s+(?:on|for|to|with)\s+(.+?)[:\-]\s*(.+)$/i,
  );
  if (!m?.[4] || !m[5]) return null;
  const query = m[4].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  const raw = m[5].trim();
  if (!query || !raw || query.length > 80 || raw.length > 10_000) return null;
  const nl = raw.indexOf("\n");
  if (nl > 0 && nl <= 120) {
    const subject = raw.slice(0, nl).trim();
    const note = raw.slice(nl + 1).trim();
    if (!note) return { query, note: raw, subject };
    return { query, subject, note };
  }
  return { query, note: raw, subject: raw.slice(0, 80) };
}

function parseGetSwarmRun(text: string): { query: string } | null {
  if (/\bswarm runs\b/i.test(text)) return null;
  if (
    /^(please\s+)?(show|get|open|tell me about)\s+(the\s+)?(last|latest|most recent)\s+swarm run\b/i.test(
      text,
    )
  ) {
    return { query: "" };
  }
  const m = text.match(
    /^(please\s+)?(show|get|open|tell me about)\s+(the\s+)?swarm run(?:\s+for)?\s+(.+)$/i,
  );
  const query = (m?.[4] ?? "").replace(/\b(the|a|an|run)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!query || query.length > 120) return null;
  return { query };
}

function parseStatusUpdate(text: string): { query: string; status: NonNullable<InstantRoute["status"]> } | null {
  const m = text.match(
    /^(please\s+)?(mark|set|move)\s+(.+?)\s+(as|to)\s+(new|enriched|contacted|replied|qualified|won|lost|archived)\b/i,
  );
  if (!m?.[3] || !m[5]) return null;
  const status = CONTACT_STATUS_WORDS[m[5].toLowerCase()];
  const query = m[3].replace(/\b(the|a|an|contact|person)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!status || !query || query.length > 80) return null;
  return { query, status };
}

const COMPOUND = /\b(and then|then |also |after that|as well as)\b/i;
const COMPOSE =
  /\b(draft|write|compose|rewrite|breakup|subject line|opener|email (them|her|him|jane|this))\b/i;
const DESTRUCTIVE = /\b(delete|remove all|wipe|drop table|charge|buy credits|unsubscribe)\b/i;
const SEND = /\b(send (this|it|the email|them)|approve (this|it|the draft))\b/i;

export function tooHardForInstant(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 280) return true;
  if (COMPOUND.test(text) || COMPOSE.test(text) || DESTRUCTIVE.test(text) || SEND.test(text)) {
    return true;
  }
  return false;
}

export function looksLikeLookup(message: string): boolean {
  if (tooHardForInstant(message)) return false;
  return /^(please\s+)?(show|find|search|list|look up|lookup|who is|what is|get|open|tell me about|summarize|enrich)\b/i.test(
    message.trim(),
  );
}

export function extractMissedQuery(prior?: string | null): string | null {
  if (!prior) return null;
  const miss = prior.match(/did not find[^"]*"([^"]+)"/i);
  if (miss?.[1]) return miss[1].trim();
  const disco = prior.match(/Discovery for "([^"]+)" returned no new/i);
  if (disco?.[1]) return disco[1].trim();
  return null;
}

/** "show emails for Jane" -> "Jane". Empty means no person/company to resolve. */
export function historySubject(text: string): string {
  return lookupQuery(text)
    .replace(
      /\b(the |a |an )?(emails?|inbox|messages|activities|activity|calls?|history|thread|trail|dms?|linkedin|instagram|facebook|twitter|social)\b/gi,
      " ",
    )
    .replace(/\b(for|with|from|about)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDomain(text: string): string | undefined {
  const m = text.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i);
  const hit = m?.[1]?.toLowerCase();
  if (!hit) return undefined;
  if (/^(www|http|https)$/i.test(hit)) return undefined;
  return hit;
}

function parseCreateEntity(text: string): {
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  location?: string;
} | null {
  if (!/\b(add|create|save|new)\b/i.test(text)) return null;
  if (!/\b(company|business|entity)\b/i.test(text)) return null;
  const domain = parseDomain(text);
  const website = text.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[.,)]+$/, "");
  const industry = text
    .match(/\bindustry\s+["']?([^"',]+?)(?=\s+(?:located in|location|website|https?:)|["',]|$)/i)?.[1]
    ?.trim();
  const location = text
    .match(/\b(?:located in|location)\s+["']?([^"',]+?)(?=\s+(?:industry|website|https?:)|["',]|$)/i)?.[1]
    ?.trim();
  const called = text.match(
    /\b(?:add|create|save|new)\b[\s\S]+?\b(?:company|business|entity)\b[\s\S]+?\b(?:called|named)\s+["']?([^"',.]+)["']?/i,
  );
  const stripDomain = (raw: string) =>
    raw
      .replace(/\s+(?:industry|located in|location|website|https?:)\b[\s\S]*$/i, "")
      .replace(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i, "")
      .replace(/[()]/g, "")
      .trim()
      .slice(0, 120);
  const extra = {
    ...(website && website.length <= 500 ? { website } : {}),
    ...(industry && industry.length <= 80 ? { industry } : {}),
    ...(location && location.length <= 80 ? { location } : {}),
  };
  if (called?.[1]) return { name: stripDomain(called[1]), domain, ...extra };
  const asCompany = text.match(
    /\b(?:add|create|save)\s+["']?([^"',]+?)["']?\s+as\s+an?\s+(?:company|business|entity)\b/i,
  );
  if (asCompany?.[1]) return { name: stripDomain(asCompany[1]), domain, ...extra };
  const companyX = text.match(
    /\b(?:add|create|save|new)\s+an?\s+(?:company|business|entity)\s+(?:called|named\s+)?["']?([^"',.]+)["']?/i,
  );
  if (companyX?.[1] && !/^(called|named|in|for|with|to)$/i.test(companyX[1].trim())) {
    return { name: stripDomain(companyX[1].replace(/^(called|named)\s+/i, "")), domain, ...extra };
  }
  return null;
}

function parseCreateContact(text: string): {
  name?: string;
  email?: string;
  company?: string;
  title?: string;
  phone?: string;
  linkedin?: string;
} | null {
  if (!/\b(add|create|save|new)\b/i.test(text)) return null;
  if (!/\b(contact|person)\b/i.test(text)) return null;
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const named = text.match(
    /\b(?:called|named)\s+["']?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})["']?/,
  );
  const addName = text.match(
    /\b(?:add|create|save)\s+(?:an?\s+)?(?:contact|person)\s+(?:called|named\s+)?["']?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/,
  );
  const atCo = text.match(
    /\b(?:at|from)\s+([A-Z][A-Za-z0-9&']*(?:\s+[A-Z][A-Za-z0-9&']*){0,3})/,
  );
  const name = (named?.[1] ?? addName?.[1])?.trim();
  if (!name && !email) return null;
  const title =
    text.match(/\btitle\s+["']?([^"',]+?)(?=\s+(?:\d|https?:)|["',]|$)/i)?.[1]?.trim() ??
    text.match(/\bas\s+(?!an?\s+(?:contact|person)\b)([A-Z][A-Za-z0-9&/]{1,40}(?:\s+[A-Z][A-Za-z0-9&/]{1,40}){0,3})\b/)?.[1]?.trim();
  const phone = text.match(/\b(\+?[\d][\d .\-()]{6,18}\d)\b/)?.[1]?.trim();
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+/i)?.[0]?.replace(/[.,)]+$/, "");
  return {
    name,
    email,
    company: atCo?.[1]?.replace(/[.,]+$/, "").trim(),
    ...(title && title.length <= 80 ? { title } : {}),
    ...(phone && phone.length >= 5 && phone.length <= 50 ? { phone } : {}),
    ...(linkedin && linkedin.length <= 500 ? { linkedin } : {}),
  };
}

function parseNamedRecord(
  text: string,
  nouns: string,
): string | null {
  const called = text.match(
    new RegExp(`\\b(?:${nouns})\\b\\s+(?:called|named)\\s+["']?([^"',.]{1,80})`, "i"),
  );
  if (called?.[1]?.trim()) return called[1].trim().slice(0, 120);
  const openNoun = text.match(
    new RegExp(`\\b(?:open|get|show)\\s+(?:the\\s+)?(?:${nouns})\\s+["']?([^"',.]{1,80})`, "i"),
  );
  if (openNoun?.[1]?.trim()) return openNoun[1].trim().slice(0, 120);
  const theX = text.match(
    new RegExp(`\\b(?:the|a|an)\\s+["']?([A-Z][^"']{0,80}?)["']?\\s+(?:${nouns})\\b`),
  );
  const name = theX?.[1]?.trim();
  if (name && !/^(all|my|our)$/i.test(name)) return name.slice(0, 120);
  return null;
}

function parseNamedField(text: string, noun: "segment" | "pipeline"): string | null {
  const called = text.match(
    new RegExp(`\\b${noun}\\b\\s+(?:called|named)\\s+["']?([^"',.]{1,80})`, "i"),
  );
  if (called?.[1]?.trim()) return called[1].trim().slice(0, 120);
  const theX = text.match(
    new RegExp(`\\b(?:the|a|an)\\s+["']?([A-Z][^"']{0,80}?)["']?\\s+${noun}\\b`, "i"),
  );
  const name = theX?.[1]?.trim();
  if (name && !/^(all|my|our)$/i.test(name)) return name.slice(0, 120);
  return null;
}

function parseNamedCreate(text: string, noun: "segment" | "pipeline"): string | null {
  if (!/\b(add|create|save|new)\b/i.test(text)) return null;
  if (!new RegExp(`\\b${noun}s?\\b`, "i").test(text)) return null;
  const called = text.match(/\b(?:called|named)\s+["']?([^"',.]{1,80})/i);
  if (called?.[1]?.trim()) return called[1].trim().slice(0, 120);
  const asNoun = text.match(
    new RegExp(
      `\\b(?:add|create|save)\\s+["']?([^"',]{1,80}?)["']?\\s+as\\s+an?\\s+${noun}\\b`,
      "i",
    ),
  );
  if (asNoun?.[1]?.trim()) return asNoun[1].trim().slice(0, 120);
  return null;
}

function parseEnrichContact(text: string): { query: string; field: "linkedin" | "email" | "phone" } | null {
  if (!/\benrich\b/i.test(text)) return null;
  const hit = text.match(/\b(linkedin|e-?mail|phone)\b/i);
  if (!hit?.[1]) return null;
  const raw = hit[1].toLowerCase().replace("e-mail", "email");
  const field = raw === "email" || raw === "phone" || raw === "linkedin" ? raw : null;
  if (!field) return null;
  const query = lookupQuery(text)
    .replace(/\b(linkedin|e-?mail|phone|profile|number)\b/gi, " ")
    .replace(/\b(for|of|'s)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query) return null;
  return { query, field };
}

function parseCreateVariant(text: string): { kind: "SUBJECT" | "OPENER"; note: string } | null {
  const m = text.match(
    /^(please\s+)?(add|create|save|new)\s+(?:a |an )?(subject(?: line)?|opener)\s+variant[:\-]\s*(.+)$/i,
  );
  if (!m?.[3] || !m[4]) return null;
  const kind = m[3].toLowerCase().startsWith("opener") ? "OPENER" : "SUBJECT";
  const note = m[4].trim();
  if (!note || note.length > 2000) return null;
  return { kind, note };
}

function parseScoreFit(text: string): { query: string } | null {
  if (/\bdeal(?:\s+|-)?score\b/i.test(text)) return null;
  if (/\bas\s+(new|enriched|contacted|replied|qualified|won|lost|archived)\b/i.test(text)) return null;
  if (/\b(this|the following)\b/i.test(text) && /\b(page|draft|artifact)\b/i.test(text)) return null;
  const m = text.match(
    /^(please\s+)?(?:how (?:good|strong) a fit (?:is|are)|(?:what(?:'s| is) the )?fit(?:[- ]score)?(?: for)?|score(?: the)?(?: fit(?: of| for)?)?)\s+(.+?)\s*$/i,
  );
  const query = (m?.[2] ?? "")
    .replace(/\b(the|a|an|company|contact|person|fit|score)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query || query.length > 80) return null;
  return { query };
}

function parseJevTriage(text: string): { note: string } | null {
  const m = text.match(/^(please\s+)?triage (this|the following)(?: inbound)?[:\-]\s*(.+)$/i);
  const note = m?.[3]?.trim();
  if (!note || note.length > 4000) return null;
  return { note };
}

function parseJevScan(text: string): { note: string } | null {
  const m = text.match(
    /^(please\s+)?scan (this|the following)(?: (artifact|email|note|snippet))?(?: for (?:malice|threats?))?[:\-]\s*(.+)$/i,
  );
  const note = m?.[4]?.trim();
  if (!note || note.length > 4000) return null;
  return { note };
}

function parseJevGrade(text: string): { note: string } | null {
  const m = text.match(/^(please\s+)?grade (this|the following)(?: page)?[:\-]\s*(.+)$/i);
  const note = m?.[3]?.trim();
  if (!note || note.length > 20_000) return null;
  return { note };
}

function parseMaps(text: string): { query: string; location: string } | null {
  if (!/\b(dentist|dentists|restaurant|restaurants|salon|salons|lawyer|lawyers|plumber|plumbers|clinic|gym|coffee|barbershop|local)\b/i.test(
    text,
  ) && !/\b(near|around|in )\b/i.test(text)) {
    return null;
  }
  if (!/\b(find|discover|search|look|maps?|leads?)\b/i.test(text) && !/\bin\s+[A-Z]/i.test(text)) {
    return null;
  }
  const split = splitLocalQuery(text);
  if (!split.location) return null;
  if (/\b(compan(y|ies)|startups?)\b/i.test(text)) return null;
  return { query: split.query, location: split.location };
}

export function classifyInstant(
  message: string,
  priorAssistant?: string | null,
): InstantRoute | null {
  const text = message.trim();
  if (!text) return null;

  if (/\b(variant stats|winning (subject|opener)|reply rates?)\b/i.test(text)) {
    return { tool: "list_variant_stats", query: text, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    !SEND.test(text) &&
    (/\b(pick|choose|select|best)\b.+\b(subject(?: line)?|opener|variant)\b/i.test(text) ||
      /^(pick|choose|select) (a |the )?(subject(?: line)?|opener|variant)\b/i.test(text))
  ) {
    return {
      tool: "select_variant",
      query: /\bopener\b/i.test(text) ? "OPENER" : "SUBJECT",
      source: "instant",
    };
  }
  const createVariant = parseCreateVariant(text);
  if (createVariant && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "create_variant",
      query: createVariant.kind,
      note: createVariant.note,
      source: "instant",
    };
  }
  const scoreFit = parseScoreFit(text);
  if (scoreFit && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return { tool: "score_fit", query: scoreFit.query, source: "instant" };
  }
  const jevTriage = parseJevTriage(text);
  if (jevTriage && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return { tool: "jev_triage", query: jevTriage.note.slice(0, 80), note: jevTriage.note, source: "instant" };
  }
  const jevScan = parseJevScan(text);
  if (jevScan && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return { tool: "jev_scan_malicious", query: jevScan.note.slice(0, 80), note: jevScan.note, source: "instant" };
  }
  const jevGrade = parseJevGrade(text);
  if (jevGrade && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return { tool: "jev_grade_page", query: jevGrade.note.slice(0, 80), note: jevGrade.note, source: "instant" };
  }

  // COMPOSE matches "draft" / "breakup", so these reads must win first.
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    !SEND.test(text) &&
    (/\b(pending drafts?|breakup drafts?|draft queue)\b/i.test(text) ||
      /^(list|show) (the )?(pending |breakup )?drafts\b/i.test(text))
  ) {
    return { tool: "list_pending_drafts", query: text, source: "instant" };
  }
  const draftBreakups = parseDraftBreakups(text);
  if (draftBreakups) {
    return {
      tool: "draft_breakups",
      query: text,
      staleDays: draftBreakups.staleDays,
      source: "instant",
    };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    (/\b(pause|stop|halt)\b.+\bautopilot\b/i.test(text) ||
      /^(please\s+)?(pause|stop|halt) (the )?autopilot\b/i.test(text))
  ) {
    return { tool: "pause_autopilot", query: text, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /\bautopilot\b/i.test(text) &&
    /\b(status|doing|budget|running|plan)\b/i.test(text)
  ) {
    return { tool: "get_autopilot_status", query: text, source: "instant" };
  }
  const dealScoreEarly = parseDealScore(text);
  if (dealScoreEarly && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_contact",
      query: dealScoreEarly.query,
      dealScore: dealScoreEarly.dealScore,
      source: "instant",
    };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    (/\b(pipeline metrics|pipeline stats|deal scores)\b/i.test(text) ||
      (/\bmetrics\b/i.test(text) && /\bpipeline\b/i.test(text)))
  ) {
    const name =
      parseNamedField(text, "pipeline") ||
      lookupQuery(text)
        .replace(/\b(pipeline metrics|pipeline stats|metrics|deal scores|for|the|a|an|pipeline)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return { tool: "pipeline_metrics", query: name, name: name || undefined, source: "instant" };
  }
  const namedCompany = parseNamedRecord(text, "company|entity|business");
  if (
    namedCompany &&
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(list|show|get|open)\b/i.test(text)
  ) {
    return { tool: "get_entity", query: namedCompany, name: namedCompany, source: "instant" };
  }
  const namedPerson = parseNamedRecord(text, "contact|person");
  if (
    namedPerson &&
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(list|show|get|open)\b/i.test(text)
  ) {
    return { tool: "get_contact", query: namedPerson, name: namedPerson, source: "instant" };
  }
  const namedSegment = parseNamedField(text, "segment");
  if (
    namedSegment &&
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(list|show|get|open|tell me about)\b/i.test(text)
  ) {
    return { tool: "get_segment", query: namedSegment, name: namedSegment, source: "instant" };
  }
  const namedPipeline = parseNamedField(text, "pipeline");
  if (
    namedPipeline &&
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(list|show|get|open|tell me about)\b/i.test(text)
  ) {
    return { tool: "get_pipeline", query: namedPipeline, name: namedPipeline, source: "instant" };
  }
  const pipelineStage = parsePipelineStage(text);
  if (pipelineStage && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_pipeline_entry",
      query: pipelineStage.query,
      name: pipelineStage.name,
      stage: pipelineStage.stage,
      source: "instant",
    };
  }
  const conversation = parseConversationStatus(text);
  if (conversation && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_pipeline_entry",
      query: conversation.query,
      name: conversation.name,
      conversationStatus: conversation.conversationStatus,
      source: "instant",
    };
  }
  const entityStatus = parseEntityStatus(text);
  if (entityStatus && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_entity",
      query: entityStatus.query,
      entityStatus: entityStatus.entityStatus,
      source: "instant",
    };
  }
  const statusUpdate = parseStatusUpdate(text);
  if (statusUpdate && !COMPOUND.test(text) && !DESTRUCTIVE.test(text)) {
    return {
      tool: "update_contact",
      query: statusUpdate.query,
      status: statusUpdate.status,
      source: "instant",
    };
  }
  const entityNotes = parseEntityNotes(text);
  if (entityNotes && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_entity",
      query: entityNotes.query,
      note: entityNotes.note,
      source: "instant",
    };
  }
  const qualifiedContact = parseQualifiedContactPatch(text);
  if (qualifiedContact && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_contact",
      query: qualifiedContact.query,
      website: qualifiedContact.website,
      location: qualifiedContact.location,
      source: "instant",
    };
  }
  const entityPhone = parseEntityPhone(text);
  if (entityPhone && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_entity",
      query: entityPhone.query,
      phone: entityPhone.phone,
      source: "instant",
    };
  }
  const entityPatch = parseEntityPatch(text);
  if (entityPatch && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_entity",
      query: entityPatch.query,
      industry: entityPatch.industry,
      location: entityPatch.location,
      domain: entityPatch.domain,
      website: entityPatch.website,
      description: entityPatch.description,
      size: entityPatch.size,
      source: "instant",
    };
  }
  const contactPatch = parseContactPatch(text);
  if (contactPatch && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_contact",
      query: contactPatch.query,
      title: contactPatch.title,
      email: contactPatch.email,
      phone: contactPatch.phone,
      company: contactPatch.company,
      linkedin: contactPatch.linkedin,
      twitter: contactPatch.twitter,
      facebook: contactPatch.facebook,
      instagram: contactPatch.instagram,
      note: contactPatch.note,
      source: "instant",
    };
  }
  const contactSource = parseContactSource(text);
  if (contactSource && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_contact",
      query: contactSource.query,
      crmSource: contactSource.crmSource,
      source: "instant",
    };
  }
  const contactTags = parseContactTags(text);
  if (contactTags && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_contact",
      query: contactTags.query,
      tags: contactTags.tags,
      source: "instant",
    };
  }
  const entityTags = parseEntityTags(text);
  if (entityTags && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "update_entity",
      query: entityTags.query,
      tags: entityTags.tags,
      source: "instant",
    };
  }
  const removeFromField = parseRemoveFromField(text);
  if (removeFromField && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: removeFromField.tool,
      query: removeFromField.query,
      name: removeFromField.name,
      source: "instant",
    };
  }
  const addToField = parseAddToField(text);
  if (addToField && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: addToField.tool,
      query: addToField.query,
      name: addToField.name,
      source: "instant",
    };
  }
  const rename = parseRenameField(text);
  if (rename && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: rename.tool,
      query: rename.query,
      name: rename.name,
      source: "instant",
    };
  }
  const syncCall = parseSyncCall(text);
  if (syncCall && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return { tool: "sync_call", query: syncCall.query, source: "instant" };
  }
  const outsideCall = parseOutsideCall(text);
  if (outsideCall && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return {
      tool: "log_call",
      query: outsideCall.query,
      note: outsideCall.note,
      durationSec: outsideCall.durationSec,
      source: "instant",
    };
  }
  const logSocial = parseLogSocial(text);
  if (logSocial && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text) && !COMPOSE.test(text)) {
    return {
      tool: "log_social_message",
      query: logSocial.query,
      note: logSocial.note,
      channel: logSocial.channel,
      direction: logSocial.direction,
      source: "instant",
    };
  }
  const saveEmail = parseSaveEmail(text);
  if (saveEmail && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text) && !COMPOSE.test(text)) {
    return {
      tool: "save_email_context",
      query: saveEmail.query,
      note: saveEmail.note,
      subject: saveEmail.subject,
      source: "instant",
    };
  }
  const outreach = parseLogOutreach(text);
  if (outreach && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text) && !COMPOSE.test(text)) {
    return {
      tool: "log_outreach",
      query: outreach.query,
      channel: outreach.channel,
      source: "instant",
    };
  }
  const addNote = parseAddNote(text);
  if (addNote && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text) && !COMPOSE.test(text)) {
    return {
      tool: "add_activity",
      query: addNote.query,
      note: addNote.note,
      source: "instant",
    };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(remember that|remember:|remember )\b/i.test(text)
  ) {
    const content = text.replace(/^(please\s+)?(remember that|remember:|remember)\s+/i, "").trim();
    if (content) return { tool: "remember", query: content, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /\b(provenance|where did .+ come from|source of|how do we know)\b/i.test(text)
  ) {
    const query = lookupQuery(text)
      .replace(/\b(provenance|where did|come from|source of|how do we know|email|linkedin|phone|for|the|a|an)\b/gi, " ")
      .replace(/'s\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (query) return { tool: "get_provenance", query, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /\b(build|make) (a |an )?(smart )?segment\b/i.test(text)
  ) {
    const goal = lookupQuery(text)
      .replace(/\b(build|make|a|an|smart|segment|for|called|named)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (goal) return { tool: "build_smart_segment", query: goal, name: goal, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(verify|legal[- ]?verify)\b/i.test(text)
  ) {
    const query = lookupQuery(text)
      .replace(/\b(verify|legal|entity|company|the|a|an)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (query) return { tool: "verify_entity", query, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    (/\b(detect|fingerprint)\b[\s\S]+\b(tech|stack|technograph)/i.test(text) ||
      /\b(what tech|what stack|tech stack|technographics?)\b/i.test(text))
  ) {
    const query = lookupQuery(text)
      .replace(/\b(detect|fingerprint|tech|stack|technographics?|uses?|does|for|the|a|an|what|company)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (query) return { tool: "detect_tech", query, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(list|show|get|open)\b/i.test(text) &&
    /\bsegments?\b/i.test(text)
  ) {
    return { tool: "list_segments", query: text, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /^(please\s+)?(list|show|get|open)\b/i.test(text) &&
    /\bpipelines?\b/i.test(text)
  ) {
    return { tool: "list_pipelines", query: text, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    (/\b(recent (discover(?:y|ies)|finds?|results?))\b/i.test(text) ||
      /^(list|show) (the )?(recent )?(discover(?:y|ies)|finds?)\b/i.test(text) ||
      /^(what did we (just )?(find|discover)|show what we discovered)\b/i.test(text))
  ) {
    return { tool: "list_recent_discoveries", query: text, source: "instant" };
  }
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    (/\b(swarm runs|recent swarm)\b/i.test(text) ||
      /^(list|show) (the )?(swarm runs)\b/i.test(text))
  ) {
    return { tool: "list_swarm_runs", query: text, source: "instant" };
  }
  const swarmRun = parseGetSwarmRun(text);
  if (swarmRun && !COMPOUND.test(text) && !DESTRUCTIVE.test(text)) {
    return { tool: "get_swarm_run", query: swarmRun.query, name: swarmRun.query || undefined, source: "instant" };
  }

  const segmentName = parseNamedCreate(text, "segment");
  if (segmentName && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return { tool: "create_segment", query: segmentName, name: segmentName, source: "instant" };
  }
  const pipelineName = parseNamedCreate(text, "pipeline");
  if (pipelineName && !COMPOUND.test(text) && !DESTRUCTIVE.test(text) && !SEND.test(text)) {
    return { tool: "create_pipeline", query: pipelineName, name: pipelineName, source: "instant" };
  }

  if (tooHardForInstant(text)) return null;

  const extractContacts = parseExtractContacts(text);
  if (extractContacts) {
    return { tool: "extract_contact_details", query: extractContacts.query, source: "instant" };
  }

  const enrichContact = parseEnrichContact(text);
  if (enrichContact) {
    return {
      tool: "enrich_contact",
      query: enrichContact.query,
      field: enrichContact.field,
      source: "instant",
    };
  }

  if (
    (/\b(find|search|look up)\b[\s\S]+\b(socials?|social profiles?)\b/i.test(text) ||
      /\b(socials?|social profiles?)\s+for\b/i.test(text))
  ) {
    const who = lookupQuery(text)
      .replace(/\b(socials?|social profiles?|linkedin)\b/gi, " ")
      .replace(/\b(for|of|'s)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (who) return { tool: "find_socials", query: who, source: "instant" };
  }

  if (/^(yes|yep|yeah|do it|go ahead|please do|discover (them|those|it)|find them|add them)$/i.test(text)) {
    const missed = extractMissedQuery(priorAssistant);
    if (missed) return { tool: "find_companies", query: missed, source: "instant" };
    return null;
  }

  if (/\benrich\b/i.test(text)) {
    const q = lookupQuery(text);
    if (q) return { tool: "enrich_entity", query: q, source: "instant" };
  }

  if (
    !COMPOSE.test(text) &&
    !SEND.test(text) &&
    /^(please\s+)?(list|show|get|open)\b/i.test(text)
  ) {
    const who = historySubject(text);
    if (
      who &&
      /\b(linkedin|instagram|facebook|twitter|\bx\b|dms?|social)\b/i.test(text) &&
      /\b(messages?|dms?|thread|history)\b/i.test(text)
    ) {
      return { tool: "list_social_messages", query: who, source: "instant" };
    }
    if (who && /\b(emails?|inbox)\b/i.test(text)) {
      return { tool: "list_emails", query: who, source: "instant" };
    }
    if (who && /\b(activit(?:y|ies)|trail)\b/i.test(text)) {
      return { tool: "list_activities", query: who, source: "instant" };
    }
    if (who && /\b(calls?|call history)\b/i.test(text)) {
      return { tool: "list_contact_calls", query: who, source: "instant" };
    }
  }

  if (
    /^(please\s+)?(tell me about|what do you know about|what(?:'s| is) the status of|summarize|who is)\b/i.test(
      text,
    )
  ) {
    return { tool: "search_crm", query: lookupQuery(text), detail: true, source: "instant" };
  }

  const contact = parseCreateContact(text);
  if (contact) {
    return {
      tool: "create_contact",
      query: contact.name ?? contact.email ?? "",
      name: contact.name,
      email: contact.email,
      company: contact.company,
      title: contact.title,
      phone: contact.phone,
      linkedin: contact.linkedin,
      source: "instant",
    };
  }

  const entity = parseCreateEntity(text);
  if (entity) {
    return {
      tool: "create_entity",
      query: entity.name,
      name: entity.name,
      domain: entity.domain,
      website: entity.website,
      industry: entity.industry,
      location: entity.location,
      source: "instant",
    };
  }

  if (/\b(swarm|multiple angles|fan out)\b/i.test(text)) {
    return { tool: "swarm_discover", query: lookupQuery(text), source: "instant" };
  }

  const maps = parseMaps(text);
  if (maps) return { tool: "maps_leads", query: maps.query, location: maps.location, source: "instant" };

  if (
    /\b(find|discover|search for|look for)\b[\s\S]+\b(compan(y|ies)|startups?|leads?|businesses)\b/i.test(
      text,
    ) ||
    /^(find|discover) companies\b/i.test(text)
  ) {
    const q = lookupQuery(text).replace(/^(companies|company)\s+/i, "");
    return { tool: "find_companies", query: q, source: "instant" };
  }

  if (/\b(search the web|google|look up online|research)\b/i.test(text)) {
    return { tool: "search_web", query: lookupQuery(text), source: "instant" };
  }

  if (/\b(what do you remember|recall|from (our |the )?last (chat|time|conversation))\b/i.test(text)) {
    return { tool: "recall", query: lookupQuery(text), source: "instant" };
  }

  if (
    /\b(follow-?ups?|follow\s+ups?|stale contacts?|who (should|do i|to) (chase|follow))\b/i.test(text) ||
    /^(list|show) (the )?(due |stale )?(follow[-\s]?ups?)\b/i.test(text)
  ) {
    return { tool: "list_due_followups", query: text, source: "instant" };
  }

  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    (/\b(price list|credit costs?|action costs?)\b/i.test(text) ||
      /\bwhat do (credits?|actions?|tools?) cost\b/i.test(text) ||
      /\bhow much (does|do) .{0,40} cost\b/i.test(text))
  ) {
    return { tool: "get_usage", query: text, source: "instant" };
  }

  if (
    /\b(credits? remaining|credit balance|my credits|our credits|usage|billing)\b/i.test(text) ||
    /^(how many|what(?:'s| is)|show|check|get)\b.+\b(credits?|usage|balance)\b/i.test(text)
  ) {
    return { tool: "get_billing", query: text, source: "instant" };
  }

  if (
    /^(please\s+)?(show|find|search|list|look up|lookup|who is|what is|get|open|tell me about|summarize)\b/i.test(
      text,
    ) ||
    /\b(in the crm|from the crm|in my crm)\b/i.test(text)
  ) {
    const listOnly = /^(please\s+)?(list|show)\b/i.test(text);
    const people = /\b(contacts?|people)\b/i.test(text);
    const companies = /\b(companies|entities|businesses)\b/i.test(text);
    const tool =
      listOnly && people && !companies
        ? "list_contacts"
        : listOnly && companies && !people
          ? "list_entities"
          : "search_crm";
    const query = lookupQuery(text)
      .replace(/^(the\s+|my\s+|our\s+)?(companies|entities|businesses|contacts?|people)\s*$/i, "")
      .trim();
    return { tool, query, source: "instant" };
  }

  return null;
}
