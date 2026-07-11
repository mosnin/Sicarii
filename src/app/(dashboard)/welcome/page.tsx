// /welcome - the "Moment 1: The First Run" onboarding page.
// Shown to new users who have 0 entities and no productContext.
// Skippable via a quiet link; never shown twice once the first run completes.
//
// This is a server component that checks the redirect conditions, then
// renders the client component for the streaming UX.

import { redirect } from "next/navigation";
import { getDbUser } from "@/lib/server-user";
import { hasCompletedFirstRun } from "@/lib/welcome-orchestrator";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { WelcomeClient } from "./welcome-client";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getDbUser();

  // Redirect to sign-in if not authenticated.
  if (!user) {
    redirect("/sign-in");
  }

  // Redirect to dashboard if the first run is already done.
  // The first run is for humans; a team workspace context has no interview.
  if (user.accountType === "workspace") {
    redirect("/dashboard");
  }

  const done = await hasCompletedFirstRun(user.id);
  if (done) {
    redirect("/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Brand backdrop, matching the marketing surfaces. */}
      <AsciiField className="pointer-events-none fixed inset-0 h-full w-full opacity-[0.10] dark:opacity-25" cell={14} speed={0.07} gradient />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(90,176,232,0.12),transparent_55%)]" />
      <div className="relative z-10">
        <WelcomeClient firstName={user.firstName ?? undefined} />
      </div>
    </div>
  );
}
