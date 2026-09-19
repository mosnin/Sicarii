// The 10x Jev harness: Jev decides, code executes, Qwen writes only when
// a sentence is required. People on X are showing this split. Scalar was
// still paying for streamText after Jev already picked a tool. This module
// is the skip.

import type { Handler } from "./decide";
import { runAutoModeThen } from "./harness";
import type { Json } from "./contract";
import { logJevDecision } from "./telemetry";
import { lookupQuery, splitLocalQuery } from "./query";
import type { InstantRoute } from "./instant";
import { factsFromSearch, formatDetailCard } from "./facts";

export const FAST_PATH_TOOLS = new Set([
  "search_crm",
  "list_entities",
  "list_contacts",
  "find_companies",
  "maps_leads",
  "swarm_discover",
  "search_web",
  "google_search",
  "recall",
  "list_pending_drafts",
  "get_autopilot_status",
  "create_entity",
  "create_contact",
  "enrich_entity",
  "list_due_followups",
  "get_billing",
]);

const READ_CORE = [
  "search_crm",
  "recall",
  "get_entity",
  "get_contact",
  "list_entities",
  "list_contacts",
] as const;

const DISCOVER_CORE = [
  ...READ_CORE,
  "find_companies",
  "maps_leads",
  "swarm_discover",
  "search_web",
  "google_search",
] as const;

const MUTATE_CORE = [
  ...READ_CORE,
  "create_entity",
  "update_entity",
  "create_contact",
  "update_contact",
  "enrich_entity",
] as const;

export function canSkipGeneration(decision: Handler): boolean {
  if (decision.kind === "deterministic") {
    return decision.action === "lookup" || decision.action === "analyze";
  }
  if (decision.kind === "tool") {
    const name = decision.tool.startsWith("skill:") ? "" : decision.tool;
    return FAST_PATH_TOOLS.has(name);
  }
  return false;
}

export function activeToolNames(decision: Handler, allNames: string[]): string[] {
  if (decision.kind === "escalate") return allNames;
  const allow = new Set<string>(
    decision.kind === "deterministic" && decision.action === "mutate"
      ? MUTATE_CORE
      : DISCOVER_CORE,
  );
  if (decision.kind === "tool") {
    const picked = decision.tool.startsWith("skill:") ? "" : decision.tool;
    if (picked) allow.add(picked);
    if (!FAST_PATH_TOOLS.has(picked)) {
      for (const n of READ_CORE) allow.add(n);
    }
  }
  if (decision.kind === "generate") allow.add("draft_breakups");
  return allNames.filter((n) => allow.has(n));
}

export function pickActiveTools<T extends Record<string, unknown>>(
  tools: T,
  decision: Handler,
): Partial<T> {
  const keep = new Set(activeToolNames(decision, Object.keys(tools)));
  const out: Partial<T> = {};
  for (const key of Object.keys(tools) as (keyof T)[]) {
    if (keep.has(String(key))) out[key] = tools[key];
  }
  return out;
}

type Named = { name?: string | null; domain?: string | null; company?: string | null };

export function formatNamedList(label: string, rows: Named[], empty: string): string {
  if (rows.length === 0) return empty;
  const bits = rows.slice(0, 8).map((r) => {
    const name = r.name ?? r.company ?? "untitled";
    const extra = r.domain ? ` (${r.domain})` : "";
    return `${name}${extra}`;
  });
  const more = rows.length > 8 ? `, and ${rows.length - 8} more` : "";
  const verb = rows.length === 1 ? "is" : "are";
  return `${label} ${verb} ${bits.join(", ")}${more}.`;
}

