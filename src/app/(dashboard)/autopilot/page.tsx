import Link from "next/link";
import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { Button } from "@/components/ui/button";
import { AutopilotPlanCard } from "@/components/dashboard/autopilot-plan-card";
import { getDbUser } from "@/lib/server-user";
import { listAutopilotPlans } from "@/lib/autopilot-operations";

export const dynamic = "force-dynamic";

// Server component: reads plans through the ops layer directly (no client
// fetch-on-mount round trip). The Approve/Pause buttons live in the client
// sub-component below and refresh this page's data via router.refresh().
export default async function AutopilotPage() {
  const user = await getDbUser();
  const plans = user ? await listAutopilotPlans(user.id) : [];

  return (
    <div className="space-y-5">
      <FloatIn>
        <div className="relative overflow-hidden rounded-[8px] border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-8">
            <p className="text-xs font-medium text-primary/80">Scalar // Autopilot</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Autopilot</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Scalar proposes a spend budget up front, split across discovery,
              enrichment, and outreach. Approve it once and it runs unsupervised
              on a schedule, hard-stopping cleanly at the cap instead of
              surprising you with an out-of-credits error mid-task.
            </p>
          </div>
        </div>
      </FloatIn>

      {plans.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">No autopilot plans yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask Scalar to propose a weekly budget for discovery and enrichment,
            then approve it here.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/agent">Talk to Scalar</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((p, i) => (
            <AutopilotPlanCard key={p.id} plan={p} delay={i * 0.05} />
          ))}
        </div>
      )}
    </div>
  );
}
