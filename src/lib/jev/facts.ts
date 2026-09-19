// Grounded CRM facts. The generator hallucinates when it names companies
// that are not in the box. Code extracts a fact card from search payloads
// and refuses invented names locally. Jev is optional backup.

export type CrmFact = {
  id?: string;
  kind: "entity" | "contact" | "memory";
  name?: string | null;
  domain?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  industry?: string | null;
  location?: string | null;
  status?: string | null;
  notes?: string | null;
  contacts?: number;
};

const SKIP_TOKENS = new Set([
  "i",
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "to",
  "in",
  "on",
  "of",
  "crm",
  "scalar",
  "open",
  "autopilot",
  "dashboard",
  "company",
  "companies",
  "contact",
  "contacts",
  "people",
  "person",
  "yes",
  "no",
  "ok",
  "you",
  "we",
  "they",
  "this",
  "that",
  "best",
  "fit",
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function factsFromSearch(payload: unknown): CrmFact[] {
  const box = asRecord(payload) ?? {};
  const entities = Array.isArray(box.entities)
    ? box.entities
    : Array.isArray(payload)
      ? payload
      : [];
  const contacts = Array.isArray(box.contacts) ? box.contacts : [];
  const out: CrmFact[] = [];
  for (const row of entities.slice(0, 12)) {
    const o = asRecord(row);
    if (!o) continue;
    const count = asRecord(o._count);
    out.push({
      id: str(o.id) ?? undefined,
      kind: "entity",
      name: str(o.name),
      domain: str(o.domain),
      industry: str(o.industry),
      location: str(o.location),
      status: str(o.status),
      notes: str(o.notes),
      contacts: typeof count?.contacts === "number" ? count.contacts : undefined,
    });
  }
  for (const row of contacts.slice(0, 12)) {
    const o = asRecord(row);
    if (!o) continue;
    const entity = asRecord(o.entity);
    out.push({
      id: str(o.id) ?? undefined,
      kind: "contact",
      name: str(o.name),
      email: str(o.email),
      company: str(o.company) ?? str(entity?.name),
      title: str(o.title),
      status: str(o.status),
      notes: str(o.notes),
    });
  }
  return out;
}

export function factsFromMemory(rows: unknown): CrmFact[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.slice(0, 4).map((row) => {
    const o = asRecord(row);
    return {
      kind: "memory" as const,
      notes: str(o?.content) ?? str(o?.text),
    };
  });
}

export function knownTokens(facts: CrmFact[]): Set<string> {
  const out = new Set<string>();
  for (const f of facts) {
    for (const raw of [f.name, f.domain, f.email, f.company, f.title, f.industry, f.location]) {
      if (!raw) continue;
      out.add(raw.toLowerCase());
      for (const part of raw.toLowerCase().split(/[^a-z0-9.@+-]+/)) {
        if (part.length >= 3) out.add(part);
      }
    }
  }
  return out;
}

export function inventedClaims(text: string, facts: CrmFact[]): string[] {
  if (facts.length === 0) return [];
  const known = knownTokens(facts);
  const hits = new Set<string>();
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const email of emails) {
    if (!known.has(email.toLowerCase())) hits.add(email);
  }
  const domains = text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi) ?? [];
  for (const domain of domains) {
    const d = domain.toLowerCase();
    if (d.endsWith(".com") || d.endsWith(".io") || d.endsWith(".ai") || d.endsWith(".co")) {
      if (!known.has(d) && !d.includes("tryscalar") && !d.includes("scalar")) hits.add(domain);
    }
  }
  const names = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) ?? [];
  for (const name of names) {
    const low = name.toLowerCase();
    if (SKIP_TOKENS.has(low)) continue;
    const parts = low.split(/\s+/);
    if (parts.every((p) => known.has(p) || known.has(low))) continue;
    if (name.length < 4) continue;
    hits.add(name);
  }
  return [...hits].slice(0, 8);
}

