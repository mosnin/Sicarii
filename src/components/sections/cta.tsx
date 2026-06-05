import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AsciiField } from "@/components/dashboard/ascii-field";

export function CTASection() {
  return (
    <section className="bg-charcoal-dark px-4 pb-24 sm:pb-32">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-charcoal px-6 py-20 text-center sm:py-24">
        <AsciiField className="absolute inset-0 h-full w-full opacity-50" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(90,176,232,0.2),transparent_60%)]" />
        <div className="relative z-10">
          <h2 className="font-brand text-3xl text-white sm:text-4xl lg:text-5xl">
            Ready to run your <span className="text-gradient-orange">agent CRM?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">
            Connect your product context, point your agents at Scalar, and start building
            relationships that compound — on data that stays yours.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-full bg-orange px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange/25 transition-all hover:bg-orange-dark hover:shadow-orange/40"
            >
              Get Started
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-8 py-3.5 text-base font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
            >
              Talk to us
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/40">No commitment. Free to start.</p>
        </div>
      </div>
    </section>
  );
}
