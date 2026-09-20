// Pure routing logic for the command box: the tool catalog, the no-LLM
// heuristic router, and the param allowlist filter. Kept out of the route file
// so it is unit-testable (route files should only export HTTP handlers) and so
// the classifier's "pick a valid tool with only its allowed params" contract is
// enforced in one place.

export interface RouterTool {
  id: string;
  purpose: string;
  params: string[];
}

// The tool menu the classifier chooses from. `id` must match a tool on the
// /discover page; `params` are the only keys allowed through for that tool.
export const TOOLS: RouterTool[] = [
  { id: "find-entities", purpose: "Find/list companies matching a described ideal customer (B2B, startups, funded, by industry/tech/region). The default for 'find companies'.", params: ["query"] },
  { id: "maps-leads", purpose: "Find LOCAL businesses you could visit (restaurants, dentists, salons, law firms) with phone + address, from Google Maps.", params: ["query", "location"] },
  { id: "intent-scan", purpose: "Find companies/people actively in-market for a product like the user's (buying signals).", params: ["query"] },
  { id: "search-companies", purpose: "Filter a company database by country + industry + size.", params: ["industry", "country", "size"] },
  { id: "company-lookalikes", purpose: "Find companies similar to a given company domain.", params: ["domain"] },
  { id: "enrich-domain", purpose: "Get a full firmographic profile for ONE known company domain.", params: ["domain"] },
  { id: "company-funding", purpose: "Funding rounds, investors, acquisitions for a company domain.", params: ["domain"] },
  { id: "tech-stack", purpose: "The technologies a company (by domain) runs.", params: ["domain"] },
  { id: "company-news", purpose: "Recent news and signals for a company domain.", params: ["domain"] },
  { id: "find-people", purpose: "Find people at a company (by domain), optionally by department/seniority.", params: ["domain", "department", "level"] },
  { id: "find-email", purpose: "Find a verified work email for a named person at a domain.", params: ["firstName", "lastName", "domain"] },
  { id: "find-mobile", purpose: "Find a mobile number for a named professional.", params: ["firstName", "lastName", "domain"] },
  { id: "contact-info", purpose: "Scrape a company website URL for emails/phones/socials as contacts.", params: ["url"] },
  { id: "analyze-site", purpose: "Deep-read a company website URL and pull the people on it.", params: ["url"] },
  { id: "scrape-url", purpose: "Extract clean markdown text from a single URL.", params: ["url"] },
  { id: "deep-research", purpose: "Exhaustive, sourced research on a topic/person/company (a real question).", params: ["query"] },
  { id: "quick-research", purpose: "Fast standard-depth research; good for recent news/overview.", params: ["query"] },
  { id: "web-search", purpose: "Plain web search with source links (fallback for general queries).", params: ["query"] },
];

export const VALID_TOOL_IDS = new Set(TOOLS.map((t) => t.id));

export function toolMenu(): string {
  return TOOLS.map((t) => `- ${t.id} (params: ${t.params.join(", ") || "none"}): ${t.purpose}`).join("\n");
}

/**
 * Heuristic router used when no LLM key is set (and as the backfill when the LLM
 * picks an invalid tool or yields no usable params). Never dead-ends. Each
 * alternative is `\b`-anchored on both sides so a keyword can't match a
 * substring of an unrelated word.
 */
export function heuristicRoute(intent: string): { toolId: string; params: Record<string, string> } {
  const t = intent.toLowerCase().trim();
  const domain = t.match(/([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i)?.[1];

  if (domain && /\b(enrich|firmographic|firmographics|profile|about)\b/.test(t)) return { toolId: "enrich-domain", params: { domain } };
  if (domain && /\b(fund|funding|raise|raising|investor|investors|series|acquisition|acquired)\b/.test(t)) return { toolId: "company-funding", params: { domain } };
  if (domain && /\b(tech|stack|technology|technologies|tooling)\b/.test(t)) return { toolId: "tech-stack", params: { domain } };
  if (domain && /\b(news|signal|signals|update|updates)\b/.test(t)) return { toolId: "company-news", params: { domain } };
  if (/\b(local|near me|restaurant|dentist|salon|shop|store|clinic|plumber|cafe|bar|gym|realtor|contractor|roofer)s?\b/.test(t)) return { toolId: "maps-leads", params: { query: intent } };
  if (/\b(in-market|buying|actively looking|intent|ready to buy)\b/.test(t)) return { toolId: "intent-scan", params: { query: intent } };
  if (/\b(who is|what is|research|explain|how does|why|tell me about)\b/.test(t)) return { toolId: "quick-research", params: { query: intent } };
  if (/\b(find|list|companies|startups|prospects|leads|accounts)\b/.test(t)) return { toolId: "find-entities", params: { query: intent } };
  return { toolId: "web-search", params: { query: intent } };
}

/**
 * Keep only the params a given tool allows, as trimmed non-empty strings capped
 * at 300 chars. This is the security boundary on classifier output: an injected
 * intent can at most select a valid tool with valid, bounded params.
 */
export function filterParams(toolId: string, raw: Record<string, unknown> | undefined): Record<string, string> {
  const allowed = new Set(TOOLS.find((t) => t.id === toolId)?.params ?? []);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (allowed.has(k) && typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return out;
}
