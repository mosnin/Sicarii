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
  detail?: boolean;
  source: "instant";
};

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
      /\b(the |a |an )?(emails?|inbox|messages|activities|activity|calls?|history|thread|trail)\b/gi,
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

function parseCreateEntity(text: string): { name: string; domain?: string } | null {
  if (!/\b(add|create|save|new)\b/i.test(text)) return null;
  if (!/\b(company|business|entity)\b/i.test(text)) return null;
  const domain = parseDomain(text);
  const called = text.match(
    /\b(?:add|create|save|new)\b[\s\S]+?\b(?:company|business|entity)\b[\s\S]+?\b(?:called|named)\s+["']?([^"',.]+)["']?/i,
  );
  const stripDomain = (raw: string) =>
    raw
      .replace(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i, "")
      .replace(/[()]/g, "")
      .trim()
      .slice(0, 120);
  if (called?.[1]) return { name: stripDomain(called[1]), domain };
  const asCompany = text.match(
    /\b(?:add|create|save)\s+["']?([^"',]+?)["']?\s+as\s+an?\s+(?:company|business|entity)\b/i,
  );
  if (asCompany?.[1]) return { name: stripDomain(asCompany[1]), domain };
  const companyX = text.match(
    /\b(?:add|create|save|new)\s+an?\s+(?:company|business|entity)\s+(?:called|named\s+)?["']?([^"',.]+)["']?/i,
  );
  if (companyX?.[1] && !/^(called|named|in|for|with|to)$/i.test(companyX[1].trim())) {
    return { name: stripDomain(companyX[1].replace(/^(called|named)\s+/i, "")), domain };
  }
  return null;
}

function parseCreateContact(text: string): {
  name?: string;
  email?: string;
  company?: string;
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
  return {
    name,
    email,
    company: atCo?.[1]?.replace(/[.,]+$/, "").trim(),
  };
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
  if (
    !COMPOUND.test(text) &&
    !DESTRUCTIVE.test(text) &&
    /\bautopilot\b/i.test(text) &&
    /\b(status|doing|budget|running|plan)\b/i.test(text)
  ) {
    return { tool: "get_autopilot_status", query: text, source: "instant" };
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
    (/\b(swarm runs?|recent (swarm|discover(?:y|ies)))\b/i.test(text) ||
      /^(list|show) (the )?(swarm runs?|discover(?:y|ies))\b/i.test(text))
  ) {
    return { tool: "list_swarm_runs", query: text, source: "instant" };
  }

  if (tooHardForInstant(text)) return null;

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
    if (who && /\b(emails?|inbox|messages)\b/i.test(text)) {
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
