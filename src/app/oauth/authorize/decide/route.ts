import { prisma } from "@/lib/prisma";
import { getOptionalAuthContext } from "@/lib/auth-utils";
import { issueAuthorizationCode, verifyConsentTicket } from "@/lib/oauth-server";

export const dynamic = "force-dynamic";

/**
 * The consent screen's decision. Everything that matters is carried in the
 * HMAC-signed ticket the page issued, not in the form fields, so a cross-site
 * POST cannot approve a grant on a signed-in person's behalf: an attacker
 * cannot forge a ticket, and a stolen one only works for the human it was
 * rendered for.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return new Response("Expected a form submission", { status: 400 });

  const ticket = verifyConsentTicket(String(form.get("ticket") ?? ""));
  if (!ticket) {
    return new Response("This consent screen has expired. Start the connection again.", {
      status: 400,
    });
  }

  const auth = await getOptionalAuthContext();
  if (!auth) return new Response("Sign in and start the connection again.", { status: 401 });
  const { actor } = auth;
  // The ticket belongs to one human. Anyone else presenting it gets nothing.
  if (actor.id !== ticket.userId) {
    return new Response("This consent screen belongs to a different session.", { status: 403 });
  }

  const target = new URL(ticket.redirectUri);
  if (ticket.state) target.searchParams.set("state", ticket.state);

  if (String(form.get("decision")) !== "approve") {
    target.searchParams.set("error", "access_denied");
    return Response.redirect(target.toString(), 303);
  }

  // The account being exposed must be one this human may actually act for:
  // their own row, or a workspace they are a member of.
  const accountId = String(form.get("accountId") ?? "");
  let allowed = accountId === actor.id;
  if (!allowed && accountId) {
    const membership = await prisma.teamMember.findUnique({
      where: { workspaceId_userId: { workspaceId: accountId, userId: actor.id } },
    });
    allowed = Boolean(membership);
  }
  if (!allowed) return new Response("You cannot share that account.", { status: 403 });

  const code = await issueAuthorizationCode({
    clientRowId: ticket.clientRowId,
    userId: actor.id,
    accountId,
    scopes: ticket.scopes,
    redirectUri: ticket.redirectUri,
    codeChallenge: ticket.codeChallenge,
    resource: ticket.resource ?? null,
  });

  target.searchParams.set("code", code);
  return Response.redirect(target.toString(), 303);
}
