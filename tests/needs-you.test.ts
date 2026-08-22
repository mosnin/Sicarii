import { describe, it, expect } from "vitest";
import { worklistItems } from "@/components/dashboard/needs-you";

describe("worklistItems (the everyday driver)", () => {
  it("is empty (caught up) when nothing needs attention", () => {
    const { items, total } = worklistItems({ replied: 0, dueFollowup: 0, toEnrich: 0, radarSignals: 0 });
    expect(items).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("drops zero-count rows and sums the rest", () => {
    const { items, total } = worklistItems({ replied: 2, dueFollowup: 0, toEnrich: 5, radarSignals: 1 });
    expect(items.map((i) => i.title)).toEqual(["replied", "to enrich", "new signals"]);
    expect(total).toBe(8);
  });

  it("ranks a waiting reply first and marks it urgent", () => {
    const { items } = worklistItems({ replied: 1, dueFollowup: 3, toEnrich: 0, radarSignals: 0 });
    expect(items[0].title).toBe("replied");
    expect(items[0].urgent).toBe(true);
    expect(items[1].urgent).toBeUndefined();
  });

  it("routes each row to a real surface", () => {
    const { items } = worklistItems({ replied: 1, dueFollowup: 1, toEnrich: 1, radarSignals: 1 });
    expect(items.map((i) => i.href)).toEqual(["/crm", "/crm", "/crm?tab=entities", "/radar"]);
  });
});
