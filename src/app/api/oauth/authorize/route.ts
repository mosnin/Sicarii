import { auth } from "@clerk/nextjs/server";
import { getPublicOrigin } from "mcp-handler";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { signAuthCode } from "@/lib/oauth";

function isValidUrl(u: string): boolean {
  try { new URL(u); return true; } catch { return false; }
}

// OAuth 2.1 authorization endpoint (PKCE required). Identity comes from Clerk:
// if the user isn't signed in, bounce to /sign-in and return here afterward.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const origin = getPublicOrigin(req);

  const redirectUri = p.get("redirect_uri");
  const state = p.get("state");
  const clientId = p.get("client_id") ?? "";
  const codeChallenge = p.get("code_challenge");
  const method = p.get("code_challenge_method");
  const responseType = p.get("response_type");
  const scope = p.get("scope") ?? "mcp";

  if (!redirectUri || !isValidUrl(redirectUri)) {
    return new Response("Invalid redirect_uri", { status: 400 });
  }
  const fail = (code: string, desc?: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", code);
    if (desc) u.searchParams.set("error_description", desc);
    if (state) u.searchParams.set("state", state);
    return Response.redirect(u.toString(), 302);
  };
  if (responseType !== "code") return fail("unsupported_response_type");
  if (!codeChallenge || method !== "S256") return fail("invalid_request", "PKCE S256 is required");

  // Require a signed-in Scalar user; otherwise send them through Clerk and back.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    const signIn = new URL("/sign-in", origin);
    signIn.searchParams.set("redirect_url", req.url);
    return Response.redirect(signIn.toString(), 302);
  }
  const user = await getAuthenticatedUser();

  const code = await signAuthCode({
    sub: user.id,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope,
  });

  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  return Response.redirect(back.toString(), 302);
}
