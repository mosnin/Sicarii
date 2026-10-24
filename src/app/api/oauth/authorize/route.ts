import { getPublicOrigin } from "mcp-handler";

/**
 * The pre-PR #84 authorize endpoint issued a code the moment a signed-in
 * person hit the URL. Combined with open DCR on /api/oauth/register, that
 * was a one-click phishing grant: an attacker registered their own
 * redirect_uri, mailed a crafted /api/oauth/authorize link, and received a
 * live MCP token without any consent screen.
 *
 * New clients already land on /oauth/authorize (consent + account picker).
 * This route only still exists because old MCP clients and bookmarked
 * links keep calling it. Send them to the consent screen. Nothing is
 * minted here.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const dest = new URL("/oauth/authorize", getPublicOrigin(req));
  dest.search = url.search;
  return Response.redirect(dest.toString(), 302);
}