export function formatFastReply(input: {
  tool: string;
  payload: unknown;
  query: string;
  detail?: boolean;
  ranked?: string;
}): string {
  const { tool, payload, query } = input;
  if (payload && typeof payload === "object" && "error" in payload) {
    const err = (payload as { error?: unknown }).error;
    return typeof err === "string" ? err : "That tool could not run.";
  }

  if (tool === "search_crm" || tool === "list_entities" || tool === "list_contacts") {
    const box = payload as { entities?: Named[]; contacts?: Named[] };
    const entities = box.entities ?? (tool === "list_entities" ? (payload as Named[]) : []);
    const contacts = box.contacts ?? (tool === "list_contacts" ? (payload as Named[]) : []);
    if (entities.length === 0 && contacts.length === 0) {
      return `I did not find companies or people in the CRM for "${query}". Say the word if you want me to discover new ones.`;
    }
    if (input.detail || entities.length + contacts.length <= 2) {
      const card = formatDetailCard(factsFromSearch(payload), query);
      if (card) return input.ranked ? `${card} ${input.ranked}` : card;
    }
    const bits: string[] = [];
    if (Array.isArray(entities) && entities.length > 0) {
      bits.push(formatNamedList("In the CRM the companies", entities, ""));
    }
    if (Array.isArray(contacts) && contacts.length > 0) {
      bits.push(
        formatNamedList(
          "The people",
          contacts.map((c) => ({ name: c.name, domain: c.company })),
          "",
        ),
      );
    }
    if (input.ranked) bits.push(input.ranked);
    return bits.filter(Boolean).join(" ");
  }

  if (tool === "find_companies" || tool === "maps_leads") {
    const r = payload as { added?: number; skipped?: number; created?: Named[] };
    const added = r.added ?? r.created?.length ?? 0;
    const names = formatNamedList("I added", r.created ?? [], "");
    if (added === 0) {
      return `Discovery for "${query}" returned no new companies${r.skipped ? ` (${r.skipped} already in the CRM)` : ""}.`;
    }
    return `Discovery for "${query}" added ${added} compan${added === 1 ? "y" : "ies"}${r.skipped ? ` and skipped ${r.skipped} already known` : ""}. ${names}`.trim();
  }

  if (tool === "swarm_discover") {
    const r = payload as { added?: number; skipped?: number; companies?: Array<{ companyName?: string; domain?: string | null }> };
    const added = r.added ?? 0;
    return `Swarm discovery added ${added} compan${added === 1 ? "y" : "ies"} for "${query}"${r.skipped ? ` and skipped ${r.skipped} already known` : ""}.`;
  }

  if (tool === "search_web" || tool === "google_search") {
    const rows = Array.isArray(payload)
      ? payload
      : ((payload as { results?: Array<{ title?: string; url?: string }> }).results ?? []);
    if (rows.length === 0) return `No web results for "${query}".`;
    const bits = rows.slice(0, 5).map((row) => {
      const r = row as { title?: string; url?: string };
      return r.title ? `${r.title}${r.url ? ` (${r.url})` : ""}` : (r.url ?? "result");
    });
    return `I read ${rows.length} pages on "${query}": ${bits.join("; ")}. These are pages, not companies.`;
  }

  if (tool === "recall") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "I do not have stored memory for that yet.";
    const first = rows[0] as { content?: string };
    return `I remember this: ${(first.content ?? "earlier context").slice(0, 400)}`;
  }

  if (tool === "list_pending_drafts") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "There are no breakup drafts waiting for review.";
    return `There ${rows.length === 1 ? "is 1 breakup draft" : `are ${rows.length} breakup drafts`} waiting for review on the dashboard.`;
  }

  if (tool === "get_autopilot_status") {
    return "I pulled the current autopilot status. Open Autopilot on the dashboard for the budget and run ledger.";
  }

  if (tool === "create_entity") {
    const r = payload as { name?: string; domain?: string | null };
    const name = r.name ?? query;
    return `Added ${name}${r.domain ? ` (${r.domain})` : ""} to the CRM.`;
  }

  if (tool === "create_contact") {
    const r = payload as { name?: string | null; email?: string | null; company?: string | null };
    const who = r.name ?? r.email ?? query;
    const at = r.company ? ` at ${r.company}` : "";
    return `Added ${who}${at} as a contact.`;
  }

  if (tool === "enrich_entity") {
    const r = payload as { name?: string; domain?: string | null };
    return `Enriched ${r.name ?? query}${r.domain ? ` (${r.domain})` : ""}. Open the company on the dashboard for the new firmographics.`;
  }

  if (tool === "list_due_followups") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "No contacts are due for a follow-up.";
    const bits = rows.slice(0, 8).map((row) => {
      const r = row as { name?: string | null; company?: string | null };
      return r.company ? `${r.name ?? "someone"} at ${r.company}` : (r.name ?? "someone");
    });
    const more = rows.length > 8 ? `, and ${rows.length - 8} more` : "";
    return `${rows.length} contact${rows.length === 1 ? "" : "s"} due for a follow-up: ${bits.join(", ")}${more}.`;
  }

  if (tool === "get_billing") {
    const b = payload as { creditsRemaining?: number; plan?: string };
    return `You have ${b.creditsRemaining ?? 0} credits remaining on the ${b.plan ?? "current"} plan.`;
  }

  return "Done.";
}

export type FastPathRunners = {
  searchCrm: (q: string) => Promise<unknown>;
  findCompanies: (query: string) => Promise<unknown>;
  mapsLeads: (query: string, location?: string) => Promise<unknown>;
  swarmDiscover: (goal: string) => Promise<unknown>;
  searchWeb: (query: string) => Promise<unknown>;
  googleSearch: (query: string) => Promise<unknown>;
  recall: (query: string) => Promise<unknown>;
  listPendingDrafts: () => Promise<unknown>;
  getAutopilotStatus: () => Promise<unknown>;
  createEntity: (name: string, domain?: string) => Promise<unknown>;
  createContact: (input: { name?: string; email?: string; company?: string }) => Promise<unknown>;
  enrichEntity: (id: string) => Promise<unknown>;
  listEntities?: (q?: string) => Promise<unknown>;
  listContacts?: (q?: string) => Promise<unknown>;
  listDueFollowups?: () => Promise<unknown>;
  getBilling?: () => Promise<unknown>;
  scoreFit?: (rows: Array<{ id: string; text: string }>) => Promise<Array<{ id: string; score: number }>>;
};

