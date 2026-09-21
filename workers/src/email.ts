// Minimal RFC 5322 parse for Cloudflare Email Routing. Enough to recover
// From / To / Subject / a text body. Not a MIME library.

export type ParsedEmail = {
  from: string;
  to: string;
  subject?: string;
  text: string;
};

function headerValue(raw: string, name: string): string | undefined {
  const re = new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, "im");
  const match = raw.match(re);
  if (!match?.[1]) return undefined;
  return match[1].replace(/\r?\n[ \t]+/g, " ").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRawEmail(raw: string, fallback: { from?: string; to?: string } = {}): ParsedEmail {
  const split = raw.indexOf("\r\n\r\n") >= 0 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
  const head = split >= 0 ? raw.slice(0, split) : raw;
  const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, "") : "";
  const from = headerValue(head, "From") ?? fallback.from ?? "";
  const to = headerValue(head, "To") ?? fallback.to ?? "";
  const subject = headerValue(head, "Subject");
  const contentType = headerValue(head, "Content-Type") ?? "";
  const text = contentType.toLowerCase().includes("text/html") ? stripHtml(body) : body.trim();
  return { from, to, subject, text: text.slice(0, 20_000) };
}
