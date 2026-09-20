"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, ChevronDown, Pause, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Category = "discovery" | "enrichment" | "outreach" | "other";
type Status = "draft" | "approved" | "active" | "paused" | "exhausted" | "completed";

export interface AutopilotPlanCardProps {
  plan: {
    id: string;
    name: string;
    cadence: string;
    status: Status;
    totalCredits: number;
    discoveryQuery: string | null;
    pausedReason: string | null;
    lastRunAt: Date | string | null;
    allocations: { category: Category; allocated: number; spent: number }[];
    runs: {
      id: string;
      category: Category;
      action: string;
      creditsSpent: number;
      summary: string | null;
      createdAt: Date | string;
    }[];
  };
  delay?: number;
}

const CATEGORY_LABEL: Record<Category, string> = {
  discovery: "Discovery",
  enrichment: "Enrichment",
  outreach: "Outreach",
  other: "Other",
};

const STATUS_STYLE: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-primary/10 text-primary",
  active: "bg-primary/10 text-primary",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  exhausted: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "bg-muted text-muted-foreground",
};

// The one dashboard surface for a budgeted autopilot plan: budget bars per
// category, the run ledger ("what your autopilot did"), and the two actions a
// human can take - Approve (draft/paused/exhausted -> active) and Pause
// (active/approved -> paused). Both POST to session-gated REST routes and
// then router.refresh() the server-rendered parent instead of managing local
// fetched state here.
export function AutopilotPlanCard({ plan, delay = 0 }: AutopilotPlanCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const canApprove = plan.status === "draft" || plan.status === "paused" || plan.status === "exhausted";
  const canPause = plan.status === "active" || plan.status === "approved";
  const totalSpent = plan.allocations.reduce((s, a) => s + a.spent, 0);

  async function act(action: "approve" | "pause") {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/autopilot-plans/${plan.id}/${action}`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setNote(d.error ?? `Couldn't ${action} the plan.`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-brand truncate text-base">{plan.name}</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {plan.cadence}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_STYLE[plan.status])}>
                {plan.status}
              </span>
            </div>
            {plan.discoveryQuery && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{plan.discoveryQuery}</p>
            )}
            {plan.pausedReason && (plan.status === "paused" || plan.status === "exhausted") && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{plan.pausedReason}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {totalSpent.toLocaleString()} / {plan.totalCredits.toLocaleString()} credits this window
              {plan.lastRunAt ? ` · last ran ${new Date(plan.lastRunAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canApprove && (
              <Button size="sm" onClick={() => act("approve")} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Approve
              </Button>
            )}
            {canPause && (
              <Button size="sm" variant="outline" onClick={() => act("pause")} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Pause className="mr-1.5 h-3.5 w-3.5" />}
                Pause
              </Button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-label="Budget and run history"
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </div>

        {note && <p className="px-5 pb-2 text-xs text-destructive">{note}</p>}

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-border"
            >
              <div className="space-y-4 p-5">
                <div className="space-y-3">
                  {plan.allocations.map((a) => (
                    <BudgetBar key={a.category} allocation={a} />
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    What your autopilot did
                  </p>
                  {plan.runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No runs yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {plan.runs.map((r) => (
                        <li key={r.id} className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-foreground">{r.summary ?? r.action}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {r.creditsSpent > 0 ? `${r.creditsSpent} credits` : "free"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">
                            {CATEGORY_LABEL[r.category]} · {new Date(r.createdAt).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function BudgetBar({ allocation }: { allocation: { category: Category; allocated: number; spent: number } }) {
  const pct = allocation.allocated > 0 ? Math.min(100, Math.round((allocation.spent / allocation.allocated) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{CATEGORY_LABEL[allocation.category]}</span>
        <span className="text-muted-foreground">
          {allocation.spent.toLocaleString()} / {allocation.allocated.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
