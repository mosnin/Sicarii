import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("native client API routing", () => {
  it("lets the bearer-authenticated route return protocol errors without a browser redirect", () => {
    const proxy = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toContain('"/api/client(.*)"');
  });
});
