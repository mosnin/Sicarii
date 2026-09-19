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
  "get_balance",
  "get_usage",
  "list_variant_stats",
  "select_variant",
  "create_variant",
  "draft_breakups",
  "propose_autopilot_plan",
  "update_entity",
  "log_social_message",
  "extract_contact_details",
  "list_segments",
  "list_pipelines",
  "list_swarm_runs",
  "list_emails",
  "list_activities",
  "list_contact_calls",
  "list_social_messages",
  "create_segment",
  "create_pipeline",
  "pause_autopilot",
  "enrich_contact",
  "find_socials",
  "get_segment",
  "get_pipeline",
  "get_entity",
  "get_contact",
  "update_contact",
  "add_to_pipeline",
  "add_to_segment",
  "remove_pipeline_entry",
  "remove_segment_member",
  "log_outreach",
  "add_activity",
  "list_recent_discoveries",
  "update_segment",
  "update_pipeline",
  "sync_call",
  "log_call",
  "update_pipeline_entry",
  "save_email_context",
  "get_swarm_run",
  "pipeline_metrics",
  "remember",
  "get_provenance",
  "build_smart_segment",
  "verify_entity",
  "detect_tech",
  "jev_triage",
  "jev_scan_malicious",
  "jev_grade_page",
  "jev_verify_citations",
  "score_fit",
  "count_entities",
  "count_contacts",
  "count_due_followups",
  "count_segments",
  "count_pipelines",
  "count_pending_drafts",
]);

