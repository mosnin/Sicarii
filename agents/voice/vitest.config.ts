import { defineConfig } from "vitest/config";

// Mirrors the root repo's vitest setup (node environment, run once, no watch in
// CI). Tests live beside the source here rather than in a top-level tests/ dir
// because this package is deployed on its own and travels with its own tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
});
