// Tavily web-search client. Used by the MCP `search_web` tool and the in-app
// agent to discover businesses ("nail salons in Miami"). Gated by TAVILY_API_KEY.

export class TavilyNotConfiguredError extends Error {
  constructor() {
    super("TAVILY_API_KEY is not set");
    this.name = "TavilyNotConfiguredError";
  }
}

export function isTavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export async function tavilySearch(
  query: string,
  opts: { maxResults?: number } = {}
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new TavilyNotConfiguredError();

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.min(opts.maxResults ?? 8, 20),
      search_depth: "basic",
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily search failed (${res.status})`);
  }
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}
