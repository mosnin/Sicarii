import { describe, it, expect } from "vitest";
import { shareScanText } from "@/lib/share";

describe("shareScanText", () => {
  it("joins notes, activities, and message bodies", () => {
    expect(
      shareScanText({
        notes: "keep close",
        entityDescription: "Series B",
        activities: [{ body: "called Tuesday" }, { body: "  " }],
        emails: [{ subject: "intro", body: "hello" }],
        calls: [{ summary: "voicemail" }],
        socials: [{ body: "liked the post" }],
      }),
    ).toBe("keep close\n\nSeries B\n\ncalled Tuesday\n\nintro\n\nhello\n\nvoicemail\n\nliked the post");
  });

  it("skips message bodies when includeMessages is false", () => {
    expect(
      shareScanText({
        notes: "keep close",
        emails: [{ subject: "intro", body: "hello" }],
        includeMessages: false,
      }),
    ).toBe("keep close");
  });
});
