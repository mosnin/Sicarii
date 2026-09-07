import { convexAuthNextjsMiddleware, createRouteMatcher } from "@convex-dev/auth/nextjs/server";
import type { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing(.*)",
  "/about(.*)",
  "/contact(.*)",
  "/integrations(.*)",
  "/manifesto(.*)",
  "/faq(.*)",
  "/product(.*)",
  "/security(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/acceptable-use(.*)",
  "/cookies(.*)",
  "/subprocessors(.*)",
  "/dpa(.*)",
  "/refund-policy(.*)",
  "/api/webhooks(.*)",
  "/api/inngest(.*)",
  // Env-doctor report - safe to expose: booleans + env var names only, never
  // secret values. Meant to be curled after a deploy with no shell access.
  "/api/health(.*)",
  // MCP server and OAuth endpoints do their own authentication.
  "/api/mcp(.*)",
  "/api/oauth(.*)",
  // Company OS app resources enforce their own OAuth bearer scopes and must
  // return protocol errors, not browser sign-in redirects.
  "/api/company-os(.*)",
  // The OAuth 2.1 authorization server. The token, revoke, userinfo and
  // register endpoints authenticate themselves; /oauth/authorize is a page that
  // sends signed-out visitors to /sign-in itself, keeping its query intact so
  // they come back to the same authorization request.
  "/oauth(.*)",
  // x402 payment endpoints resolve the user from an API key or user session
  // themselves, and the payment proof is the X-PAYMENT header.
  "/api/x402(.*)",
  "/.well-known(.*)",
]);

const authHandler = convexAuthNextjsMiddleware(
  async (req, { convexAuth }) => {
    if (!isPublicRoute(req) && !(await convexAuth.isAuthenticated())) {
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("redirectTo", `${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(signIn);
    }
    return NextResponse.next();
  },
  {
    cookieConfig: { maxAge: 60 * 60 * 24 * 30 },
    // Company OS authorization requests also carry a `code` parameter. Only
    // consume codes on the browser routes used by Convex Auth itself.
    shouldHandleCode: (req) =>
      !req.nextUrl.pathname.startsWith("/oauth") &&
      !req.nextUrl.pathname.startsWith("/api") &&
      !req.nextUrl.pathname.startsWith("/.well-known"),
  }
);

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return authHandler(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
