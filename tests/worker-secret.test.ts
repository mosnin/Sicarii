import { describe, it, expect } from "vitest";
import { authorizeWorkerRequest, secretsMatch, workerSharedSecret } from "@/lib/worker-secret";

describe("worker secret", () => {
  it("prefers WORKER_SECRET over CRON_SECRET", () => {
    expect(workerSharedSecret({ WORKER_SECRET: "w", CRON_SECRET: "c" })).toBe("w");
    expect(workerSharedSecret({ CRON_SECRET: "c" })).toBe("c");
    expect(workerSharedSecret({})).toBeNull();
  });

  it("matches equal secrets and rejects unequal ones", async () => {
    expect(await secretsMatch("alpha", "alpha")).toBe(true);
    expect(await secretsMatch("alpha", "beta")).toBe(false);
    expect(await secretsMatch("short", "much-longer-secret")).toBe(false);
  });

  it("accepts a Bearer header against WORKER_SECRET", async () => {
    const env = { WORKER_SECRET: "shared-token" };
    expect(await authorizeWorkerRequest("Bearer shared-token", env)).toBe(true);
    expect(await authorizeWorkerRequest("shared-token", env)).toBe(true);
    expect(await authorizeWorkerRequest("Bearer wrong", env)).toBe(false);
    expect(await authorizeWorkerRequest(null, env)).toBe(false);
  });
});
