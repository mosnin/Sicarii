import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { getDbUser } from "@/lib/server-user";
import { ProductContextEditor } from "@/components/dashboard/product-context-editor";

export const dynamic = "force-dynamic";

const PILLARS = [
  { n: "01", label: "Agent-consumable", body: "Scalar reads this before it acts, discovering, enriching, and writing." },
  { n: "02", label: "Single source of truth", body: "One canonical store of your positioning, ICP, and message fit." },
  { n: "03", label: "Informed outreach", body: "Agents sell with understanding, not generic copy." },
];

export default async function ProductContextPage() {
  const user = await getDbUser();

  return (
    <div className="space-y-5">
      {/* Header */}
      <FloatIn delay={0}>
        <div className="relative overflow-hidden rounded-[8px] border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-8">
            <p className="text-xs font-medium text-primary/80">Scalar // Context</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Product Context</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              A store of what you&apos;re selling, read by Scalar before every action,
              so outreach is informed instead of generic. The better this is, the
              sharper every agent touch becomes.
            </p>
          </div>
        </div>
      </FloatIn>

      {/* Pillars */}
      <FloatIn delay={0.04}>
        <div className="grid gap-2 sm:grid-cols-3">
          {PILLARS.map((item) => (
            <div key={item.label} className="h-full rounded-[8px] border border-border bg-card p-3">
              <span className="twenty-label tabular-nums">{item.n}</span>
              <p className="mt-1 text-sm font-medium text-foreground">{item.label}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </FloatIn>

      {/* Editor */}
      <FloatIn delay={0.08}>
        <ProductContextEditor initial={user?.productContext ?? ""} />
      </FloatIn>
    </div>
  );
}
