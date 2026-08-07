import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { startConnection } from "@/lib/connections";

export const runtime = "nodejs";

/** The origin this request actually arrived on, so the OAuth callback returns
 *  to the same deployment (preview, local, production) rather than a hardcoded
 *  production host that would strand every preview build. */
function originOf(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const host = req.headers.get("host") ?? "www.tryscalar.xyz";
  const forwarded = req.headers.get("x-forwarded-proto");
  const proto = forwarded ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// POST /api/connections/connect - start the OAuth handshake for one provider
// and hand back the consent URL for the browser to follow.
//
// Human-session only (getAuthenticatedUser resolves a Clerk session, never an
// agent API key). An agent must never be able to initiate a mailbox grant.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = await checkRateLimit(`connect:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    let body: { provider?: string };
    try {
      body = (await req.json()) as { provider?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.provider) {
      return NextResponse.json({ error: "provider is required" }, { status: 400 });
    }

    const result = await startConnection(
      user.id,
      body.provider,
      `${originOf(req)}/api/connections/callback`,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/connections/connect", e);
    return NextResponse.json({ error: "Failed to start the connection" }, { status: 500 });
  }
}
