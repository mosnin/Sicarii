// /welcome - the "Moment 1: The First Run" onboarding page.
// Shown to new users who have 0 entities and no productContext.
// Skippable via a quiet link; never shown twice once the first run completes.
//
// This is a server component that checks the redirect conditions, then
// renders the client component for the streaming UX.

import { redirect } from "next/navigation";
import { getDbUser } from "@/lib/server-user";
import { hasCompletedFirstRun } from "@/lib/welcome-orchestrator";
import { WelcomeClient } from "./welcome-client";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getDbUser();

  // Redirect to sign-in if not authenticated.
  if (!user) {
    redirect("/sign-in");
  }

  // Redirect to dashboard if the first run is already done.
  const done = await hasCompletedFirstRun(user.id);
  if (done) {
    redirect("/dashboard");
  }

  return <WelcomeClient firstName={user.firstName ?? undefined} />;
}
