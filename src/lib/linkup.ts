// Linkup deep research client.
// Base: https://api.linkup.so/v1  Auth: Authorization: Bearer KEY
// Standard search is fast; deep search is thorough with sourced answers.
// Use for scheduled background research on contacts, entities, or any topic.

const BASE = "https://api.linkup.so/v1";

function key() {
  const k = process.env.LINKUP_API_KEY?.trim();
  if (!k) throw new Error("LINKUP_API_KEY is not set");
  return k;
}

export function isLinkupConfigured() {
  return Boolean(process.env.LINKUP_API_KEY?.trim());
}

export interface LinkupSource {
  url: string;
  title?: string;
  snippet?: string;
}

export interface LinkupResult {
  answer?: string;
  sources: LinkupSource[];
}

async function search(
  query: string,
  depth: "standard" | "deep",
  outputType: "sourcedAnswer" | "searchResults"
): Promise<LinkupResult> {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify({ q: query, depth, outputType }),
  });
  const text = await res.text();
  console.log(`[linkup] ${depth} → ${res.status}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`Linkup search failed (${res.status}): ${text.slice(0, 200)}`);

  type RawItem = { url?: string; name?: string; content?: string; snippet?: string };
  type Raw = { answer?: string; results?: RawItem[]; sources?: RawItem[] };
  const data = JSON.parse(text) as Raw;
  const sources: LinkupSource[] = (data.results ?? data.sources ?? []).map((s) => ({
    url: s.url ?? "",
    title: s.name,
    snippet: s.content ?? s.snippet,
  }));
  return { answer: data.answer, sources };
}

export async function linkupSearch(query: string): Promise<LinkupResult> {
  return search(query, "standard", "searchResults");
}

export async function linkupDeepResearch(query: string): Promise<LinkupResult> {
  return search(query, "deep", "sourcedAnswer");
}
