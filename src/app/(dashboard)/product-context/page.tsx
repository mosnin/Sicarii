import { BookOpen, Sparkles } from "lucide-react";
import { FloatIn } from "@/components/ui/float-in";
import { getDbUser } from "@/lib/server-user";
import { ProductContextEditor } from "@/components/dashboard/product-context-editor";

export const dynamic = "force-dynamic";

export default async function ProductContextPage() {
  const user = await getDbUser();

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
          A store of what you&apos;re selling — read by Scalar before every action, so
          outreach is informed instead of generic.
        </p>
      </FloatIn>

      {/* Value pitch */}
      <FloatIn delay={0.06}>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Sparkles, label: "Agent-consumable", body: "Scalar reads this before it acts — discovering, enriching, and writing." },
            { icon: BookOpen, label: "Single source of truth", body: "One canonical store of your positioning, ICP, and message fit." },
            { icon: Sparkles, label: "Informed outreach", body: "Agents sell with understanding, not generic copy." },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <FloatIn key={item.label} delay={0.1 + i * 0.06}>
                <div className="rounded-2xl bg-card p-5 shadow-sm">
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

      {/* Editor */}
      <ProductContextEditor initial={user?.productContext ?? ""} />
    </div>
  );
}