export function factCard(facts: CrmFact[]): string {
  if (facts.length === 0) return "No matching CRM records.";
  return facts
    .slice(0, 8)
    .map((f) => {
      if (f.kind === "memory") return `Memory: ${(f.notes ?? "").slice(0, 180)}`;
      if (f.kind === "contact") {
        return [f.name, f.title, f.company, f.email, f.status].filter(Boolean).join(" · ");
      }
      const people = f.contacts != null ? `${f.contacts} contacts` : null;
      return [f.name, f.domain, f.industry, f.location, f.status, people].filter(Boolean).join(" · ");
    })
    .join("\n");
}

export function formatDetailCard(facts: CrmFact[], query: string): string | null {
  const entities = facts.filter((f) => f.kind === "entity");
  const contacts = facts.filter((f) => f.kind === "contact");
  if (entities.length === 1 && contacts.length <= 2) {
    const e = entities[0]!;
    const people =
      contacts.length > 0
        ? ` People on file: ${contacts.map((c) => [c.name, c.email].filter(Boolean).join(" ")).join("; ")}.`
        : e.contacts
          ? ` ${e.contacts} contact${e.contacts === 1 ? "" : "s"} on file.`
          : "";
    return `${e.name ?? query}${e.domain ? ` (${e.domain})` : ""} is in the CRM${e.status ? ` as ${e.status}` : ""}${e.industry ? `. Industry: ${e.industry}` : ""}${e.location ? `. Location: ${e.location}` : ""}.${people}`.replace(
      /\s+/g,
      " ",
    );
  }
  if (contacts.length === 1 && entities.length <= 1) {
    const c = contacts[0]!;
    const at = c.company ? ` at ${c.company}` : "";
    return `${c.name ?? query}${at}${c.email ? ` (${c.email})` : ""} is a contact${c.title ? `, ${c.title}` : ""}${c.status ? `, status ${c.status}` : ""}.`;
  }
  return null;
}

export function compactCrmPayload(payload: unknown, limit = 8): unknown {
  const box = asRecord(payload);
  if (!box) return payload;
  const slimRow = (row: unknown) => {
    const o = asRecord(row);
    if (!o) return row;
    return {
      id: o.id,
      name: o.name ?? o.companyName ?? o.title,
      domain: o.domain,
      email: o.email,
      company: o.company,
      title: o.title,
      industry: o.industry,
      location: o.location,
      status: o.status,
      url: o.url,
    };
  };
  const next: Record<string, unknown> = {};
  if (Array.isArray(box.entities)) next.entities = box.entities.slice(0, limit).map(slimRow);
  if (Array.isArray(box.contacts)) next.contacts = box.contacts.slice(0, limit).map(slimRow);
  if (Array.isArray(box.results)) next.results = box.results.slice(0, limit).map(slimRow);
  if (Array.isArray(box.created)) next.created = box.created.slice(0, limit).map(slimRow);
  if (box.added != null) next.added = box.added;
  if (box.skipped != null) next.skipped = box.skipped;
  if (box.error != null) next.error = box.error;
  if (box.id != null && !next.entities && !next.contacts) return slimRow(box);
  return Object.keys(next).length > 0 ? next : slimRow(box);
}

const HEAVY_KEYS = new Set([
  "enrichment",
  "transcript",
  "embedding",
  "embeddings",
  "raw",
  "html",
  "rawHtml",
]);

/** Drop blob fields and cap nested arrays so MCP/tool dumps stay small. */
export function stripHeavyFields(payload: unknown, depth = 0): unknown {
  if (payload == null || depth > 6) return payload;
  if (Array.isArray(payload)) {
    return payload.slice(0, 50).map((row) => stripHeavyFields(row, depth + 1));
  }
  if (typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (HEAVY_KEYS.has(key)) continue;
    out[key] = stripHeavyFields(value, depth + 1);
  }
  return out;
}

export function groundedRefusal(facts: CrmFact[]): string {
  if (facts.length === 0) {
    return "I do not have that in the CRM. Say the word if you want me to discover it. I will not invent companies or emails.";
  }
  return `I will not invent records. I only have these CRM facts:\n${factCard(facts)}`;
}
