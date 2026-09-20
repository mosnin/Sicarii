import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";

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
  // MCP server + OAuth endpoints do their own auth (Bearer / OAuth / Clerk).
  "/api/mcp(.*)",
  "/api/oauth(.*)",
  // The OAuth 2.1 authorization server. The token, revoke, userinfo and
  // register endpoints authenticate themselves; /oauth/authorize is a page that
  // sends signed-out visitors to /sign-in itself, keeping its query intact so
  // they come back to the same authorization request.
  "/oauth(.*)",
  // x402 payment endpoints resolve the user from an API key or Clerk session
  // themselves, and the payment proof is the X-PAYMENT header.
  "/api/x402(.*)",
  "/.well-known(.*)",
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Send signed-out users to /sign-in (instead of a 404). The redirect URL
    // is hardcoded because the deployment's env vars are integration-managed.
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
    });
  }
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
