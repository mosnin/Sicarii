// Proves the env doctor correctly reports missing vs present for a couple of
// representative env vars, and never leaks a secret value into the report.
import { describe, it, expect } from "vitest";
import { runEnvDoctor, formatDoctorReport } from "@/lib/env-doctor";

function findCheck(report: ReturnType<typeof runEnvDoctor>, name: string) {
  for (const group of report.groups) {
    const check = group.checks.find((c) => c.name === name);
    if (check) return check;
  }
  throw new Error(`check not found: ${name}`);
}

describe("runEnvDoctor", () => {
  it("reports MISSING for every gated integration on a bare environment", () => {
    const report = runEnvDoctor({});
    expect(findCheck(report, "Tavily web search").status).toBe("missing");
    expect(findCheck(report, "Supabase Postgres (Prisma)").status).toBe("missing");
    expect(findCheck(report, "Clerk auth").status).toBe("missing");
    expect(report.summary.missing).toBeGreaterThan(0);
    expect(report.summary.pass).toBeGreaterThan(0); // GLEIF/SEC EDGAR need no key
  });

  it("flips a single-var integration to PASS once its key is set", () => {
    const report = runEnvDoctor({ TAVILY_API_KEY: "tvly-secret-value" });
    expect(findCheck(report, "Tavily web search").status).toBe("pass");
  });

  it("reports PARTIAL when only one half of a two-var integration is set", () => {
    const report = runEnvDoctor({ POSTGRES_PRISMA_URL: "postgresql://u:p@host/db" });
    expect(findCheck(report, "Supabase Postgres (Prisma)").status).toBe("partial");
  });

  it("reports PASS once both database vars are set", () => {
    const report = runEnvDoctor({
      POSTGRES_PRISMA_URL: "postgresql://u:p@host:6543/db",
      POSTGRES_URL_NON_POOLING: "postgresql://u:p@host:5432/db",
    });
    expect(findCheck(report, "Supabase Postgres (Prisma)").status).toBe("pass");
  });

  it("treats providers that need no credentials as always PASS", () => {
    const report = runEnvDoctor({});
    expect(findCheck(report, "GLEIF (LEI registry)").status).toBe("pass");
    expect(findCheck(report, "SEC EDGAR (US public companies)").status).toBe("pass");
  });

  it("resolves x402 to PARTIAL when a mainnet wallet is set without CDP credentials", () => {
    const report = runEnvDoctor({ X402_PAY_TO: "0xTreasury", X402_NETWORK: "base" });
    expect(findCheck(report, "x402 agent payments").status).toBe("partial");
  });

  it("resolves x402 to PASS on testnet with just a wallet", () => {
    const report = runEnvDoctor({ X402_PAY_TO: "0xTreasury", X402_NETWORK: "base-sepolia" });
    expect(findCheck(report, "x402 agent payments").status).toBe("pass");
  });

  it("never includes a secret value anywhere in the serialized report", () => {
    const secret = "sk_live_super_secret_value_12345";
    const report = runEnvDoctor({ CLERK_SECRET_KEY: secret, STRIPE_SECRET_KEY: secret });
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("formats a human-readable report without throwing", () => {
    const text = formatDoctorReport(runEnvDoctor({}));
    expect(text).toContain("Scalar environment doctor");
    expect(text).toContain("Summary:");
  });
});
