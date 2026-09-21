import { describe, it, expect } from "vitest";
import {
  clampFanoutLimit,
  decodeIdCursor,
  encodeIdCursor,
  FANOUT_PAGE_SIZE,
  pageFromIds,
} from "@/lib/mailbox-page";

describe("mailbox fan-out pagination", () => {
  it("caps a page at 200", () => {
    expect(clampFanoutLimit()).toBe(FANOUT_PAGE_SIZE);
    expect(clampFanoutLimit(10_000)).toBe(200);
    expect(clampFanoutLimit(0)).toBe(1);
  });

  it("round-trips a cursor and slices take+1 into nextCursor", () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({ id: `mb-${String(i).padStart(3, "0")}` }));
    const page = pageFromIds(rows, 200);
    expect(page.ids).toHaveLength(200);
    expect(page.ids[0]).toBe("mb-000");
    expect(page.ids[199]).toBe("mb-199");
    expect(page.nextCursor).toBe(encodeIdCursor("mb-199"));
    expect(decodeIdCursor(page.nextCursor)).toBe("mb-199");
  });

  it("returns no cursor on the last page", () => {
    const page = pageFromIds([{ id: "a" }, { id: "b" }], 200);
    expect(page.ids).toEqual(["a", "b"]);
    expect(page.nextCursor).toBeNull();
  });

  it("treats a junk cursor as empty", () => {
    expect(decodeIdCursor("%%%")).toBeNull();
    expect(decodeIdCursor("")).toBeNull();
  });
});
