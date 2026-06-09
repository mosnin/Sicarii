/**
 * Minimal CSV builder (RFC 4180). Fields containing a comma, double quote, or
 * newline are wrapped in double quotes with inner quotes doubled. Used by the
 * contacts and entities export routes.
 */

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str =
    value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from `rows`, emitting `columns` in order with a header row. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.map(escapeField).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeField(row[col])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
