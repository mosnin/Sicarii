import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/services(.*)",
  "/pricing(.*)",
  "/portfolio(.*)",
  "/about(.*)",
  "/contact(.*)",
  "/manifesto(.*)",
  "/faq(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/api/webhooks(.*)",
  "/api/inngest(.*)",
  // MCP server + OAuth endpoints do their own auth (Bearer / OAuth / Clerk).
  "/api/mcp(.*)",
  "/api/oauth(.*)",
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