const READ_CORE = [
  "search_crm",
  "recall",
  "get_entity",
  "get_contact",
  "list_entities",
  "list_contacts",
  "list_segments",
  "list_pipelines",
  "get_segment",
  "get_pipeline",
  "score_fit",
  "count_entities",
  "count_contacts",
  "count_due_followups",
  "count_segments",
  "count_pipelines",
  "count_pending_drafts",
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
  if (decision.kind === "tool") {
    const picked = decision.tool.startsWith("skill:") ? "" : decision.tool;
    const allow = new Set<string>(READ_CORE);
    if (picked) allow.add(picked);
    return allNames.filter((n) => allow.has(n));
  }
  const allow = new Set<string>(
    decision.kind === "deterministic" && decision.action === "mutate"
      ? MUTATE_CORE
      : DISCOVER_CORE,
  );
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

  if (tool === "draft_breakups") {
    const r = payload as {
      drafted?: number;
      skipped?: number;
      scanned?: number;
      staleDays?: number;
    };
    if ((r.drafted ?? 0) === 0 && (r.skipped ?? 0) === 0) {
      return "No stalled deals needed a breakup draft.";
    }
    const drafted = r.drafted ?? 0;
    const skipped = r.skipped ?? 0;
    const skip =
      skipped > 0 ? `, skipped ${skipped} already pending` : "";
    return `Drafted ${drafted} breakup email${drafted === 1 ? "" : "s"} for review${skip}.`;
  }

  if (tool === "get_autopilot_status") {
    const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
    if (rows.length === 0) {
      return "There is no autopilot plan yet. Propose one if you want unsupervised work.";
    }
    const bits = rows.slice(0, 5).map((row) => {
      const p = row as {
        name?: string;
        status?: string;
        totalCredits?: number;
        allocations?: Array<{ category?: string; allocated?: number; spent?: number }>;
      };
      const spend = (p.allocations ?? [])
        .map((a) => `${a.category ?? "category"} ${a.spent ?? 0}/${a.allocated ?? 0}`)
        .join(", ");
      const cap = p.totalCredits != null ? `${p.totalCredits} credit cap` : "";
      const extra = [spend, cap].filter(Boolean).join("; ");
      return `${p.name ?? "plan"} is ${p.status ?? "unknown"}${extra ? ` (${extra})` : ""}`;
    });
    return `${bits.join(". ")}.`;
  }

  if (tool === "propose_autopilot_plan") {
    const r = payload as {
      name?: string | null;
      totalCredits?: number;
      cadence?: string | null;
    };
    const name = r.name ?? query;
    const credits = r.totalCredits != null ? `${r.totalCredits} credits` : "a credit cap";
    const cadence = r.cadence ? `, ${r.cadence}` : "";
    return `Proposed draft plan ${name} (${credits}${cadence}). Approve it on the dashboard.`;
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

  if (tool === "count_entities" || tool === "count_contacts") {
    const r = payload as { count?: number; kind?: string; status?: string };
    const n =
      typeof payload === "number" && Number.isFinite(payload)
        ? payload
        : typeof r.count === "number" && Number.isFinite(r.count)
          ? r.count
          : 0;
    const people = tool === "count_contacts" || r.kind === "contact";
    const who = people ? (n === 1 ? "contact" : "contacts") : n === 1 ? "company" : "companies";
    const filter = r.status ? ` marked ${r.status.toLowerCase()}` : "";
    return `You have ${n} ${who}${filter} in the CRM.`;
  }

  if (tool === "count_segments" || tool === "count_pipelines" || tool === "count_pending_drafts") {
    const r = payload as { count?: number };
    const n =
      typeof payload === "number" && Number.isFinite(payload)
        ? payload
        : typeof r.count === "number" && Number.isFinite(r.count)
          ? r.count
          : 0;
    const who =
      tool === "count_segments"
        ? n === 1 ? "segment" : "segments"
        : tool === "count_pipelines"
          ? n === 1 ? "pipeline" : "pipelines"
          : n === 1 ? "pending draft" : "pending drafts";
    return `You have ${n} ${who}.`;
  }

  if (tool === "count_due_followups") {
    const r = payload as { count?: number; staleDays?: number };
    const n =
      typeof payload === "number" && Number.isFinite(payload)
        ? payload
        : typeof r.count === "number" && Number.isFinite(r.count)
          ? r.count
          : 0;
    const window = r.staleDays != null ? ` older than ${r.staleDays} days` : "";
    return n === 0
      ? "No contacts are due for a follow-up."
      : `You have ${n} contact${n === 1 ? "" : "s"} due for a follow-up${window}.`;
  }

  if (tool === "get_billing" || tool === "get_balance") {
    const b = payload as { creditsRemaining?: number; plan?: string };
    return `You have ${b.creditsRemaining ?? 0} credits remaining on the ${b.plan ?? "current"} plan.`;
  }

  if (tool === "get_usage") {
    const u = payload as {
      creditsRemaining?: number;
      plan?: string;
      actionCosts?: Record<string, number>;
    };
    const costs = Object.entries(u.actionCosts ?? {})
      .slice(0, 6)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    return `You have ${u.creditsRemaining ?? 0} credits on the ${u.plan ?? "current"} plan.${costs ? ` Costs: ${costs}.` : ""}`;
  }

  if (tool === "list_variant_stats") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "There are no outreach variants yet. Create a subject line or opener first.";
    const winner = rows.find((row) => (row as { winning?: boolean }).winning) as
      | { text?: string; kind?: string; replyRate?: number }
      | undefined;
    if (winner?.text) {
      return `The winning ${String(winner.kind ?? "variant").toLowerCase()} is "${winner.text.slice(0, 120)}" (${Math.round((winner.replyRate ?? 0) * 100)}% reply rate) across ${rows.length} variants.`;
    }
    return `${rows.length} outreach variant${rows.length === 1 ? "" : "s"} on file. None has enough sends to call a winner yet.`;
  }

  if (tool === "select_variant") {
    const v = payload as { text?: string; kind?: string; error?: string };
    if (v.error) return v.error;
    if (!v.text) return "No active variants in that pool. Create one first.";
    return `Use this ${String(v.kind ?? "variant").toLowerCase()}: ${v.text.slice(0, 280)}`;
  }

  if (tool === "create_variant") {
    const v = payload as { kind?: string; text?: string };
    const kind = String(v.kind ?? query ?? "variant").toLowerCase();
    const snippet = (v.text ?? "").trim().slice(0, 80);
    return `Added ${kind} variant${snippet ? `: ${snippet}` : "."}`;
  }

  if (tool === "list_segments") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "There are no segments yet.";
    const bits = rows.slice(0, 8).map((row) => (row as { name?: string }).name ?? "untitled");
    const more = rows.length > 8 ? `, and ${rows.length - 8} more` : "";
    return `${rows.length} segment${rows.length === 1 ? "" : "s"}: ${bits.join(", ")}${more}.`;
  }

  if (tool === "list_pipelines") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "There are no pipelines yet.";
    const bits = rows.slice(0, 8).map((row) => {
      const p = row as { name?: string; _count?: { entries?: number } };
      const n = p._count?.entries;
      return n != null ? `${p.name ?? "untitled"} (${n})` : (p.name ?? "untitled");
    });
    const more = rows.length > 8 ? `, and ${rows.length - 8} more` : "";
    return `${rows.length} pipeline${rows.length === 1 ? "" : "s"}: ${bits.join(", ")}${more}.`;
  }

  if (tool === "list_swarm_runs") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "There are no swarm runs yet.";
    return `${rows.length} recent swarm run${rows.length === 1 ? "" : "s"} on file.`;
  }

  if (tool === "list_recent_discoveries") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return "No recent discoveries yet.";
    const bits = rows.slice(0, 6).map((row) => {
      const r = row as { name?: string | null; kind?: string | null };
      return r.name ?? r.kind ?? "record";
    });
    const more = rows.length > 6 ? `, and ${rows.length - 6} more` : "";
    return `${rows.length} recent discover${rows.length === 1 ? "y" : "ies"}: ${bits.join(", ")}${more}.`;
  }

  if (tool === "add_activity") {
    const r = payload as { name?: string | null; body?: string | null };
    const who = r.name ?? query;
    const snippet = (r.body ?? "").trim().slice(0, 80);
    return `Noted on ${who}${snippet ? `: ${snippet}` : "."}`;
  }

  if (tool === "update_segment" || tool === "update_pipeline") {
    const r = payload as { name?: string | null };
    return `Renamed ${query} to ${r.name ?? "the new name"}.`;
  }

  if (tool === "sync_call") {
    const r = payload as { name?: string | null; status?: string | null };
    const who = r.name ?? query;
    return `Synced ${who}'s last call${r.status ? ` (${r.status})` : ""}.`;
  }

  if (tool === "update_pipeline_entry") {
    const r = payload as {
      name?: string | null;
      who?: string | null;
      stage?: string | null;
      conversationStatus?: string | null;
    };
    const who = r.who ?? query;
    const dest = r.name ?? "the pipeline";
    if (r.conversationStatus && !r.stage) {
      return `Marked ${who} as ${r.conversationStatus.toLowerCase().replace(/_/g, " ")} in ${dest}.`;
    }
    const stage = (r.stage ?? "the next stage").toLowerCase();
    return `Moved ${who} to ${stage} in ${dest}.`;
  }

  if (tool === "log_social_message") {
    const r = payload as {
      name?: string | null;
      channel?: string | null;
      direction?: string | null;
    };
    const who = r.name ?? query;
    const channel = (r.channel ?? "social").toLowerCase();
    const inbound = (r.direction ?? "").toUpperCase() === "INBOUND";
    return inbound
      ? `Logged an inbound ${channel} message from ${who}.`
      : `Logged a ${channel} message with ${who}.`;
  }

  if (tool === "extract_contact_details") {
    const r = payload as { url?: string; found?: number };
    const n = r.found ?? 0;
    return n > 0
      ? `Found ${n} public contact${n === 1 ? "" : "s"} on ${r.url ?? query}. Review before saving.`
      : `No public contacts on ${r.url ?? query}.`;
  }

  if (tool === "jev_triage") {
    const r = payload as { category?: string; action?: string; source?: string };
    return `Inbound classified as ${r.category ?? "other"} (${r.action ?? "wait"}).`;
  }

  if (tool === "jev_scan_malicious") {
    const r = payload as { allow?: boolean; reasons?: string[] };
    if (r.allow === false) {
      const why = (r.reasons ?? []).join(", ") || "flagged";
      return `Jev blocked this artifact (${why}).`;
    }
    return "Jev allowed this artifact.";
  }

  if (tool === "jev_grade_page") {
    const r = payload as { score?: number; grade?: string };
    if (r.score == null) return "Jev could not grade that page.";
    return `Page score ${r.score}${r.grade ? ` (${r.grade})` : ""}.`;
  }

  if (tool === "jev_verify_citations") {
    const err = payload as { error?: string };
    if (err && typeof err === "object" && !Array.isArray(err) && err.error) {
      return err.error;
    }
    const rows = Array.isArray(payload)
      ? (payload as Array<{ keep?: boolean; relation?: string }>)
      : [];
    if (rows.length === 0) return "Jev could not verify those citations.";
    const kept = rows.filter((r) => r.keep).length;
    return `Checked ${rows.length} citation${rows.length === 1 ? "" : "s"}: ${kept} kept, ${rows.length - kept} dropped.`;
  }

  if (tool === "score_fit") {
    const r = payload as { name?: string | null; score?: number; error?: string };
    if (r.score == null) return r.error ?? "Jev could not score that fit.";
    const who = r.name ?? query;
    return `${who} scores ${r.score}/100 as a fit.`;
  }

  if (tool === "save_email_context") {
    const r = payload as { name?: string | null; subject?: string | null };
    const who = r.name ?? query;
    const subject = (r.subject ?? "").trim();
    return `Saved email on ${who}${subject ? `: ${subject}` : "."}`;
  }

  if (tool === "get_swarm_run") {
    const r = payload as {
      goal?: string | null;
      found?: number;
      added?: number;
      skipped?: number;
    };
    return `Swarm "${r.goal ?? (query || "latest")}": ${r.found ?? 0} found, ${r.added ?? 0} added, ${r.skipped ?? 0} already in CRM.`;
  }

  if (tool === "log_call") {
    const r = payload as { name?: string | null };
    return `Logged a call with ${r.name ?? query}.`;
  }

  if (tool === "list_emails") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return `No emails on file for "${query}".`;
    const latest = rows[0] as { subject?: string | null; direction?: string | null };
    const subj = latest.subject?.trim() ? `"${latest.subject.trim().slice(0, 80)}"` : "no subject";
    return `${rows.length} email${rows.length === 1 ? "" : "s"} with ${query}. Latest (${latest.direction ?? "unknown"}): ${subj}.`;
  }

  if (tool === "list_activities") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return `No activity on file for "${query}".`;
    const latest = rows[0] as { kind?: string | null; body?: string | null };
    const snippet = (latest.body ?? "").trim().slice(0, 120);
    return `${rows.length} activit${rows.length === 1 ? "y" : "ies"} for ${query}${snippet ? `: ${snippet}` : "."}`;
  }

  if (tool === "list_contact_calls") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return `No calls on file for "${query}".`;
    return `${rows.length} call${rows.length === 1 ? "" : "s"} on file for ${query}.`;
  }

  if (tool === "list_social_messages") {
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) return `No social messages on file for "${query}".`;
    const latest = rows[0] as { channel?: string | null; body?: string | null };
    const ch = latest.channel ? ` on ${latest.channel}` : "";
    const snippet = (latest.body ?? "").trim().slice(0, 80);
    return `${rows.length} social message${rows.length === 1 ? "" : "s"} with ${query}${ch}${snippet ? `: ${snippet}` : "."}`;
  }

  if (tool === "create_segment") {
    const r = payload as { name?: string };
    return `Created segment ${r.name ?? query}.`;
  }

  if (tool === "create_pipeline") {
    const r = payload as { name?: string };
    return `Created pipeline ${r.name ?? query}.`;
  }

  if (tool === "pause_autopilot") {
    const r = payload as { name?: string; status?: string };
    return `Paused ${r.name ?? "the autopilot plan"}${r.status ? ` (${r.status})` : ""}.`;
  }

  if (tool === "enrich_contact") {
    const r = payload as { message?: string; value?: string; contact?: { name?: string | null } };
    if (r.message) return r.message;
    const who = r.contact?.name ?? query;
    return `Enriched ${who}${r.value ? ` (${r.value})` : ""}.`;
  }

  if (tool === "get_segment") {
    const r = payload as {
      name?: string;
      _count?: { members?: number };
      members?: Array<{ contact?: { name?: string | null } }>;
    };
    const n = r._count?.members ?? r.members?.length ?? 0;
    const people = (r.members ?? [])
      .slice(0, 6)
      .map((m) => m.contact?.name)
      .filter(Boolean);
    const extra = people.length ? `: ${people.join(", ")}` : "";
    return `Segment ${r.name ?? query} has ${n} member${n === 1 ? "" : "s"}${extra}.`;
  }

  if (tool === "get_pipeline") {
    const r = payload as { name?: string; _count?: { entries?: number } };
    const n = r._count?.entries ?? 0;
    return `Pipeline ${r.name ?? query} has ${n} entr${n === 1 ? "y" : "ies"}.`;
  }

  if (tool === "get_entity") {
    const r = payload as {
      name?: string;
      domain?: string | null;
      industry?: string | null;
      location?: string | null;
      _count?: { contacts?: number };
      contacts?: unknown[];
    };
    const extra = [r.domain, r.industry, r.location].filter(Boolean).join(", ");
    const n = r._count?.contacts ?? r.contacts?.length;
    return `${r.name ?? query}${extra ? ` (${extra})` : ""}${n != null ? `. ${n} contact${n === 1 ? "" : "s"}.` : "."}`;
  }

  if (tool === "get_contact") {
    const r = payload as {
      name?: string | null;
      email?: string | null;
      title?: string | null;
      company?: string | null;
    };
    const who = r.name ?? query;
    const at = r.company ? ` at ${r.company}` : "";
    const extra = [r.title, r.email].filter(Boolean).join(", ");
    return `${who}${at}${extra ? ` (${extra})` : ""}.`;
  }

  if (tool === "update_contact") {
    const r = payload as {
      name?: string | null;
      status?: string | null;
      dealScore?: number | null;
      title?: string | null;
      email?: string | null;
      phone?: string | null;
      company?: string | null;
      linkedin?: string | null;
      twitter?: string | null;
      facebook?: string | null;
      instagram?: string | null;
      website?: string | null;
      location?: string | null;
      notes?: string | null;
      source?: string | null;
      tags?: string[] | null;
    };
    const who = r.name ?? query;
    if (r.source && !r.status) return `Set ${who}'s source to ${r.source}.`;
    if (r.tags && r.tags.length > 0 && !r.status) return `Tagged ${who} as ${r.tags.join(", ")}.`;
    if (r.title && !r.status) return `Set ${who}'s title to ${r.title}.`;
    if (r.email && !r.status) return `Set ${who}'s email to ${r.email}.`;
    if (r.phone && !r.status) return `Set ${who}'s phone to ${r.phone}.`;
    if (r.company && !r.status) return `Set ${who}'s company to ${r.company}.`;
    if (r.linkedin && !r.status) return `Set ${who}'s LinkedIn to ${r.linkedin}.`;
    if (r.twitter && !r.status) return `Set ${who}'s X to ${r.twitter}.`;
    if (r.facebook && !r.status) return `Set ${who}'s Facebook to ${r.facebook}.`;
    if (r.instagram && !r.status) return `Set ${who}'s Instagram to ${r.instagram}.`;
    if (r.website && !r.status) return `Set ${who}'s website to ${r.website}.`;
    if (r.location && !r.status) return `Set ${who}'s location to ${r.location}.`;
    if (r.notes && !r.status) return `Set ${who}'s notes.`;
    if (r.dealScore != null && !r.status) {
      return `Set ${who}'s deal score to ${r.dealScore}.`;
    }
    const status = (r.status ?? "updated").toLowerCase();
    return `Marked ${who} as ${status}.`;
  }

  if (tool === "update_entity") {
    const r = payload as {
      name?: string | null;
      industry?: string | null;
      location?: string | null;
      domain?: string | null;
      website?: string | null;
      notes?: string | null;
      description?: string | null;
      phone?: string | null;
      size?: string | null;
      status?: string | null;
      tags?: string[] | null;
    };
    const who = r.name ?? query;
    if (r.tags && r.tags.length > 0 && !r.industry && !r.location && !r.domain && !r.website && !r.description && !r.phone && !r.size && !r.notes && !r.status) {
      return `Tagged ${who} as ${r.tags.join(", ")}.`;
    }
    if (r.status && !r.industry && !r.location && !r.domain && !r.website && !r.description && !r.phone && !r.size && !r.notes) {
      return `Marked ${who} as ${r.status.toLowerCase()}.`;
    }
    if (r.size && !r.industry && !r.location && !r.domain && !r.website && !r.description && !r.phone && !r.notes) {
      return `Set ${who}'s size to ${r.size}.`;
    }
    if (r.notes && !r.industry && !r.location && !r.domain && !r.website && !r.description && !r.phone && !r.size) {
      return `Set ${who}'s notes.`;
    }
    if (r.description && !r.industry && !r.location && !r.domain && !r.website && !r.phone && !r.size) {
      return `Set ${who}'s description.`;
    }
    if (r.phone && !r.industry && !r.location && !r.domain && !r.website && !r.size) {
      return `Set ${who}'s phone to ${r.phone}.`;
    }
    if (r.location && !r.industry && !r.domain && !r.website) return `Set ${who}'s location to ${r.location}.`;
    if (r.domain && !r.industry && !r.location && !r.website) return `Set ${who}'s domain to ${r.domain}.`;
    if (r.website && !r.industry && !r.location && !r.domain) return `Set ${who}'s website to ${r.website}.`;
    const industry = r.industry ?? "the new industry";
    return `Set ${who}'s industry to ${industry}.`;
  }

  if (tool === "add_to_pipeline" || tool === "add_to_segment") {
    const r = payload as { name?: string | null; who?: string | null; added?: number };
    const who = r.who ?? query;
    const dest = r.name ?? (tool === "add_to_segment" ? "the segment" : "the pipeline");
    if (r.added === 0) return `${who} is already in ${dest}.`;
    return `Added ${who} to ${dest}.`;
  }

  if (tool === "remove_pipeline_entry" || tool === "remove_segment_member") {
    const r = payload as { name?: string | null; who?: string | null };
    const who = r.who ?? query;
    const dest = r.name ?? (tool === "remove_segment_member" ? "the segment" : "the pipeline");
    return `Removed ${who} from ${dest}.`;
  }

  if (tool === "log_outreach") {
    const r = payload as { name?: string | null; channel?: string | null; status?: string | null };
    const who = r.name ?? query;
    const channel = (r.channel ?? "outreach").toLowerCase();
    return `Logged ${channel} outreach to ${who}.`;
  }

  if (tool === "pipeline_metrics") {
    const r = payload as {
      name?: string;
      total?: number;
      won?: number;
      lost?: number;
      avgDealScore?: number | null;
    };
    return `${r.name ?? query}: ${r.total ?? 0} in pipeline, ${r.won ?? 0} won, ${r.lost ?? 0} lost${r.avgDealScore != null ? `, avg score ${r.avgDealScore}` : ""}.`;
  }

  if (tool === "remember") {
    const r = payload as { remembered?: boolean; reason?: string };
    if (r.remembered === false) return r.reason ?? "I could not store that memory.";
    return `I will remember that ${query}.`;
  }

  if (tool === "get_provenance") {
    const r = payload as Record<string, { source?: string; confidence?: number }>;
    const keys = Object.keys(r ?? {}).filter((k) => k !== "error");
    if (keys.length === 0) return `No provenance on file for "${query}".`;
    const bits = keys.slice(0, 6).map((k) => {
      const row = r[k];
      return `${k} via ${row?.source ?? "unknown"}`;
    });
    return `Provenance for ${query}: ${bits.join(", ")}.`;
  }

  if (tool === "build_smart_segment") {
    const r = payload as { segment?: { name?: string }; matched?: number };
    return `Built segment ${r.segment?.name ?? query}${r.matched != null ? ` with ${r.matched} matches` : ""}.`;
  }

  if (tool === "verify_entity") {
    const r = payload as {
      name?: string;
      verified?: { gleif?: boolean; companiesHouse?: boolean; secEdgar?: boolean };
    };
    const sources = [
      r.verified?.gleif ? "GLEIF" : null,
      r.verified?.companiesHouse ? "Companies House" : null,
      r.verified?.secEdgar ? "SEC EDGAR" : null,
    ].filter(Boolean);
    if (sources.length === 0) return `No verified legal record for ${r.name ?? query}.`;
    return `Verified ${r.name ?? query} via ${sources.join(", ")}.`;
  }

  if (tool === "detect_tech") {
    const r = payload as { name?: string; tech?: Array<{ name?: string }> };
    const names = (r.tech ?? []).map((t) => t.name).filter(Boolean);
    if (names.length === 0) return `No tech stack detected for ${r.name ?? query}.`;
    const extra = names.length > 8 ? `, and ${names.length - 8} more` : "";
    return `${r.name ?? query} uses ${names.slice(0, 8).join(", ")}${extra}.`;
  }

  if (tool === "find_socials") {
    const r = payload as {
      saved?: Record<string, unknown> | number;
      candidates?: unknown[];
      message?: string;
    };
    if (r.message && (!r.saved || (typeof r.saved === "object" && Object.keys(r.saved).length === 0))) {
      return r.message;
    }
    const saved =
      typeof r.saved === "number" ? r.saved : r.saved ? Object.keys(r.saved).length : 0;
    const extra =
      Array.isArray(r.candidates) && r.candidates.length > 0
        ? ` ${r.candidates.length} candidate${r.candidates.length === 1 ? "" : "s"} need review.`
        : "";
    return `Found socials for ${query}${saved ? ` and saved ${saved}` : ""}.${extra}`;
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
  createEntity: (
    name: string,
    domain?: string,
    extra?: {
      website?: string;
      industry?: string;
      location?: string;
      phone?: string;
      size?: string;
      tags?: string[];
      description?: string;
      notes?: string;
    },
  ) => Promise<unknown>;
  createContact: (input: {
    name?: string;
    email?: string;
    company?: string;
    title?: string;
    phone?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
    website?: string;
    location?: string;
    source?: string;
    tags?: string[];
    notes?: string;
  }) => Promise<unknown>;
  enrichEntity: (id: string) => Promise<unknown>;
  updateEntity?: (
    id: string,
    patch: {
      industry?: string;
      location?: string;
      domain?: string;
      website?: string;
      notes?: string;
      description?: string;
      phone?: string;
      size?: string;
      status?: "NEW" | "ENRICHED" | "ARCHIVED";
      tags?: string[];
    },
  ) => Promise<unknown>;
  listEntities?: (q?: string) => Promise<unknown>;
  listContacts?: (q?: string) => Promise<unknown>;
  countEntities?: (status?: "NEW" | "ENRICHED" | "ARCHIVED") => Promise<unknown>;
  countContacts?: (
    status?: "NEW" | "ENRICHED" | "CONTACTED" | "REPLIED" | "QUALIFIED" | "WON" | "LOST" | "ARCHIVED",
  ) => Promise<unknown>;
  countDueFollowups?: (staleDays?: number) => Promise<unknown>;
  countSegments?: () => Promise<unknown>;
  countPipelines?: () => Promise<unknown>;
  countPendingDrafts?: () => Promise<unknown>;
  listDueFollowups?: () => Promise<unknown>;
  getBilling?: () => Promise<unknown>;
  getUsage?: () => Promise<unknown>;
  triageInbound?: (text: string) => Promise<unknown>;
  scanMalicious?: (artifact: string, kind?: string) => Promise<unknown>;
  gradePage?: (page: string) => Promise<unknown>;
  scoreCrmFit?: (found: unknown, query: string) => Promise<unknown>;
  verifyCitations?: (
    claims: Array<{ claim: string; quote: string; url?: string }>,
  ) => Promise<unknown>;
  listVariantStats?: () => Promise<unknown>;
  selectVariant?: (kind: "SUBJECT" | "OPENER") => Promise<unknown>;
  createVariant?: (kind: "SUBJECT" | "OPENER", text: string) => Promise<unknown>;
  draftBreakups?: (input?: { staleDays?: number }) => Promise<unknown>;
  proposeAutopilot?: (input: {
    name: string;
    totalCredits: number;
    cadence?: "hourly" | "daily" | "weekly";
    discoveryQuery?: string;
  }) => Promise<unknown>;
  listSegments?: () => Promise<unknown>;
  listPipelines?: () => Promise<unknown>;
  listSwarmRuns?: () => Promise<unknown>;
  listRecentDiscoveries?: () => Promise<unknown>;
  addActivity?: (input: { contactId?: string; entityId?: string; body: string }) => Promise<unknown>;
  updateSegment?: (id: string, patch: { name?: string }) => Promise<unknown>;
  updatePipeline?: (id: string, patch: { name?: string }) => Promise<unknown>;
  syncCall?: (logId: string) => Promise<unknown>;
  logCall?: (input: {
    contactId: string;
    summary?: string;
    durationSec?: number;
  }) => Promise<unknown>;
  updatePipelineEntry?: (
    pipelineId: string,
    entryId: string,
    patch: {
      stage?: InstantRoute["stage"];
      conversationStatus?: InstantRoute["conversationStatus"];
    },
  ) => Promise<unknown>;
  saveSocialMessage?: (input: {
    contactId: string;
    channel: NonNullable<InstantRoute["channel"]>;
    body: string;
    direction?: NonNullable<InstantRoute["direction"]>;
  }) => Promise<unknown>;
  extractSiteContacts?: (url: string) => Promise<unknown>;
  findPipelineEntry?: (
    pipelineId: string,
    contactId: string,
  ) => Promise<{ id: string } | null>;
  saveEmail?: (input: { contactId: string; subject?: string; body?: string }) => Promise<unknown>;
  getSwarmRun?: (id: string) => Promise<unknown>;
  listEmails?: (contactId: string) => Promise<unknown>;
  listActivities?: (input: { contactId?: string; entityId?: string }) => Promise<unknown>;
  listContactCalls?: (contactId: string) => Promise<unknown>;
  listSocialMessages?: (contactId: string) => Promise<unknown>;
  createSegment?: (name: string) => Promise<unknown>;
  createPipeline?: (name: string) => Promise<unknown>;
  pauseAutopilot?: (prefetch?: unknown) => Promise<unknown>;
  enrichContact?: (contactId: string, field: "linkedin" | "email" | "phone") => Promise<unknown>;
  findSocials?: (contactId: string) => Promise<unknown>;
  getSegment?: (id: string) => Promise<unknown>;
  getPipeline?: (id: string) => Promise<unknown>;
  getEntity?: (id: string) => Promise<unknown>;
  getContact?: (id: string) => Promise<unknown>;
  updateContact?: (
    id: string,
    patch: {
      status?: string;
      dealScore?: number;
      title?: string;
      email?: string;
      phone?: string;
      company?: string;
      linkedin?: string;
      twitter?: string;
      facebook?: string;
      instagram?: string;
      website?: string;
      location?: string;
      notes?: string;
      source?: string;
      tags?: string[];
    },
  ) => Promise<unknown>;
  addToPipeline?: (pipelineId: string, contactIds: string[]) => Promise<unknown>;
  addToSegment?: (segmentId: string, contactIds: string[]) => Promise<unknown>;
  removePipelineEntry?: (pipelineId: string, entryId: string) => Promise<unknown>;
  removeSegmentMember?: (segmentId: string, contactId: string) => Promise<unknown>;
  logOutreach?: (
    contactId: string,
    summary: string,
    channel?: "email" | "linkedin" | "phone" | "x" | "instagram" | "facebook" | "other",
  ) => Promise<unknown>;
  pipelineMetrics?: (id: string) => Promise<unknown>;
  remember?: (content: string) => Promise<unknown>;
  getProvenance?: (recordType: "contact" | "entity", recordId: string) => Promise<unknown>;
  buildSmartSegment?: (goal: string, name?: string) => Promise<unknown>;
  verifyEntity?: (id: string) => Promise<unknown>;
  detectTech?: (id: string) => Promise<unknown>;
  scoreFit?: (rows: Array<{ id: string; text: string }>) => Promise<Array<{ id: string; score: number }>>;
};

