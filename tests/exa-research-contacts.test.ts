// Contact research must never spawn junk people. A "null"/"Unknown" name or a
// duplicate from a second result page becomes a CRM contact and a wrong email
// later. These tests pin junk filtering, name-key dedupe, and the count cap.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exaResearchContacts } from "@/lib/exa";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("exaResearchContacts", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
  });

  it("keeps named people, drops junk names, and dedupes by lowercase name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              url: "https://acme.com/team",
              title: "Team",
              summary: JSON.stringify({
                people: [
                  { name: "Ada Lovelace", title: "CEO", email: "ada@acme.com", linkedin: "https://linkedin.com/in/ada" },
                  { name: "Unknown", title: "VP" },
                  { name: "null" },
                  { name: "x" },
                  { name: "  " },
                ],
              }),
            },
            {
              url: "https://acme.com/about",
              title: "About",
              summary: JSON.stringify({
                people: [{ name: "ada lovelace", title: "Founder" }, { name: "Grace Hopper", title: "CTO" }],
              }),
            },
            {
              url: "https://acme.com/press",
              title: "Press",
              summary: "not-json",
            },
          ],
        }),
      ),
    );

    await expect(exaResearchContacts("Acme", "acme.com", 8)).resolves.toEqual([
      {
        name: "Ada Lovelace",
        title: "CEO",
        email: "ada@acme.com",
        linkedin: "https://linkedin.com/in/ada",
        sourceUrl: "https://acme.com/team",
      },
      {
        name: "Grace Hopper",
        title: "CTO",
        email: undefined,
        linkedin: undefined,
        sourceUrl: "https://acme.com/about",
      },
    ]);
  });

  it("stops at the requested count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              url: "https://acme.com/team",
              title: "Team",
              summary: JSON.stringify({
                people: [
                  { name: "Ada Lovelace" },
                  { name: "Grace Hopper" },
                  { name: "Alan Turing" },
                ],
              }),
            },
          ],
        }),
      ),
    );
    const people = await exaResearchContacts("Acme", "acme.com", 2);
    expect(people.map((p) => p.name)).toEqual(["Ada Lovelace", "Grace Hopper"]);
  });

  it("returns [] when no result has a parseable people summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            { url: "https://acme.com", title: "Acme", summary: "" },
            { url: "https://acme.com/x", title: "X", summary: "{bad" },
          ],
        }),
      ),
    );
    await expect(exaResearchContacts("Acme")).resolves.toEqual([]);
  });
});
