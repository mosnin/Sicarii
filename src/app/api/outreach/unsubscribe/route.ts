// One-click unsubscribe (Card 0015).
//
// Every cold send carries List-Unsubscribe: <this-url>?send=<sendId> with
// List-Unsubscribe-Post (Gmail one-click). The send id is an unguessable uuid
// AND must pair with its recipient address — possession of the link proves
// receipt, so no session is needed (recipients aren't Scalar users).
//
// GET  ?send=<id> — minimal confirm form (human click-through).
// POST ?send=<id> — Gmail one-click posts here directly; applies suppression,
//   flips the contact's enrollments to unsubscribed, and 200s. Unknown ids
//   still 200 (never leak which sends exist) but change nothing.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function GET(req: NextRequest) {
  const sendId = new URL(req.url).searchParams.get("send") ?? "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head><body style="font-family:system-ui;max-width:480px;margin:64px auto;padding:0 16px">
<h1>Unsubscribe</h1>
<p>Stop all outreach emails from this sender.</p>
<form method="post" action="/api/outreach/unsubscribe?send=${encodeURIComponent(sendId)}">
<button type="submit" style="padding:10px 20px;cursor:pointer">Unsubscribe me</button>
</form></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

export async function POST(req: NextRequest) {
  try {
    const sendId = new URL(req.url).searchParams.get("send") ?? "";
    if (sendId) {
      const send = await prisma.outreachSend.findUnique({
        where: { id: sendId },
        select: { id: true, userId: true, toAddr: true, contactId: true, isWarmup: true },
      });
      if (send && !send.isWarmup && send.contactId) {
        await prisma.suppression.upsert({
          where: { userId_email: { userId: send.userId, email: send.toAddr } },
          create: { userId: send.userId, email: send.toAddr, reason: "unsubscribe", source: `one-click:${send.id}` },
          update: { reason: "unsubscribe", source: `one-click:${send.id}` },
        });
        await prisma.sequenceEnrollment.updateMany({
          where: { contactId: send.contactId, userId: send.userId, status: "active" },
          data: { status: "unsubscribed", stopReason: "unsubscribe" },
        });
      }
    }
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("text/html")) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head><body style="font-family:system-ui;max-width:480px;margin:64px auto;padding:0 16px"><h1>${escapeHtml("You're unsubscribed")}</h1><p>You won't receive further outreach emails from this sender.</p></body></html>`;
      return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
    }
    return NextResponse.json({ unsubscribed: true });
  } catch (e) {
    console.error("POST /api/outreach/unsubscribe", e);
    return NextResponse.json({ unsubscribed: true });
  }
}
