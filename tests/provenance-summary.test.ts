import { describe, it, expect } from "vitest";
import { summarizeProvenance, sourceName, relativeAge, type ProvenanceEntry } from "@/lib/provenance-summary";

function entry(p: Partial<ProvenanceEntry>): ProvenanceEntry {
  return { source: "explorium", confidence: 90, retrievedAt: new Date("2026-01-01"), verifiedAt: null, stale: false, ...p };
}

describe("summarizeProvenance", () => {
  it("returns null for no entries", () => {
    expect(summarizeProvenance([])).toBeNull();
  });

  it("counts fields, dedupes sources in order, and picks the freshest date", () => {
    const s = summarizeProvenance([
      entry({ source: "explorium", retrievedAt: new Date("2026-01-01") }),
      entry({ source: "gleif", retrievedAt: new Date("2026-03-01") }),
      entry({ source: "explorium", retrievedAt: new Date("2026-02-01") }),
    ])!;
    expect(s.fieldCount).toBe(3);
    expect(s.sources).toEqual(["explorium", "gleif"]);
    expect(s.freshest).toEqual(new Date("2026-03-01"));
  });

  it("averages confidence (rounded) and counts stale rows", () => {
    const s = summarizeProvenance([
      entry({ confidence: 100, stale: false }),
      entry({ confidence: 90, stale: true }),
      entry({ confidence: 85, stale: true }),
    ])!;
    expect(s.avgConfidence).toBe(92); // (100+90+85)/3 = 91.67 -> 92
    expect(s.staleCount).toBe(2);
  });
});

describe("sourceName", () => {
  it("maps known slugs to display names", () => {
    expect(sourceName("explorium")).toBe("Explorium");
    expect(sourceName("companies_house")).toBe("Companies House");
    expect(sourceName("sec_edgar")).toBe("SEC EDGAR");
    expect(sourceName("manual")).toBe("You");
  });
  it("title-cases unknown slugs", () => {
    expect(sourceName("some_new_provider")).toBe("Some New Provider");
  });
});

describe("relativeAge (injectable now for determinism)", () => {
  const now = new Date("2026-06-15T12:00:00Z").getTime();
  it("formats hours, days, and months", () => {
    expect(relativeAge(new Date("2026-06-15T11:00:00Z"), now)).toBe("1h ago");
    expect(relativeAge(new Date("2026-06-15T11:59:59Z"), now)).toBe("just now");
    expect(relativeAge(new Date("2026-06-14T12:00:00Z"), now)).toBe("1 day ago");
    expect(relativeAge(new Date("2026-06-05T12:00:00Z"), now)).toBe("10 days ago");
    expect(relativeAge(new Date("2026-05-01T12:00:00Z"), now)).toBe("1 month ago");
    expect(relativeAge(new Date("2026-02-01T12:00:00Z"), now)).toBe("4 months ago");
  });
});
