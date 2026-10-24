// RFC 4180 CSV used by contacts/entities export. A quoting bug here would
// corrupt exports (PII / CRM dumps) or split fields on commas inside names.

import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("emits a header and rows in the given column order, CRLF-terminated", () => {
    expect(
      toCsv(
        [
          { name: "Ada", email: "ada@example.com" },
          { name: "Bob", email: "bob@example.com" },
        ],
        ["name", "email"],
      ),
    ).toBe("name,email\r\nAda,ada@example.com\r\nBob,bob@example.com\r\n");
  });

  it("quotes commas, quotes, and newlines, and doubles inner quotes", () => {
    expect(toCsv([{ note: 'He said "hi", then left' }], ["note"])).toBe(
      'note\r\n"He said ""hi"", then left"\r\n',
    );
    expect(toCsv([{ note: "line1\nline2" }], ["note"])).toBe('note\r\n"line1\nline2"\r\n');
    expect(toCsv([{ note: "line1\r\nline2" }], ["note"])).toBe('note\r\n"line1\r\nline2"\r\n');
  });

  it("renders null/undefined as empty and dates as ISO", () => {
    const when = new Date("2026-07-11T12:00:00.000Z");
    expect(toCsv([{ name: null, when, extra: undefined }], ["name", "when", "extra"])).toBe(
      `name,when,extra\r\n,${when.toISOString()},\r\n`,
    );
  });

  it("does not leak columns that were not requested", () => {
    expect(toCsv([{ name: "Ada", secret: "do-not-export" }], ["name"])).toBe("name\r\nAda\r\n");
  });
});