function matchNamed(
  rows: unknown,
  name?: string,
): { id: string; name?: string } | undefined {
  const list = Array.isArray(rows) ? rows : [];
  const needle = name?.trim().toLowerCase() ?? "";
  const typed = list.filter(
    (r): r is { id: string; name?: string } =>
      !!r && typeof r === "object" && "id" in r && typeof (r as { id?: unknown }).id === "string",
  );
  if (!needle) return typed.length === 1 ? typed[0] : undefined;
  return typed.find((r) => (r.name ?? "").trim().toLowerCase() === needle)
    ?? typed.find((r) => (r.name ?? "").toLowerCase().includes(needle));
}

function matchSwarm(
  rows: unknown,
  goal?: string,
): { id: string; goal?: string } | undefined {
  const list = Array.isArray(rows) ? rows : [];
  const typed = list.filter(
    (r): r is { id: string; goal?: string } =>
      !!r && typeof r === "object" && "id" in r && typeof (r as { id?: unknown }).id === "string",
  );
  const needle = goal?.trim().toLowerCase() ?? "";
  if (!needle) return typed[0];
  return (
    typed.find((r) => (r.goal ?? "").trim().toLowerCase() === needle) ??
    typed.find((r) => (r.goal ?? "").toLowerCase().includes(needle))
  );
}

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
        tool === "get_billing" ||
        tool === "get_balance" ||
        tool === "get_usage" ||
        tool === "get_autopilot_status" ||
        tool === "list_variant_stats" ||
        tool === "list_segments" ||
        tool === "list_pipelines" ||
        tool === "list_swarm_runs" ||
        tool === "list_pending_drafts") &&
      input.prefetch != null;
    payload = lookupHit
      ? input.prefetch
      : await runTool(tool, query, local, input.runners, input.message, input.instant, input.prefetch);
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
  prefetch?: unknown,
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
        {
          name: instant?.name ?? query,
          domain: instant?.domain ?? null,
          ...(instant?.website ? { website: instant.website } : {}),
          ...(instant?.industry ? { industry: instant.industry } : {}),
          ...(instant?.location ? { location: instant.location } : {}),
          ...(instant?.phone ? { phone: instant.phone } : {}),
          ...(instant?.size ? { size: instant.size } : {}),
          ...(instant?.tags?.length ? { tags: instant.tags } : {}),
          ...(instant?.description ? { description: instant.description } : {}),
          ...(instant?.note ? { notes: instant.note } : {}),
        },
        () =>
          runners.createEntity(instant?.name ?? query, instant?.domain, {
            ...(instant?.website ? { website: instant.website } : {}),
            ...(instant?.industry ? { industry: instant.industry } : {}),
            ...(instant?.location ? { location: instant.location } : {}),
            ...(instant?.phone ? { phone: instant.phone } : {}),
            ...(instant?.size ? { size: instant.size } : {}),
            ...(instant?.tags?.length ? { tags: instant.tags } : {}),
            ...(instant?.description ? { description: instant.description } : {}),
            ...(instant?.note ? { notes: instant.note } : {}),
          }),
      );
    case "create_contact":
      return write(
        "create_contact",
        {
          name: instant?.name ?? null,
          email: instant?.email ?? null,
          company: instant?.company ?? null,
          ...(instant?.title ? { title: instant.title } : {}),
          ...(instant?.phone ? { phone: instant.phone } : {}),
          ...(instant?.linkedin ? { linkedin: instant.linkedin } : {}),
          ...(instant?.facebook ? { facebook: instant.facebook } : {}),
          ...(instant?.instagram ? { instagram: instant.instagram } : {}),
          ...(instant?.twitter ? { twitter: instant.twitter } : {}),
          ...(instant?.website ? { website: instant.website } : {}),
          ...(instant?.location ? { location: instant.location } : {}),
          ...(instant?.crmSource ? { source: instant.crmSource } : {}),
          ...(instant?.tags?.length ? { tags: instant.tags } : {}),
          ...(instant?.note ? { notes: instant.note } : {}),
        },
        () =>
          runners.createContact({
            name: instant?.name,
            email: instant?.email,
            company: instant?.company,
            title: instant?.title,
            phone: instant?.phone,
            linkedin: instant?.linkedin,
            facebook: instant?.facebook,
            instagram: instant?.instagram,
            twitter: instant?.twitter,
            website: instant?.website,
            location: instant?.location,
            source: instant?.crmSource,
            tags: instant?.tags,
            notes: instant?.note,
          }),
      );
    case "enrich_entity": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const first = facts.find((f) => f.kind === "entity" && f.id);
      if (!first?.id) {
        return { error: `I did not find "${query}" in the CRM to enrich. Say the word if you want me to discover it.` };
      }
      return write("enrich_entity", { id: first.id }, () => runners.enrichEntity(first.id!));
    }
    case "update_entity": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const first = facts.find((f) => f.kind === "entity" && f.id);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      const industry = instant?.industry?.trim();
      const location = instant?.location?.trim();
      const domain = instant?.domain?.trim();
      const website = instant?.website?.trim();
      const notes = instant?.note?.trim();
      const description = instant?.description?.trim();
      const phone = instant?.phone?.trim();
      const size = instant?.size?.trim();
      const status = instant?.entityStatus;
      const tags = instant?.tags;
      if (!industry && !location && !domain && !website && !notes && !description && !phone && !size && !status && !(tags && tags.length > 0)) {
        return { error: "Say the field, like set Acme industry to SaaS." };
      }
      const collisionOnly = Boolean(
        (website || location) &&
          !industry &&
          !domain &&
          !notes &&
          !description &&
          !phone &&
          !size &&
          !status &&
          !(tags && tags.length > 0),
      );
      if (collisionOnly && first?.id && contact?.id) {
        return { error: `Say contact ${query} or company ${query} so I don't guess.` };
      }
      if (collisionOnly && !first?.id && contact?.id) {
        const patch = {
          ...(website ? { website } : {}),
          ...(location ? { location } : {}),
        };
        return write("update_contact", { id: contact.id, ...patch }, async () => {
          const result = runners.updateContact
            ? await runners.updateContact(contact.id!, patch)
            : { error: "Contact update is unavailable." };
          if (result && typeof result === "object" && !("error" in result)) {
            return { ...(result as object), name: contact.name ?? query, ...patch };
          }
          return result;
        });
      }
      if (!first?.id) {
        return { error: `I did not find a company named "${query}" in the CRM.` };
      }
      const entityId = first.id;
      const patch = {
        ...(industry ? { industry } : {}),
        ...(location ? { location } : {}),
        ...(domain ? { domain } : {}),
        ...(website ? { website } : {}),
        ...(notes ? { notes } : {}),
        ...(description ? { description } : {}),
        ...(phone ? { phone } : {}),
        ...(size ? { size } : {}),
        ...(status ? { status } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
      };
      return write("update_entity", { id: entityId, ...patch }, async () => {
        const result = runners.updateEntity
          ? await runners.updateEntity(entityId, patch)
          : { error: "Company update is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), name: first.name ?? query, ...patch };
        }
        return result;
      });
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
    case "get_balance":
      return runners.getBilling ? runners.getBilling() : { creditsRemaining: 0, plan: "unknown" };
    case "get_usage":
      return runners.getUsage
        ? runners.getUsage()
        : { creditsRemaining: 0, plan: "unknown", actionCosts: {} };
    case "jev_triage": {
      const text = instant?.note?.trim() || query;
      if (!text) return { error: "Say the inbound after a colon, like triage this: thanks for the intro." };
      return runners.triageInbound
        ? runners.triageInbound(text)
        : { category: "other", action: "wait", source: "fallback" };
    }
    case "jev_scan_malicious": {
      const text = instant?.note?.trim() || query;
      if (!text) return { error: "Say the artifact after a colon, like scan this artifact: ..." };
      return runners.scanMalicious
        ? runners.scanMalicious(text, "artifact")
        : { allow: true, reasons: [], source: "fallback" };
    }
    case "jev_grade_page": {
      const text = instant?.note?.trim() || query;
      if (!text) return { error: "Say the page after a colon, like grade this page: ..." };
      return runners.gradePage ? runners.gradePage(text) : { error: "Jev could not grade that page." };
    }
    case "jev_verify_citations": {
      const claims = instant?.claims ?? [];
      if (claims.length === 0) {
        return {
          error:
            "Say claim: and quote: after a colon, like verify citations: claim: Acme raised Series B quote: Acme announced Series B.",
        };
      }
      return runners.verifyCitations
        ? runners.verifyCitations(claims)
        : { error: "Jev could not verify those citations." };
    }
    case "score_fit": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      if (!runners.scoreCrmFit) return { error: "Add your Product Context first. Fit is scored against it." };
      return runners.scoreCrmFit(found, query);
    }
    case "list_variant_stats":
      return runners.listVariantStats ? runners.listVariantStats() : [];
    case "select_variant": {
      const kind = query === "OPENER" ? "OPENER" : "SUBJECT";
      return runners.selectVariant
        ? runners.selectVariant(kind)
        : { error: "No active variants in that pool. Create one first." };
    }
    case "create_variant": {
      const kind = query === "OPENER" ? "OPENER" : "SUBJECT";
      const text = instant?.note?.trim();
      if (!text) return { error: "Say the variant after a colon, like add a subject variant: following up." };
      return write("create_variant", { kind, text }, async () => {
        const result = runners.createVariant
          ? await runners.createVariant(kind, text)
          : { error: "Variant create is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), kind, text };
        }
        return result;
      });
    }
    case "draft_breakups": {
      const staleDays = instant?.staleDays;
      return write("draft_breakups", staleDays != null ? { staleDays } : {}, async () => {
        return runners.draftBreakups
          ? runners.draftBreakups(staleDays != null ? { staleDays } : undefined)
          : { error: "Breakup drafts are unavailable." };
      });
    }
    case "propose_autopilot_plan": {
      const totalCredits = instant?.totalCredits;
      if (totalCredits == null) {
        return { error: "Say how many credits, like propose a 50 credit daily autopilot." };
      }
      const name = instant?.name?.trim() || `Weekly ${totalCredits} credit autopilot`;
      const cadence = instant?.cadence;
      const discoveryQuery = instant?.note?.trim() || undefined;
      const allocations: Record<string, number> = discoveryQuery
        ? { discovery: totalCredits }
        : { other: totalCredits };
      return write(
        "propose_autopilot_plan",
        { name, totalCredits, ...(cadence ? { cadence } : {}), allocations, ...(discoveryQuery ? { discoveryQuery } : {}) },
        async () => {
          const result = runners.proposeAutopilot
            ? await runners.proposeAutopilot({ name, totalCredits, cadence, discoveryQuery })
            : { error: "Autopilot propose is unavailable." };
          if (result && typeof result === "object" && !("error" in result)) {
            return { ...(result as object), name, totalCredits, cadence };
          }
          return result;
        },
      );
    }
    case "count_entities": {
      if (!runners.countEntities) return { error: "Company count is unavailable." };
      const status = instant?.entityStatus;
      const count = await runners.countEntities(status);
      if (typeof count === "number") return { count, kind: "company", ...(status ? { status } : {}) };
      return count;
    }
    case "count_contacts": {
      if (!runners.countContacts) return { error: "Contact count is unavailable." };
      const status = instant?.status;
      const count = await runners.countContacts(status);
      if (typeof count === "number") return { count, kind: "contact", ...(status ? { status } : {}) };
      return count;
    }
    case "count_due_followups": {
      if (!runners.countDueFollowups) return { error: "Follow-up count is unavailable." };
      const staleDays = instant?.staleDays;
      const count = await runners.countDueFollowups(staleDays);
      if (typeof count === "number") return { count, ...(staleDays != null ? { staleDays } : {}) };
      return count;
    }
    case "count_segments": {
      if (!runners.countSegments) return { error: "Segment count is unavailable." };
      const count = await runners.countSegments();
      return typeof count === "number" ? { count } : count;
    }
    case "count_pipelines": {
      if (!runners.countPipelines) return { error: "Pipeline count is unavailable." };
      const count = await runners.countPipelines();
      return typeof count === "number" ? { count } : count;
    }
    case "count_pending_drafts": {
      if (!runners.countPendingDrafts) return { error: "Draft count is unavailable." };
      const count = await runners.countPendingDrafts();
      return typeof count === "number" ? { count } : count;
    }
    case "list_entities":
      return runners.listEntities ? runners.listEntities(query || undefined) : runners.searchCrm(query);
    case "list_contacts":
      return runners.listContacts ? runners.listContacts(query || undefined) : runners.searchCrm(query);
    case "list_segments":
      return runners.listSegments ? runners.listSegments() : [];
    case "list_pipelines":
      return runners.listPipelines ? runners.listPipelines() : [];
    case "list_swarm_runs":
      return runners.listSwarmRuns ? runners.listSwarmRuns() : [];
    case "list_recent_discoveries":
      return runners.listRecentDiscoveries ? runners.listRecentDiscoveries() : [];
    case "list_emails":
    case "list_activities":
    case "list_contact_calls":
    case "list_social_messages": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      const entity = facts.find((f) => f.kind === "entity" && f.id);
      if (tool === "list_activities") {
        if (contact?.id) return runners.listActivities ? runners.listActivities({ contactId: contact.id }) : [];
        if (entity?.id) return runners.listActivities ? runners.listActivities({ entityId: entity.id }) : [];
        return { error: `I did not find "${query}" in the CRM.` };
      }
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      if (tool === "list_emails") {
        return runners.listEmails ? runners.listEmails(contact.id) : [];
      }
      if (tool === "list_social_messages") {
        return runners.listSocialMessages ? runners.listSocialMessages(contact.id) : [];
      }
      return runners.listContactCalls ? runners.listContactCalls(contact.id) : [];
    }
    case "create_segment":
      return write("create_segment", { name: instant?.name ?? query }, async () =>
        runners.createSegment
          ? runners.createSegment(instant?.name ?? query)
          : { error: "Segment create is unavailable." },
      );
    case "create_pipeline":
      return write("create_pipeline", { name: instant?.name ?? query }, async () =>
        runners.createPipeline
          ? runners.createPipeline(instant?.name ?? query)
          : { error: "Pipeline create is unavailable." },
      );
    case "get_entity": {
      const listed =
        prefetch && typeof prefetch === "object"
          ? prefetch
          : await (runners.listEntities ? runners.listEntities(query || undefined) : []);
      const rows = Array.isArray(listed)
        ? listed
        : ((listed as { entities?: unknown[] }).entities ?? []);
      const hit = matchNamed(rows, instant?.name ?? query);
      if (!hit?.id) {
        return { error: `I did not find a company named "${query}".` };
      }
      return runners.getEntity
        ? runners.getEntity(hit.id)
        : { error: "Company get is unavailable." };
    }
    case "get_contact": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      return runners.getContact
        ? runners.getContact(contact.id)
        : { error: "Contact get is unavailable." };
    }
    case "update_contact": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const contactId = contact.id;
      const status = instant?.status;
      const dealScore = instant?.dealScore;
      const title = instant?.title?.trim();
      const email = instant?.email?.trim();
      const phone = instant?.phone?.trim();
      const company = instant?.company?.trim();
      const linkedin = instant?.linkedin?.trim();
      const twitter = instant?.twitter?.trim();
      const facebook = instant?.facebook?.trim();
      const instagram = instant?.instagram?.trim();
      const notes = instant?.note?.trim();
      const website = instant?.website?.trim();
      const location = instant?.location?.trim();
      const crmSource = instant?.crmSource?.trim();
      const tags = instant?.tags;
      if (
        !status &&
        dealScore == null &&
        !title &&
        !email &&
        !phone &&
        !company &&
        !linkedin &&
        !twitter &&
        !facebook &&
        !instagram &&
        !notes &&
        !website &&
        !location &&
        !crmSource &&
        !(tags && tags.length > 0)
      ) {
        return { error: "Say which status to set (contacted, qualified, won, lost)." };
      }
      const args: Record<string, string | number | string[]> = { id: contactId };
      if (status) args.status = status;
      if (dealScore != null) args.dealScore = dealScore;
      if (title) args.title = title;
      if (email) args.email = email;
      if (phone) args.phone = phone;
      if (company) args.company = company;
      if (linkedin) args.linkedin = linkedin;
      if (twitter) args.twitter = twitter;
      if (facebook) args.facebook = facebook;
      if (instagram) args.instagram = instagram;
      if (notes) args.notes = notes;
      if (website) args.website = website;
      if (location) args.location = location;
      if (crmSource) args.source = crmSource;
      if (tags && tags.length > 0) args.tags = tags;
      const patch = {
        ...(status ? { status } : {}),
        ...(dealScore != null ? { dealScore } : {}),
        ...(title ? { title } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(company ? { company } : {}),
        ...(linkedin ? { linkedin } : {}),
        ...(twitter ? { twitter } : {}),
        ...(facebook ? { facebook } : {}),
        ...(instagram ? { instagram } : {}),
        ...(notes ? { notes } : {}),
        ...(website ? { website } : {}),
        ...(location ? { location } : {}),
        ...(crmSource ? { source: crmSource } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
      };
      return write("update_contact", args, async () => {
        const result = runners.updateContact
          ? await runners.updateContact(contactId, patch)
          : { error: "Contact update is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), name: contact.name ?? query, ...patch };
        }
        return result;
      });
    }
    case "add_to_pipeline":
    case "add_to_segment": {
      const packed =
        prefetch && typeof prefetch === "object" && prefetch !== null && "crm" in prefetch
          ? (prefetch as { crm: unknown; fields?: unknown })
          : null;
      const found = packed?.crm ?? (prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query));
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const listed =
        packed?.fields ??
        (tool === "add_to_segment"
          ? await (runners.listSegments ? runners.listSegments() : [])
          : await (runners.listPipelines ? runners.listPipelines() : []));
      const hit = matchNamed(listed, instant?.name ?? query);
      if (!hit?.id) {
        return {
          error:
            tool === "add_to_segment"
              ? `I did not find a segment named "${instant?.name ?? query}".`
              : `I did not find a pipeline named "${instant?.name ?? query}".`,
        };
      }
      const contactId = contact.id;
      const fieldId = hit.id;
      const who = contact.name ?? query;
      const dest = hit.name ?? instant?.name ?? query;
      if (tool === "add_to_segment") {
        return write("add_to_segment", { segmentId: fieldId, contactIds: [contactId] }, async () => {
          const result = runners.addToSegment
            ? await runners.addToSegment(fieldId, [contactId])
            : { error: "Segment add is unavailable." };
          if (result && typeof result === "object" && !("error" in result)) {
            return { ...(result as object), who, name: dest };
          }
          return result;
        });
      }
      return write("add_to_pipeline", { pipelineId: fieldId, contactIds: [contactId] }, async () => {
        const result = runners.addToPipeline
          ? await runners.addToPipeline(fieldId, [contactId])
          : { error: "Pipeline add is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), who, name: dest };
        }
        return result;
      });
    }
    case "remove_pipeline_entry":
    case "remove_segment_member": {
      const packed =
        prefetch && typeof prefetch === "object" && prefetch !== null && "crm" in prefetch
          ? (prefetch as { crm: unknown; fields?: unknown })
          : null;
      const found = packed?.crm ?? (prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query));
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const listed =
        packed?.fields ??
        (tool === "remove_segment_member"
          ? await (runners.listSegments ? runners.listSegments() : [])
          : await (runners.listPipelines ? runners.listPipelines() : []));
      const hit = matchNamed(listed, instant?.name ?? query);
      if (!hit?.id) {
        return {
          error:
            tool === "remove_segment_member"
              ? `I did not find a segment named "${instant?.name ?? query}".`
              : `I did not find a pipeline named "${instant?.name ?? query}".`,
        };
      }
      const contactId = contact.id;
      const fieldId = hit.id;
      const who = contact.name ?? query;
      const dest = hit.name ?? instant?.name ?? query;
      if (tool === "remove_segment_member") {
        return write("remove_segment_member", { segmentId: fieldId, contactId }, async () => {
          const result = runners.removeSegmentMember
            ? await runners.removeSegmentMember(fieldId, contactId)
            : { error: "Segment remove is unavailable." };
          if (result && typeof result === "object" && !("error" in result)) {
            return { ...(result as object), who, name: dest };
          }
          return result;
        });
      }
      const entry = runners.findPipelineEntry
        ? await runners.findPipelineEntry(fieldId, contactId)
        : null;
      if (!entry?.id) {
        return { error: `${who} is not in ${dest}.` };
      }
      const entryId = entry.id;
      return write("remove_pipeline_entry", { pipelineId: fieldId, entryId }, async () => {
        const result = runners.removePipelineEntry
          ? await runners.removePipelineEntry(fieldId, entryId)
          : { error: "Pipeline remove is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), who, name: dest };
        }
        return result;
      });
    }
    case "log_outreach": {
      const found =
        prefetch && typeof prefetch === "object" && prefetch !== null && !("crm" in prefetch)
          ? prefetch
          : prefetch && typeof prefetch === "object" && prefetch !== null && "crm" in prefetch
            ? (prefetch as { crm: unknown }).crm
            : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const contactId = contact.id;
      const channel = instant?.channel ?? "other";
      const summary = `Logged ${channel} outreach from chat.`;
      return write("log_outreach", { contactId, summary, channel }, async () => {
        const result = runners.logOutreach
          ? await runners.logOutreach(contactId, summary, channel)
          : { error: "Outreach log is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), name: contact.name ?? query, channel };
        }
        return result;
      });
    }
    case "add_activity": {
      const found =
        prefetch && typeof prefetch === "object" && prefetch !== null && !("crm" in prefetch)
          ? prefetch
          : prefetch && typeof prefetch === "object" && prefetch !== null && "crm" in prefetch
            ? (prefetch as { crm: unknown }).crm
            : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      const entity = facts.find((f) => f.kind === "entity" && f.id);
      const note = instant?.note?.trim();
      if (!note) return { error: "Say the note after a colon, like add a note on Jane: interested." };
      if (!contact?.id && !entity?.id) {
        return { error: `I did not find "${query}" in the CRM.` };
      }
      const contactId = contact?.id;
      const entityId = contactId ? undefined : entity?.id;
      const who = contact?.name ?? entity?.name ?? query;
      const run = async () => {
        const result = runners.addActivity
          ? await runners.addActivity({ contactId, entityId, body: note })
          : { error: "Notes are unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), name: who, body: note };
        }
        return result;
      };
      if (contactId) {
        return write("add_activity", { contactId, kind: "note", body: note }, run);
      }
      return write("add_activity", { entityId: entityId as string, kind: "note", body: note }, run);
    }
    case "update_segment":
    case "update_pipeline": {
      const listed =
        prefetch && typeof prefetch === "object"
          ? prefetch
          : tool === "update_segment"
            ? await (runners.listSegments ? runners.listSegments() : [])
            : await (runners.listPipelines ? runners.listPipelines() : []);
      const hit = matchNamed(listed, instant?.query ?? query);
      if (!hit?.id) {
        return {
          error:
            tool === "update_segment"
              ? `I did not find a segment named "${query}".`
              : `I did not find a pipeline named "${query}".`,
        };
      }
      const nextName = instant?.name?.trim();
      if (!nextName) return { error: "Say the new name, like rename the Outbound pipeline to Enterprise." };
      const fieldId = hit.id;
      if (tool === "update_segment") {
        return write("update_segment", { id: fieldId, name: nextName }, async () =>
          runners.updateSegment
            ? runners.updateSegment(fieldId, { name: nextName })
            : { error: "Segment rename is unavailable." },
        );
      }
      return write("update_pipeline", { id: fieldId, name: nextName }, async () =>
        runners.updatePipeline
          ? runners.updatePipeline(fieldId, { name: nextName })
          : { error: "Pipeline rename is unavailable." },
      );
    }
    case "sync_call": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const calls = runners.listContactCalls ? await runners.listContactCalls(contact.id) : [];
      const latest = Array.isArray(calls) ? (calls[0] as { id?: string; status?: string } | undefined) : undefined;
      if (!latest?.id) {
        return { error: `I do not have a logged call for ${contact.name ?? query} to sync.` };
      }
      const logId = latest.id;
      return write("sync_call", { logId }, async () => {
        const result = runners.syncCall
          ? await runners.syncCall(logId)
          : { error: "Call sync is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), name: contact.name ?? query };
        }
        return result;
      });
    }
    case "log_call": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const contactId = contact.id;
      const summary = instant?.note?.trim() || "Logged an outside call from chat.";
      const durationSec = instant?.durationSec;
      return write("log_call", { contactId, direction: "OUTBOUND", summary, durationSec: durationSec ?? null }, async () => {
        const result = runners.logCall
          ? await runners.logCall({ contactId, summary, durationSec })
          : { error: "Call log is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), name: contact.name ?? query };
        }
        return result;
      });
    }
    case "update_pipeline_entry": {
      const packed =
        prefetch && typeof prefetch === "object" && prefetch !== null && "crm" in prefetch
          ? (prefetch as { crm: unknown; fields?: unknown })
          : null;
      const found = packed?.crm ?? (prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query));
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const listed =
        packed?.fields ?? (await (runners.listPipelines ? runners.listPipelines() : []));
      const hit = matchNamed(listed, instant?.name ?? query);
      if (!hit?.id) {
        return { error: `I did not find a pipeline named "${instant?.name ?? query}".` };
      }
      const stage = instant?.stage;
      const conversationStatus = instant?.conversationStatus;
      if (!stage && !conversationStatus) {
        return { error: "Say the stage, like move Jane to Engaging in Outbound." };
      }
      const contactId = contact.id;
      const pipelineId = hit.id;
      const entry = runners.findPipelineEntry
        ? await runners.findPipelineEntry(pipelineId, contactId)
        : null;
      if (!entry?.id) {
        return { error: `${contact.name ?? query} is not in ${hit.name ?? instant?.name ?? "that pipeline"}.` };
      }
      const entryId = entry.id;
      const patch = {
        ...(stage ? { stage } : {}),
        ...(conversationStatus ? { conversationStatus } : {}),
      };
      const args: Record<string, string> = { pipelineId, entryId };
      if (stage) args.stage = stage;
      if (conversationStatus) args.conversationStatus = conversationStatus;
      return write("update_pipeline_entry", args, async () => {
        const result = runners.updatePipelineEntry
          ? await runners.updatePipelineEntry(pipelineId, entryId, patch)
          : { error: "Pipeline stage update is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return {
            ...(result as object),
            who: contact.name ?? query,
            name: hit.name ?? instant?.name,
            ...(stage ? { stage } : {}),
            ...(conversationStatus ? { conversationStatus } : {}),
          };
        }
        return result;
      });
    }
    case "log_social_message": {
      const found =
        prefetch && typeof prefetch === "object" && prefetch !== null && !("crm" in prefetch)
          ? prefetch
          : prefetch && typeof prefetch === "object" && prefetch !== null && "crm" in prefetch
            ? (prefetch as { crm: unknown }).crm
            : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const body = instant?.note?.trim();
      if (!body) {
        return { error: "Say the message after a colon, like log a linkedin message to Jane: thanks." };
      }
      const contactId = contact.id;
      const channel = instant?.channel ?? "other";
      const direction = instant?.direction ?? "OUTBOUND";
      return write(
        "log_social_message",
        { contactId, channel, direction, body },
        async () => {
          const result = runners.saveSocialMessage
            ? await runners.saveSocialMessage({ contactId, channel, body, direction })
            : { error: "Social log is unavailable." };
          if (result && typeof result === "object" && !("error" in result)) {
            return { ...(result as object), name: contact.name ?? query, channel, direction };
          }
          return result;
        },
      );
    }
    case "extract_contact_details": {
      const url = query.trim();
      if (!url) return { error: "Say the site, like extract contacts from acme.com." };
      return write("extract_contact_details", { url }, async () =>
        runners.extractSiteContacts
          ? runners.extractSiteContacts(url)
          : { error: "Contact extract is unavailable." },
      );
    }
    case "save_email_context": {
      const found =
        prefetch && typeof prefetch === "object" && prefetch !== null && !("crm" in prefetch)
          ? prefetch
          : prefetch && typeof prefetch === "object" && prefetch !== null && "crm" in prefetch
            ? (prefetch as { crm: unknown }).crm
            : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const body = instant?.note?.trim();
      if (!body) return { error: "Say the email after a colon, like save this email on Jane: following up." };
      const contactId = contact.id;
      const subject = instant?.subject?.trim();
      const run = async () => {
        const result = runners.saveEmail
          ? await runners.saveEmail({ contactId, subject, body })
          : { error: "Email save is unavailable." };
        if (result && typeof result === "object" && !("error" in result)) {
          return { ...(result as object), name: contact.name ?? query, subject };
        }
        return result;
      };
      if (subject) {
        return write(
          "save_email_context",
          { contactId, direction: "OUTBOUND", savedAsContext: true, subject, body },
          run,
        );
      }
      return write(
        "save_email_context",
        { contactId, direction: "OUTBOUND", savedAsContext: true, body },
        run,
      );
    }
    case "get_swarm_run": {
      const listed =
        prefetch && typeof prefetch === "object"
          ? prefetch
          : await (runners.listSwarmRuns ? runners.listSwarmRuns() : []);
      const hit = matchSwarm(listed, instant?.name ?? query);
      if (!hit?.id) {
        return { error: query ? `I did not find a swarm run for "${query}".` : "There are no swarm runs yet." };
      }
      return runners.getSwarmRun
        ? runners.getSwarmRun(hit.id)
        : { error: "Swarm run get is unavailable." };
    }
    case "get_segment":
    case "get_pipeline":
    case "pipeline_metrics": {
      const listed =
        prefetch && typeof prefetch === "object"
          ? prefetch
          : tool === "get_segment"
            ? await (runners.listSegments ? runners.listSegments() : [])
            : await (runners.listPipelines ? runners.listPipelines() : []);
      const hit = matchNamed(listed, instant?.name ?? query);
      if (!hit?.id) {
        return {
          error:
            tool === "get_segment"
              ? `I did not find a segment named "${query}".`
              : `I did not find a pipeline named "${query || "that"}".`,
        };
      }
      if (tool === "get_segment") {
        return runners.getSegment ? runners.getSegment(hit.id) : { error: "Segment get is unavailable." };
      }
      if (tool === "pipeline_metrics") {
        return runners.pipelineMetrics
          ? runners.pipelineMetrics(hit.id)
          : { error: "Pipeline metrics are unavailable." };
      }
      return runners.getPipeline ? runners.getPipeline(hit.id) : { error: "Pipeline get is unavailable." };
    }
    case "remember":
      return write("remember", { content: query }, async () =>
        runners.remember
          ? runners.remember(query)
          : { remembered: false, reason: "Memory is unavailable." },
      );
    case "get_provenance": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      const entity = facts.find((f) => f.kind === "entity" && f.id);
      const record = contact ?? entity;
      if (!record?.id || !runners.getProvenance) {
        return { error: `I did not find "${query}" in the CRM to show provenance.` };
      }
      return runners.getProvenance(record.kind === "contact" ? "contact" : "entity", record.id);
    }
    case "build_smart_segment":
      return write("build_smart_segment", { goal: query, name: instant?.name ?? query }, async () =>
        runners.buildSmartSegment
          ? runners.buildSmartSegment(query, instant?.name)
          : { error: "Smart segment build is unavailable." },
      );
    case "verify_entity":
    case "detect_tech": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const first = facts.find((f) => f.kind === "entity" && f.id);
      if (!first?.id) {
        return {
          error: `I did not find "${query}" in the CRM to ${tool === "verify_entity" ? "verify" : "fingerprint"}.`,
        };
      }
      if (tool === "verify_entity") {
        return write("verify_entity", { id: first.id }, async () =>
          runners.verifyEntity
            ? runners.verifyEntity(first.id!)
            : { error: "Entity verify is unavailable." },
        );
      }
      return write("detect_tech", { id: first.id }, async () =>
        runners.detectTech
          ? runners.detectTech(first.id!)
          : { error: "Tech detect is unavailable." },
      );
    }
    case "pause_autopilot":
      return write("pause_autopilot", { query }, async () =>
        runners.pauseAutopilot
          ? runners.pauseAutopilot(prefetch)
          : { error: "No running autopilot plan to pause." },
      );
    case "enrich_contact":
    case "find_socials": {
      const found =
        prefetch && typeof prefetch === "object" ? prefetch : await runners.searchCrm(query);
      const facts = factsFromSearch(found);
      const contact = facts.find((f) => f.kind === "contact" && f.id);
      if (!contact?.id) {
        return { error: `I did not find a contact named "${query}" in the CRM.` };
      }
      const contactId = contact.id;
      if (tool === "find_socials") {
        return write("find_socials", { contactId }, async () =>
          runners.findSocials
            ? runners.findSocials(contactId)
            : { error: "Social find is unavailable." },
        );
      }
      const field = instant?.field ?? "linkedin";
      return write("enrich_contact", { id: contactId, field }, async () =>
        runners.enrichContact
          ? runners.enrichContact(contactId, field)
          : { error: "Contact enrich is unavailable." },
      );
    }
    case "search_crm":
    default:
      return runners.searchCrm(query);
  }
}
