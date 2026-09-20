// Tavily web-search client. Used by the MCP `search_web` tool and the in-app
import { fetchWithTimeout } from "@/lib/http";
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

function apiKey() {
  const k = process.env.TAVILY_API_KEY;
  if (!k) throw new TavilyNotConfiguredError();
  return k;
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
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey(),
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

export interface TavilyExtractResult {
  url: string;
  rawContent: string;
  failed?: boolean;
}

export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResult[]> {
  const res = await fetchWithTimeout("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey(), urls }),
  });
  if (!res.ok) throw new Error(`Tavily extract failed (${res.status})`);
  const data = (await res.json()) as { results?: TavilyExtractResult[]; failed_results?: { url: string }[] };
  return [
    ...(data.results ?? []),
    ...(data.failed_results ?? []).map((f) => ({ url: f.url, rawContent: "", failed: true })),
  ];
}

export interface TavilyCrawlResult {
  baseUrl: string;
  results: { url: string; rawContent: string }[];
}

export async function tavilyCrawl(
  url: string,
  opts: { maxDepth?: number; limit?: number } = {}
): Promise<TavilyCrawlResult> {
  const res = await fetchWithTimeout("https://api.tavily.com/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey(),
      url,
      max_depth: opts.maxDepth ?? 1,
      max_breadth: 20,
      limit: opts.limit ?? 20,
      extract_depth: "basic",
    }),
  });
  if (!res.ok) throw new Error(`Tavily crawl failed (${res.status})`);
  const data = (await res.json()) as { base_url?: string; results?: { url: string; raw_content?: string }[] };
  return {
    baseUrl: data.base_url ?? url,
    results: (data.results ?? []).map((r) => ({ url: r.url, rawContent: r.raw_content ?? "" })),
  };
}