export async function executeFastPath(input: {
  message: string;
  decision: Handler;
  runners: FastPathRunners;
  instant?: InstantRoute | null;
  prefetch?: unknown;
}): Promise<{ text: string; tool: string } | null> {
  if (!canSkipGeneration(input.decision)) return null;
  const query = input.instant?.query ?? lookupQuery(input.message);
  const local = input.instant?.location
    ? { query: input.instant.query, location: input.instant.location }
    : splitLocalQuery(input.message);
  const tool =
    input.instant?.tool ??
    (input.decision.kind === "tool" ? input.decision.tool : "search_crm");

  const started = Date.now();
  let payload: unknown;
  try {
    const lookupHit =
      (tool === "search_crm" ||
        tool === "list_entities" ||
        tool === "list_contacts" ||
        tool === "list_due_followups" ||
        tool === "get_billing") &&
      input.prefetch != null;
    payload = lookupHit
      ? input.prefetch
      : await runTool(tool, query, local, input.runners, input.message, input.instant);
  } catch (e) {
    payload = { error: e instanceof Error ? e.message : "Internal error" };
  }

  let ranked: string | undefined;
  if (
    input.decision.kind === "deterministic" &&
    input.decision.action === "analyze" &&
    input.runners.scoreFit &&
    payload &&
    typeof payload === "object"
  ) {
    const facts = factsFromSearch(payload).filter((f) => f.kind === "entity" && f.id);
    if (facts.length > 0) {
      const scores = await input.runners.scoreFit(
        facts.map((f) => ({
          id: f.id!,
          text: [f.name, f.domain, f.industry, f.location].filter(Boolean).join(" "),
        })),
      );
      const best = [...scores].sort((a, b) => b.score - a.score)[0];
      const name = facts.find((f) => f.id === best?.id)?.name;
      if (best && name) ranked = `Best ICP fit is ${name} (${best.score.toFixed(1)}).`;
    }
  }

  const text = formatFastReply({
    tool,
    payload,
    query,
    detail: input.instant?.detail,
    ranked,
  });
  logJevDecision({
    surface: "agent-fast-path",
    action: tool,
    source: input.instant ? "instant" : "jev",
    reasons: [input.decision.kind],
    latencyMs: Date.now() - started,
  });
  return { text, tool };
}

async function runTool(
  tool: string,
  query: string,
  local: { query: string; location?: string },
  runners: FastPathRunners,
  message: string,
  instant?: InstantRoute | null,
): Promise<unknown> {
  const write = (name: string, args: Json, fn: () => Promise<unknown>) =>
    runAutoModeThen(name, args, message, fn);

  switch (tool) {
    case "find_companies":
      return write("find_companies", { query }, () => runners.findCompanies(query));
    case "maps_leads":
      return write("maps_leads", { query: local.query, location: local.location ?? null }, () =>
        runners.mapsLeads(local.query, local.location),
      );
    case "swarm_discover":
      return write("swarm_discover", { goal: query }, () => runners.swarmDiscover(query));
    case "search_web":
      return write("search_web", { query }, () => runners.searchWeb(query));
    case "google_search":
      return write("google_search", { query }, () => runners.googleSearch(query));
    case "create_entity":
      return write(
        "create_entity",
        { name: instant?.name ?? query, domain: instant?.domain ?? null },
        () => runners.createEntity(instant?.name ?? query, instant?.domain),
      );
    case "create_contact":
      return write(
        "create_contact",
        { name: instant?.name ?? null, email: instant?.email ?? null, company: instant?.company ?? null },
        () =>
          runners.createContact({
            name: instant?.name,
            email: instant?.email,
            company: instant?.company,
          }),
      );
    case "enrich_entity": {
      const found = await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const first = facts.find((f) => f.kind === "entity" && f.id);
      if (!first?.id) {
        return { error: `I did not find "${query}" in the CRM to enrich. Say the word if you want me to discover it.` };
      }
      return write("enrich_entity", { id: first.id }, () => runners.enrichEntity(first.id!));
    }
    case "recall":
      return runners.recall(query);
    case "list_pending_drafts":
      return runners.listPendingDrafts();
    case "get_autopilot_status":
      return runners.getAutopilotStatus();
    case "list_due_followups":
      return runners.listDueFollowups ? runners.listDueFollowups() : [];
    case "get_billing":
      return runners.getBilling ? runners.getBilling() : { creditsRemaining: 0, plan: "unknown" };
    case "list_entities":
      return runners.listEntities ? runners.listEntities(query || undefined) : runners.searchCrm(query);
    case "list_contacts":
      return runners.listContacts ? runners.listContacts(query || undefined) : runners.searchCrm(query);
    case "search_crm":
    default:
      return runners.searchCrm(query);
  }
}
