// Bright Data scraping client.
// Base: https://api.brightdata.com/request  Auth: Authorization: Bearer KEY
// Requires BRIGHT_DATA_API_KEY + zone names set up in Bright Data control panel.
// Default zone names can be overridden via env vars.

const BASE = "https://api.brightdata.com/request";

function key() {
  const k = process.env.BRIGHT_DATA_API_KEY?.trim();
  if (!k) throw new Error("BRIGHT_DATA_API_KEY is not set");
  return k;
}

export function isBrightDataConfigured() {
  return Boolean(process.env.BRIGHT_DATA_API_KEY?.trim());
}

// Zone names — configure in Bright Data dashboard, override via env vars.
const UNLOCKER_ZONE = () => process.env.BRIGHT_DATA_UNLOCKER_ZONE ?? "web_unlocker1";
const SERP_ZONE = () => process.env.BRIGHT_DATA_SERP_ZONE ?? "serp_api";

async function bdRequest(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key()}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[brightdata] zone=${body.zone} url=${String(body.url).slice(0, 80)} → ${res.status}: ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`Bright Data failed (${res.status}): ${text.slice(0, 200)}`);
  return text;
}

// Scrape any URL using the Web Unlocker (anti-bot bypass, returns markdown).
export async function scrapeUrl(url: string): Promise<string> {
  return bdRequest({
    zone: UNLOCKER_ZONE(),
    url,
    format: "raw",
    data_format: "markdown",
  });
}

// Google SERP — structured search results as JSON.
export async function googleSerp(query: string, country = "us"): Promise<unknown> {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&gl=${country}`;
  const text = await bdRequest({
    zone: SERP_ZONE(),
    url: searchUrl,
    format: "json",
    brd_json: 1,
    country,
  });
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
