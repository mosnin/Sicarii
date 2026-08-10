// Recipient-facing one-click unsubscribe. PUBLIC (no auth): the person clicking
// is not a Scalar user. The signed token IS the authorization - it proves which
// tenant and which address the opt-out is for, and cannot be forged or aimed at
// a different address. GET renders a confirmation; POST is the one-click form
// bulk senders invoke via the List-Unsubscribe-Post header. Both record the
// opt-out (scope ALL) idempotently.
import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { recordOptOut } from "@/lib/suppression";

export const runtime = "nodejs";

async function apply(token: string | null): Promise<boolean> {
  if (!token) return false;
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return false;
  await recordOptOut(payload.userId, payload.email, "Unsubscribed via email link.");
  return true;
}

function page(ok: boolean): NextResponse {
  const body = ok
    ? "<h1>You are unsubscribed.</h1><p>You will not receive further email from this sender.</p>"
    : "<h1>Link expired or invalid.</h1><p>If you keep receiving mail, reply with the word remove.</p>";
  return new NextResponse(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">${body}</body>`, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  // A GET can be triggered by a mail client prefetching the link, which is fine:
  // recording an opt-out on prefetch errs safely toward not-sending.
  return page(await apply(req.nextUrl.searchParams.get("token")));
}

export async function POST(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("token") ?? (await req.text().catch(() => "")).match(/token=([^&]+)/)?.[1] ?? null;
  // decodeURIComponent throws URIError on malformed input (e.g. a bare "%").
  // This is a public route, so fail to a clean 400 rather than an unhandled 500.
  let token: string | null = null;
  try {
    token = raw ? decodeURIComponent(raw) : null;
  } catch {
    token = null;
  }
  const ok = await apply(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
