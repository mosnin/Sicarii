import { prisma } from "@/lib/prisma";
import { getOptionalAuthContext } from "@/lib/auth-utils";
import { decideDeviceAuthorization, verifyDeviceTicket } from "@/lib/oauth-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return new Response("Expected a form submission", { status: 400 });
  const ticket = verifyDeviceTicket(String(form.get("ticket") ?? ""));
  if (!ticket) return new Response("This connection request has expired.", { status: 400 });
  const auth = await getOptionalAuthContext();
  if (!auth) return new Response("Sign in and start the connection again.", { status: 401 });
  const { actor } = auth;
  if (ticket.userId !== actor.id) return new Response("This connection belongs to a different session.", { status: 403 });

  const approve = String(form.get("decision")) === "approve";
  const accountId = String(form.get("accountId") ?? "");
  if (approve) {
    let allowed = accountId === actor.id;
    if (!allowed && accountId) {
      allowed = Boolean(
        await prisma.teamMember.findUnique({ where: { workspaceId_userId: { workspaceId: accountId, userId: actor.id } } }),
      );
    }
    if (!allowed) return new Response("You cannot share that account.", { status: 403 });
  }

  const decided = await decideDeviceAuthorization({
    deviceId: ticket.deviceId,
    userId: actor.id,
    accountId: approve ? accountId : actor.id,
    approve,
  });
  if (!decided) return new Response("This connection request is no longer active.", { status: 409 });
  return new Response(
    `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fff;color:#1c1c1c"><main style="max-width:420px;text-align:center;padding:32px"><div style="font-size:28px;font-weight:700"><span style="opacity:.45">]</span><span style="color:#5AB0E8">s</span><span style="opacity:.45">[</span> Scalar</div><h1>${approve ? "Mac connected" : "Connection denied"}</h1><p style="color:#737373;line-height:1.5">${approve ? "Return to Scalar for Mac. Your data will appear automatically." : "Nothing was shared. You can close this window."}</p></main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
