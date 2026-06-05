import { FloatIn } from "@/components/ui/float-in";
import { getDbUser } from "@/lib/server-user";
import { ProductContextEditor } from "@/components/dashboard/product-context-editor";
import { AsciiField } from "@/components/dashboard/ascii-field";

export const dynamic = "force-dynamic";

const PILLARS = [
  { n: "01", label: "Agent-consumable", body: "Scalar reads this before it acts, discovering, enriching, and writing." },
  { n: "02", label: "Single source of truth", body: "One canonical store of your positioning, ICP, and message fit." },
  { n: "03", label: "Informed outreach", body: "Agents sell with understanding, not generic copy." },
];

export default async function ProductContextPage() {
  const user = await getDbUser();

  return (
    <div className="space-y-8">
      {/* Hero with the signature ASCII field behind it */}
      <FloatIn delay={0}>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-6 py-10 sm:px-10 sm:py-14">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">
              Scalar // Context
            </p>
            <h1 className="font-brand mt-2 text-3xl text-foreground sm:text-4xl">
              Product Context
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              A store of what you&apos;re selling, read by Scalar before every action,
              so outreach is informed instead of generic. The better this is, the
              sharper every agent touch becomes.
            </p>
          </div>
        </div>
      </FloatIn>

      {/* Pillars */}
      <FloatIn delay={0.08}>
        <div className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((item, i) => (
            <FloatIn key={item.label} delay={0.12 + i * 0.06}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
                <span className="font-brand text-xs tabular-nums text-primary/70">{item.n}</span>
                <p className="mt-2 font-brand text-base text-foreground">{item.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </FloatIn>
          ))}
        </div>
      </FloatIn>

      {/* Editor */}
      <FloatIn delay={0.2}>
        <ProductContextEditor initial={user?.productContext ?? ""} />
      </FloatIn>
    </div>
  );
}
