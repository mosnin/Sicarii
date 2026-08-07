import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { completeConnection } from "@/lib/connections";

export const runtime = "nodejs";

// GET /api/connections/callback - where Composio returns the operator's
// browser after consent.
//
// The `status=success` query param Composio appends is NOT trusted: by the
// time it reaches us it is just a string in a URL the user's browser can edit.
// completeConnection re-reads the connected account from Composio and only
// proceeds on a genuine ACTIVE, then stamps the forward-only cutoff and
// registers the polling triggers.
//
// `ref` is our own ConnectedAccount.id, round-tripped through the callbackUrl.
// It is ownership-checked against the session before anything happens, so a
// pasted ref for somebody else's connection resolves to a 404, not a takeover.
export async function GET(req: NextRequest) {
  const settings = new URL("/settings", req.nextUrl.origin);

  try {
    const user = await getAuthenticatedUser();
    const ref = req.nextUrl.searchParams.get("ref");
    const status = req.nextUrl.searchParams.get("status");

    if (!ref) {
      settings.searchParams.set("connection", "error");
      settings.searchParams.set("reason", "missing-reference");
      return NextResponse.redirect(settings);
    }

    if (status && status.toLowerCase() !== "success") {
      settings.searchParams.set("connection", "cancelled");
      return NextResponse.redirect(settings);
    }

    const connection = await completeConnection(user.id, ref);
    settings.searchParams.set("connection", "connected");
    settings.searchParams.set("provider", connection.provider);
    return NextResponse.redirect(settings);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (!(e instanceof OpError)) console.error("GET /api/connections/callback", e);
    settings.searchParams.set("connection", "error");
    settings.searchParams.set(
      "reason",
      e instanceof OpError ? e.message.slice(0, 200) : "Could not finish connecting",
    );
    return NextResponse.redirect(settings);
  }
}
