import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { ShimmeringText } from "@/components/shimmering-text";

export function CTASection() {
  return (
    <section className="bg-background px-4 pb-24 sm:pb-32">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[12px] border border-border bg-surface px-6 py-20 text-center sm:py-24">
        {/* ASCII: barely visible in light, more present in dark */}
        <AsciiField className="absolute inset-0 h-full w-full opacity-20 dark:opacity-50" speed={0.08} gradient />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(90,176,232,0.12),transparent_60%)]" />
        <div className="relative z-10">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Ready to run your{" "}
            <ShimmeringText
              text="agent CRM?"
              duration={2.4}
              className="align-baseline [--color:var(--primary)] [--shimmering-color:var(--foreground)]"
            />
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-fg-secondary">
            Connect your product context, point your agents at Scalar, and start building
            relationships that compound - on data that stays yours.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/sign-up"
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
              <ArrowRight className="h-4 w-4" strokeWidth={1.6} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-border bg-background px-5 text-base font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-foreground"
            >
              Talk to us
            </Link>
          </div>
          <p className="mt-4 text-xs text-fg-tertiary">No commitment. Free to start.</p>
        </div>
      </div>
    </section>
  );
}
