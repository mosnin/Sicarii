import { describe, it, expect } from "vitest";
import { crmFitText, scoreFirstCrmFit } from "@/lib/jev";

describe("crmFitText", () => {
  it("joins present CRM fields", () => {
    expect(
      crmFitText({
        id: "e1",
        kind: "entity",
        name: "Acme",
        industry: "SaaS",
        location: "Austin",
      }),
    ).toBe("Acme · SaaS · Austin");
  });
});

describe("scoreFirstCrmFit", () => {
  it("asks for Product Context before calling Jev", async () => {
    await expect(
      scoreFirstCrmFit({ entities: [{ id: "e1", name: "Acme" }], contacts: [] }, "  ", "Acme"),
    ).resolves.toEqual({ error: "Add your Product Context first. Fit is scored against it." });
  });

  it("does not invent a score when the CRM miss", async () => {
    await expect(
      scoreFirstCrmFit({ entities: [], contacts: [] }, "B2B payments for clinics", "Acme"),
    ).resolves.toEqual({ error: 'I did not find "Acme" in the CRM.' });
  });
});
