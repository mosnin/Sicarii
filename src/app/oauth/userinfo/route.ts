import { bearerFromRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { authenticateOauthAccessToken, hasAnyScope, USERINFO_SCOPES } from "@/lib/oauth-server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Cache-Control": "no-store",
};

function unauthorized(description: string) {
  return Response.json(
    { error: "invalid_token", error_description: description },
    {
      status: 401,
      headers: {
        ...cors,
        "WWW-Authenticate": `Bearer error="invalid_token", error_description="${description}"`,
      },
    },
  );
}

/**
 * OIDC-style userinfo. Standard claims only, and only what Scalar can honestly
 * say: identity comes from Clerk, so name/picture/email are whatever the person
 * signed up with. `workspace` is a Scalar claim, not a standard one: it says
 * which account the token actually reads, which for a team member is the shared
 * workspace row rather than their personal one.
 *
 * Scope is enforced here, not just at issue time: a token without openid or
 * profile is refused even though it is perfectly valid elsewhere.
 */
export async function GET(req: Request) {
  const token = bearerFromRequest(req);
  if (!token) return unauthorized("A bearer access token is required");

  const ctx = await authenticateOauthAccessToken(token);
  if (!ctx) return unauthorized("The access token is unknown, expired or revoked");

  if (!hasAnyScope(ctx, USERINFO_SCOPES)) {
    return Response.json(
      {
        error: "insufficient_scope",
        error_description: `This endpoint requires one of: ${USERINFO_SCOPES.join(", ")}`,
      },
      {
        status: 403,
        headers: {
          ...cors,
          "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${USERINFO_SCOPES.join(" ")}"`,
        },
      },
    );
  }

  const [subject, account] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId } }),
    prisma.user.findUnique({ where: { id: ctx.accountId } }),
  ]);
  if (!subject || !account) return unauthorized("The account behind this token no longer exists");

  const name = [subject.firstName, subject.lastName].filter(Boolean).join(" ");
  const isWorkspace = account.accountType === "workspace";
  const membership = isWorkspace
    ? await prisma.teamMember.findUnique({
        where: { workspaceId_userId: { workspaceId: account.id, userId: subject.id } },
      })
    : null;

  const profile = ctx.scopes.includes("profile");
  const email = ctx.scopes.includes("email");

  return Response.json(
    {
      // Stable forever: the Scalar users row id, not the Clerk id, which can be
      // re-pointed, and not the email, which changes.
      sub: subject.id,
      ...(profile && name ? { name } : {}),
      ...(profile && subject.firstName ? { given_name: subject.firstName } : {}),
      ...(profile && subject.lastName ? { family_name: subject.lastName } : {}),
      ...(profile && subject.imageUrl ? { picture: subject.imageUrl } : {}),
      ...(profile ? { updated_at: Math.floor(subject.updatedAt.getTime() / 1000) } : {}),
      ...(email && subject.email ? { email: subject.email } : {}),
      workspace: {
        id: account.id,
        name: account.firstName ?? (isWorkspace ? "Team workspace" : name || account.email),
        type: isWorkspace ? "workspace" : "personal",
        role: isWorkspace ? (membership?.role ?? "member") : "owner",
      },
      scope: ctx.scopes.join(" "),
      client_id: ctx.clientId,
    },
    { headers: cors },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
