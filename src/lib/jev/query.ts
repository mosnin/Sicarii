/** Strip lookup prefixes so "show me Acme" becomes a CRM query. */
export function lookupQuery(message: string): string {
  const cleaned = message
    .replace(/^(please\s+)?(show me|find me|find|search for|search|look up|lookup|who is|what is|get|list)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();
  return (cleaned || message).slice(0, 200);
}

export function splitLocalQuery(message: string): { query: string; location?: string } {
  const q = lookupQuery(message);
  const m = q.match(/^(.+?)\s+(?:in|near|around)\s+(.+)$/i);
  if (!m?.[1] || !m[2]) return { query: q };
  return { query: m[1].trim(), location: m[2].trim() };
}
