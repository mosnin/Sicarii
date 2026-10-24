// RFC 4180 CSV used by contacts/entities export. A comma, quote, or newline
// in a field must be quoted with inner quotes doubled so a downstream
// spreadsheet cannot shift columns or swallow rows.

import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("emits a header and CRLF-terminated rows in column order", () => {
    const csv = toCsv(
      [{ name: "Ada", email: "ada@x.com" }],
      ["name", "email"],
    );
    expect(csv).toBe("name,email\r\nAda,ada@x.com\r\n");
  });

  it("quotes commas, doubles inner quotes, and quotes newlines", () => {
    const csv = toCsv(
      [
        {
          name: 'Ada "A.A." Lovelace',
          note: "one, two",
          bio: "line1\nline2",
        },
      ],
      ["name", "note", "bio"],
    );
    expect(csv).toBe(
      'name,note,bio\r\n"Ada ""A.A."" Lovelace","one, two","line1\nline2"\r\n',
    );
  });

  it("emits empty cells for null/undefined and ISO strings for dates", () => {
    const when = new Date("2026-01-02T03:04:05.000Z");
    const csv = toCsv([{ name: null, when, extra: undefined }], ["name", "when", "extra"]);
    expect(csv).toBe(`name,when,extra\r\n,${when.toISOString()},\r\n`);
  });
});
