import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mergeResearchNotes,
  shouldPromoteToEnriched,
  researchTargetPatch,
  applyScheduledResearch,
  RESEARCH_NOTES_MAX,
} from "@/lib/research-notes";

describe("mergeResearchNotes", () => {
  it("keeps existing notes when incoming research is empty", () => {
    expect(mergeResearchNotes("Call Tuesday", "")).toBe("Call Tuesday");
    expect(mergeResearchNotes("Call Tuesday", "   ")).toBe("Call Tuesday");
    expect(mergeResearchNotes("Call Tuesday", null)).toBe("Call Tuesday");
  });

  it("uses incoming research when notes are empty", () => {
    expect(mergeResearchNotes(null, "Acme raised a Series B")).toBe("Acme raised a Series B");
    expect(mergeResearchNotes("  ", "Acme raised a Series B")).toBe("Acme raised a Series B");
  });

  it("appends research under existing notes instead of replacing them", () => {
    expect(mergeResearchNotes("Call Tuesday", "Acme raised a Series B")).toBe(
      "Call Tuesday\n\nAcme raised a Series B",
    );
  });

  it("does not append a research block that is already in the notes", () => {
    const existing = "Call Tuesday\n\nAcme raised a Series B";
    expect(mergeResearchNotes(existing, "Acme raised a Series B")).toBe(existing);
  });

  it("never truncates existing notes to make room for research", () => {
    const prior = "x".repeat(RESEARCH_NOTES_MAX);
    expect(mergeResearchNotes(prior, "new research that must not win")).toBe(prior);
  });

  it("caps the merged string and keeps the existing prefix", () => {
    const prior = "keep-me";
    const incoming = "y".repeat(RESEARCH_NOTES_MAX);
    const merged = mergeResearchNotes(prior, incoming);
    expect(merged.startsWith("keep-me\n\n")).toBe(true);
    expect(merged.length).toBe(RESEARCH_NOTES_MAX);
    expect(merged).toContain("y");
  });
});

describe("shouldPromoteToEnriched", () => {
  it("promotes only NEW records", () => {
    expect(shouldPromoteToEnriched("NEW")).toBe(true);
    expect(shouldPromoteToEnriched("ENRICHED")).toBe(false);
    expect(shouldPromoteToEnriched("CONTACTED")).toBe(false);
    expect(shouldPromoteToEnriched("REPLIED")).toBe(false);
    expect(shouldPromoteToEnriched("QUALIFIED")).toBe(false);
    expect(shouldPromoteToEnriched("WON")).toBe(false);
    expect(shouldPromoteToEnriched("LOST")).toBe(false);
    expect(shouldPromoteToEnriched("ARCHIVED")).toBe(false);
  });
});

describe("researchTargetPatch", () => {
  it("is a no-op when research is empty, including on NEW records", () => {
    expect(
      researchTargetPatch({
        existingNotes: "Call Tuesday",
        existingStatus: "NEW",
        researchNote: "",
      }),
    ).toEqual({});
  });

  it("merges notes and promotes NEW", () => {
    expect(
      researchTargetPatch({
        existingNotes: "Call Tuesday",
        existingStatus: "NEW",
        researchNote: "Acme raised a Series B",
      }),
    ).toEqual({
      notes: "Call Tuesday\n\nAcme raised a Series B",
      status: "ENRICHED",
    });
  });

  it("merges notes but does not demote a later contact status", () => {
    expect(
      researchTargetPatch({
        existingNotes: "In late-stage talks",
        existingStatus: "WON",
        researchNote: "Acme raised a Series B",
      }),
    ).toEqual({
      notes: "In late-stage talks\n\nAcme raised a Series B",
    });
  });

  it("does not rewrite notes when the same research is already stored", () => {
    expect(
      researchTargetPatch({
        existingNotes: "In late-stage talks\n\nAcme raised a Series B",
        existingStatus: "QUALIFIED",
        researchNote: "Acme raised a Series B",
      }),
    ).toEqual({});
  });
});

const OWNER = "user-A";
const ATTACKER = "user-B";

const contactFindFirst = vi.fn();
const contactUpdate = vi.fn();
const entityFindFirst = vi.fn();
const entityUpdate = vi.fn();
const activityCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: (...args: unknown[]) => contactFindFirst(...args),
      update: (...args: unknown[]) => contactUpdate(...args),
    },
    entity: {
      findFirst: (...args: unknown[]) => entityFindFirst(...args),
      update: (...args: unknown[]) => entityUpdate(...args),
    },
    activity: {
      create: (...args: unknown[]) => activityCreate(...args),
    },
  },
}));

describe("applyScheduledResearch tenant + write behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactUpdate.mockResolvedValue({});
    entityUpdate.mockResolvedValue({});
    activityCreate.mockResolvedValue({});
  });

  it("does not write another tenant's contact, even when the id is known", async () => {
    contactFindFirst.mockResolvedValue(null);
    const result = await applyScheduledResearch({
      userId: ATTACKER,
      targetType: "contact",
      targetId: "c1",
      researchNote: "stolen notes",
    });
    expect(result.applied).toBe(false);
    expect(contactFindFirst).toHaveBeenCalledWith({
      where: { id: "c1", userId: ATTACKER },
      select: { id: true, notes: true, status: true },
    });
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it("appends research under existing contact notes and leaves WON alone", async () => {
    contactFindFirst.mockResolvedValue({
      id: "c1",
      notes: "Call Tuesday",
      status: "WON",
    });
    const result = await applyScheduledResearch({
      userId: OWNER,
      targetType: "contact",
      targetId: "c1",
      researchNote: "Acme raised a Series B",
    });
    expect(result).toEqual({ applied: true, notesMerged: true, statusPromoted: false });
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { notes: "Call Tuesday\n\nAcme raised a Series B" },
    });
    expect(activityCreate).toHaveBeenCalledWith({
      data: {
        userId: OWNER,
        contactId: "c1",
        kind: "note",
        body: "Acme raised a Series B",
        actorLabel: "research schedule",
      },
    });
  });

  it("does not assign notes or status when research is empty", async () => {
    const result = await applyScheduledResearch({
      userId: OWNER,
      targetType: "contact",
      targetId: "c1",
      researchNote: "   ",
    });
    expect(result.applied).toBe(false);
    expect(contactFindFirst).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });
});

describe("research cron source guard", () => {
  it("does not assign notes or force ENRICHED on a targeted contact/entity", () => {
    const src = readFileSync(resolve(process.cwd(), "src/inngest/functions.ts"), "utf8");
    expect(src).not.toMatch(/notes:\s*researchNote/);
    expect(src).not.toMatch(/status:\s*"ENRICHED"/);
    expect(src).toContain("applyScheduledResearch");
  });
});
