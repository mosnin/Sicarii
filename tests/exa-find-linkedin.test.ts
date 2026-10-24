// LinkedIn lookup: a same-name stranger is worse than no profile. When the
// company is known we require name AND company in the candidate; otherwise we
// require a name match. Non-/in/ URLs never count as a profile.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exaFindLinkedIn } from "@/lib/exa";

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

describe("exaFindLinkedIn", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
  });

  it("returns the /in/ profile that matches name and company", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              url: "https://linkedin.com/company/acme",
              title: "Acme",
              text: "Acme company page",
            },
            {
              url: "https://www.linkedin.com/in/ada-lovelace",
              title: "Ada Lovelace - CEO at Acme",
              text: "Building widgets at Acme",
            },
          ],
        }),
      ),
    );
    await expect(exaFindLinkedIn("Ada Lovelace", { company: "Acme" })).resolves.toBe(
      "https://www.linkedin.com/in/ada-lovelace",
    );
  });

  it("returns null for a same-name stranger at a different company", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              url: "https://linkedin.com/in/ada-lovelace",
              title: "Ada Lovelace - Engineer at OtherCo",
              text: "I work at OtherCo on compilers",
            },
          ],
        }),
      ),
    );
    await expect(exaFindLinkedIn("Ada Lovelace", { company: "Acme" })).resolves.toBeNull();
  });

  it("requires a name match when no company is given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              url: "https://linkedin.com/in/someone-else",
              title: "Someone Else - Founder",
              text: "Hello",
            },
          ],
        }),
      ),
    );
    await expect(exaFindLinkedIn("Ada Lovelace")).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              url: "https://linkedin.com/in/ada-lovelace",
              title: "Ada Lovelace",
              text: "Personal profile",
            },
          ],
        }),
      ),
    );
    await expect(exaFindLinkedIn("Ada Lovelace")).resolves.toBe(
      "https://linkedin.com/in/ada-lovelace",
    );
  });

  it("returns null when no linkedin.com/in/ candidate exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [{ url: "https://example.com/ada", title: "Ada Lovelace at Acme", text: "Acme" }],
        }),
      ),
    );
    await expect(exaFindLinkedIn("Ada Lovelace", { company: "Acme" })).resolves.toBeNull();
  });
});
