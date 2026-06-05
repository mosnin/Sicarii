import { BookOpen, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FloatIn } from "@/components/ui/float-in";

export default function ProductContextPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <FloatIn delay={0}>
        <h1 className="font-brand flex items-center gap-2 text-2xl sm:text-3xl text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </span>
          Product Context
        </h1>
        <p className="text-muted-foreground mt-1">
          A comprehensive, structured store of what you&apos;re selling — readable
          by every agent, so outreach is informed instead of generic.
        </p>
      </FloatIn>

      {/* Value pitch */}
      <FloatIn delay={0.06}>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Sparkles, label: "Agent-consumable", body: "Structured for machines and humans alike — every agent reads this before it acts." },
            { icon: BookOpen, label: "Single source of truth", body: "One canonical store of your positioning, ICP, and message fit." },
            { icon: Sparkles, label: "Informed outreach", body: "Agents sell with understanding, not generic copy." },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <FloatIn key={item.label} delay={0.1 + i * 0.06}>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="font-semibold text-foreground text-sm">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              </FloatIn>
            );
          })}
        </div>
      </FloatIn>

      {/* Empty state */}
      <FloatIn delay={0.22}>
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Build your product context next"
            description="This becomes an agent-consumable knowledge base your internal and connected agents read before they act. Coming in an upcoming cycle."
          />
        </Card>
      </FloatIn>
    </div>
  );
}
