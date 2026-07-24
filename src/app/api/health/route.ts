// Public health/env-doctor endpoint. Curl this after a deploy to see exactly
// what's configured and what's missing, without shell access to the server -
// the same report `pnpm doctor` prints locally, sourced from the same
// src/lib/env-doctor.ts so the two can never drift apart.
//
// Deliberately public (no auth): it's meant to be curled by whoever is
// closing the Reality Gate. It NEVER returns secret values - only per-
// integration boolean status, the env var NAMES involved, and a short
// secret-free explanation. See src/lib/env-doctor.ts for the check logic.
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { runEnvDoctor } from "@/lib/env-doctor";

// Always compute fresh from live process.env - never statically cached.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rateLimit = await checkRateLimit(`health:${ip}`, 30, 60_000);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const report = runEnvDoctor(process.env);
  const ok = report.summary.missing === 0 && report.summary.partial === 0;

  return NextResponse.json(
    { ok, ...report },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
