// Environment doctor: the single source of truth for "what's configured and
// what's missing" across every optional-but-load-bearing integration.
//
// This module is intentionally self-contained (no imports from other
// src/lib/* files, no "@/..." aliases) because it is loaded two different
// ways:
//   1. Through Next.js/webpack, by src/app/api/health/route.ts.
//   2. Directly by Node (no bundler, no path-alias resolution), by
//      scripts/doctor.mjs, which runs `node scripts/doctor.mjs` standalone.
// Node 22's built-in TypeScript support can load a plain relative ".ts" file
// like this one straight up, as long as it only uses erasable syntax (types,
// interfaces - no enums/namespaces) and never reaches for a module alias.
//
// The status logic here mirrors the various isXConfigured() helpers scattered
// across src/lib/ (isTavilyConfigured, isExaConfigured, isX402Configured,
// stripeConfigured, ...) so this report never disagrees with what the app
// actually does at request time. It never reads or returns a secret VALUE -
// only which env var NAMES are set.

export type CheckStatus = "pass" | "missing" | "partial";

export interface EnvCheck {
  /** Human label for the integration. */
  name: string;
  status: CheckStatus;
  /** Env var names involved - names only, values are never read into the report. */
  vars: string[];
  /** Short, secret-free explanation of the verdict. */
  detail: string;
}

export interface EnvGroup {
  group: string;
  checks: EnvCheck[];
}

export interface DoctorSummary {
  pass: number;
  missing: number;
  partial: number;
  total: number;
}

export interface DoctorReport {
  generatedAt: string;
  groups: EnvGroup[];
  summary: DoctorSummary;
}

type Env = Record<string, string | undefined>;

