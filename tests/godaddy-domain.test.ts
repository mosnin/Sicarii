import { describe, it, expect } from "vitest";
import { isPlausibleDomain } from "@/lib/godaddy";

describe("isPlausibleDomain", () => {
  it("accepts real looking names", () => {
    expect(isPlausibleDomain("acme.com")).toBe(true);
    expect(isPlausibleDomain("hello-world.io")).toBe(true);
    expect(isPlausibleDomain("https://Acme.com/path")).toBe(true);
  });

  it("rejects junk", () => {
    expect(isPlausibleDomain("")).toBe(false);
    expect(isPlausibleDomain("localhost")).toBe(false);
    expect(isPlausibleDomain("not a domain")).toBe(false);
    expect(isPlausibleDomain("-bad.com")).toBe(false);
  });
});
