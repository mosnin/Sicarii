// Exa AI search client — neural search, deep research, and monitors.
// Base: https://api.exa.ai  Auth: x-api-key header
// Used for intent scanning (who is looking for a product like yours).

const BASE = "https://api.exa.ai";

function key() {
  const k = process.env.EXA_API_KEY?.trim();
  if (!k) throw new Error("EXA_API_KEY is not set");
  return k;
}

export function isExaConfigured() {
  return Boolean(process.env.EXA_API_KEY?.trim());
}

async function exaPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[exa] POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`Exa ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

async function exaDel(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { "x-api-key": key() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa DELETE ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export interface ExaResult {
  id: string;
  url: string;
  title: string;
  score?: number;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

export type ExaCategory =
  | "company"
  | "research paper"
  | "news"
  | "tweet"
  | "personal site"
  | "pdf"
  | "github"
  | "linkedin profile";

export interface ExaSearchOptions {
  numResults?: number;
  category?: ExaCategory;
  startPublishedDate?: string;
  endPublishedDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: boolean;
  includeHighlights?: boolean;
  includeSummary?: boolean;
}

type SearchRes = { results?: ExaResult[] };

export async function exaIntentSearch(
  query: string,
  opts: ExaSearchOptions = {}
): Promise<ExaResult[]> {
  const body: Record<string, unknown> = {
    query,
    numResults: opts.numResults ?? 10,
    type: "neural",
    useAutoprompt: true,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
    ...(opts.endPublishedDate ? { endPublishedDate: opts.endPublishedDate } : {}),
    ...(opts.includeDomains?.length ? { includeDomains: opts.includeDomains } : {}),
    ...(opts.excludeDomains?.length ? { excludeDomains: opts.excludeDomains } : {}),
  };

  const wantContent = opts.includeText || opts.includeHighlights || opts.includeSummary;
  if (wantContent) {
    body.contents = {
      ...(opts.includeText ? { text: { maxCharacters: 800 } } : {}),
      ...(opts.includeHighlights ? { highlights: { numSentences: 3, highlightsPerUrl: 3 } } : {}),
      ...(opts.includeSummary ? { summary: { query } } : {}),
    };
  }

  const data = await exaPost<SearchRes>("/search", body);
  return data.results ?? [];
}

// Deep research: neural + full text + highlights + summary for rich intent signals.
export async function exaDeepSearch(query: string, numResults = 8): Promise<ExaResult[]> {
  return exaIntentSearch(query, {
    numResults,
    includeText: true,
    includeHighlights: true,
    includeSummary: true,
  });
}

// ── Monitors ──────────────────────────────────────────────────────────────────

export interface ExaMonitor {
  id: string;
  query: string;
  type: string;
  webhookUrl: string;
  runEvery: string;
  numResults: number;
  active?: boolean;
  createdAt?: string;
}

export async function createExaMonitor(opts: {
  query: string;
  webhookUrl: string;
  runEvery?: "day" | "week";
  numResults?: number;
}): Promise<ExaMonitor> {
  return exaPost<ExaMonitor>("/monitors", {
    query: opts.query,
    type: "neural",
    webhookUrl: opts.webhookUrl,
    runEvery: opts.runEvery ?? "day",
    numResults: opts.numResults ?? 10,
  });
}

export async function listExaMonitors(): Promise<ExaMonitor[]> {
  const res = await fetch(`${BASE}/monitors`, { headers: { "x-api-key": key() } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Exa list monitors failed (${res.status}): ${text.slice(0, 200)}`);
  type ListRes = { monitors?: ExaMonitor[]; data?: ExaMonitor[] };
  const data = JSON.parse(text) as ListRes;
  return data.monitors ?? data.data ?? [];
}

export async function deleteExaMonitor(monitorId: string): Promise<void> {
  return exaDel(`/monitors/${monitorId}`);
}