function isSet(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function allSet(env: Env, names: string[]): boolean {
  return names.every((n) => isSet(env, n));
}

function anySet(env: Env, names: string[]): boolean {
  return names.some((n) => isSet(env, n));
}

function missingOf(env: Env, names: string[]): string[] {
  return names.filter((n) => !isSet(env, n));
}

/** required-all-or-nothing check: pass (all set), partial (some set), missing (none set) */
function allOrNothing(name: string, vars: string[], env: Env, note: string): EnvCheck {
  const missing = missingOf(env, vars);
  if (missing.length === 0) return { name, status: "pass", vars, detail: note };
  if (missing.length === vars.length) {
    return { name, status: "missing", vars, detail: `Not set. ${note}` };
  }
  return {
    name,
    status: "partial",
    vars,
    detail: `Partially set - missing ${missing.join(", ")}. ${note}`,
  };
}

/** single-var, optional-integration check: pass or missing (never partial). */
function optionalKey(name: string, envVar: string, env: Env, note: string): EnvCheck {
  return {
    name,
    status: isSet(env, envVar) ? "pass" : "missing",
    vars: [envVar],
    detail: isSet(env, envVar) ? note : `Not set (optional). ${note}`,
  };
}

/** Always-on check for providers that need no credentials. */
function alwaysOn(name: string, vars: string[], note: string): EnvCheck {
  return { name, status: "pass", vars, detail: note };
}

export function runEnvDoctor(env: Env = process.env): DoctorReport {
  const groups: EnvGroup[] = [
    {
      group: "Auth",
      checks: [
        allOrNothing(
          "Clerk auth",
          ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
          env,
          "Required for sign-in/sign-up and every protected route."
        ),
        optionalKey(
          "Clerk webhook",
          "CLERK_WEBHOOK_SECRET",
          env,
          "Verifies /api/webhooks/clerk (user + org sync)."
        ),
      ],
    },
    {
      group: "Database",
      checks: [
        allOrNothing(
          "Supabase Postgres (Prisma)",
          ["POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"],
          env,
          "Pooled connection for runtime queries + direct connection for migrations/db push."
        ),
      ],
    },
    {
      group: "Discovery providers",
      checks: [
        optionalKey("Tavily web search", "TAVILY_API_KEY", env, "Powers agent discovery + search_web MCP tool."),
        optionalKey("Exa search", "EXA_API_KEY", env, "Neural search, deep research, intent monitors."),
        optionalKey(
          "Apify actors",
          "APIFY_TOKEN",
          env,
          "Google Maps local leads, site contact-detail extraction, Google search."
        ),
        optionalKey("Linkup deep research", "LINKUP_API_KEY", env, "Scheduled background research on contacts/entities."),
        optionalKey("Bright Data scraping", "BRIGHT_DATA_API_KEY", env, "Web Unlocker + SERP zones."),
      ],
    },
    {
      group: "Enrichment providers",
      checks: [
        alwaysOn("GLEIF (LEI registry)", [], "Public, CC0 data - no key required."),
        alwaysOn(
          "SEC EDGAR (US public companies)",
          [],
          "Public data - no key required. SEC_EDGAR_USER_AGENT is an optional override."
        ),
        optionalKey(
          "Companies House (UK)",
          "COMPANIES_HOUSE_API_KEY",
          env,
          "Free key required for UK company lookups."
        ),
        optionalKey("Explorium enrichment", "EXPLORIUM_API_KEY", env, "Business & prospect intelligence."),
        optionalKey("Pipe0 enrichment", "PIPE0_API_KEY", env, "70+ pipes across 50+ data providers."),
        optionalKey("Firecrawl site analysis", "FIRECRAWL_API_KEY", env, "Deep company-site crawling for contacts."),
        {
          name: "Email finder waterfall",
          status: anySet(env, ["ANYMAILFINDER_API_KEY", "FINDYMAIL_API_KEY"]) ? "pass" : "missing",
          vars: ["ANYMAILFINDER_API_KEY", "FINDYMAIL_API_KEY"],
          detail: anySet(env, ["ANYMAILFINDER_API_KEY", "FINDYMAIL_API_KEY"])
            ? "At least one finder configured (Anymailfinder and/or Findymail)."
            : "Not set (optional). Dormant until Anymailfinder or Findymail is configured.",
        },
        optionalKey(
          "Email verifier (Bouncer)",
          "BOUNCER_API_KEY",
          env,
          "Verifies waterfall candidates before an address is saved."
        ),
      ],
    },
    {
      group: "Agent runtime",
      checks: [
        optionalKey(
          "OpenAI (agent + embeddings)",
          "OPENAI_API_KEY",
          env,
          "Powers the Scalar agent, result refinement, and vector-memory embeddings."
        ),
      ],
    },
    {
      group: "Billing",
      checks: [
        (() => {
          const priceVars = ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO", "STRIPE_PRICE_BUSINESS", "STRIPE_PRICE_TEAM"];
          const vars = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", ...priceVars];
          if (!isSet(env, "STRIPE_SECRET_KEY")) {
            return {
              name: "Stripe billing",
              status: "missing" as CheckStatus,
              vars,
              detail: "Not set (optional). Checkout returns \"Billing is not configured yet\"; credit meter still runs on plan defaults.",
            };
          }
          const missing = missingOf(env, ["STRIPE_WEBHOOK_SECRET", ...priceVars]);
          if (missing.length === 0) {
            return { name: "Stripe billing", status: "pass" as CheckStatus, vars, detail: "Checkout, webhook, and all plan prices configured." };
          }
          return {
            name: "Stripe billing",
            status: "partial" as CheckStatus,
            vars,
            detail: `STRIPE_SECRET_KEY is set but missing ${missing.join(", ")}.`,
          };
        })(),
        (() => {
          const vars = ["X402_PAY_TO", "X402_NETWORK", "CDP_API_KEY_ID", "CDP_API_KEY_SECRET"];
          if (!isSet(env, "X402_PAY_TO")) {
            return {
              name: "x402 agent payments",
              status: "missing" as CheckStatus,
              vars,
              detail: "Not set (optional). Without X402_PAY_TO, /api/x402/topup and /api/x402/subscribe return 501.",
            };
          }
          const network = env.X402_NETWORK?.trim() || "base";
          const isMainnet = network === "base";
          if (isMainnet && !allSet(env, ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET"])) {
            return {
              name: "x402 agent payments",
              status: "partial" as CheckStatus,
              vars,
              detail: "X402_PAY_TO is set for mainnet (base) but CDP_API_KEY_ID/CDP_API_KEY_SECRET are missing; settlement will fail.",
            };
          }
          return {
            name: "x402 agent payments",
            status: "pass" as CheckStatus,
            vars,
            detail: `Configured for ${network}.`,
          };
        })(),
      ],
    },
    {
      group: "Rate limiting",
      checks: [
        allOrNothing(
          "Upstash Redis",
          ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
          env,
          "Required in production - without it, rate limits are per-serverless-instance and bypassable across autoscaled instances."
        ),
      ],
    },
    {
      group: "MCP auth",
      checks: [
        {
          name: "MCP OAuth signing secret",
          status: isSet(env, "MCP_OAUTH_SECRET")
            ? "pass"
            : isSet(env, "CLERK_SECRET_KEY")
              ? "partial"
              : "missing",
          vars: ["MCP_OAUTH_SECRET"],
          detail: isSet(env, "MCP_OAUTH_SECRET")
            ? "Distinct secret set."
            : isSet(env, "CLERK_SECRET_KEY")
              ? "Falling back to CLERK_SECRET_KEY - works, but shares signing material across two security contexts. Set a distinct MCP_OAUTH_SECRET."
              : "Not set, and no CLERK_SECRET_KEY fallback available - OAuth will throw at request time.",
        },
        {
          name: "Exa webhook secret",
          status: anySet(env, ["EXA_WEBHOOK_SECRET", "MCP_OAUTH_SECRET", "CLERK_SECRET_KEY"]) ? "pass" : "missing",
          vars: ["EXA_WEBHOOK_SECRET"],
          detail: isSet(env, "EXA_WEBHOOK_SECRET")
            ? "Explicit secret set."
            : anySet(env, ["MCP_OAUTH_SECRET", "CLERK_SECRET_KEY"])
              ? "Not set explicitly; derived from MCP_OAUTH_SECRET/CLERK_SECRET_KEY."
              : "Not set, and no base secret to derive from - the Exa monitor webhook will fail closed.",
        },
        optionalKey(
          "Inngest signing key",
          "INNGEST_SIGNING_KEY",
          env,
          "Required so the public /api/inngest route rejects forged invocations."
        ),
        optionalKey("Cron secret", "CRON_SECRET", env, "Bearer token protecting the provenance re-verify cron route."),
      ],
    },
  ];

  const summary = groups
    .flatMap((g) => g.checks)
    .reduce<DoctorSummary>(
      (acc, c) => {
        acc[c.status] += 1;
        acc.total += 1;
        return acc;
      },
      { pass: 0, missing: 0, partial: 0, total: 0 }
    );

  return { generatedAt: new Date().toISOString(), groups, summary };
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "PASS",
  missing: "MISSING",
  partial: "PARTIAL",
};

/** Render a DoctorReport as plain text for the CLI. */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("Scalar environment doctor");
  lines.push(`generated ${report.generatedAt}`);
  lines.push("");
  for (const group of report.groups) {
    lines.push(`== ${group.group} ==`);
    for (const check of group.checks) {
      const label = STATUS_LABEL[check.status].padEnd(7, " ");
      lines.push(`  [${label}] ${check.name}`);
      lines.push(`            ${check.detail}`);
    }
    lines.push("");
  }
  const s = report.summary;
  lines.push(
    `Summary: ${s.pass} pass, ${s.partial} partial, ${s.missing} missing (${s.total} checks total)`
  );
  return lines.join("\n");
}
