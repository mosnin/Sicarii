import Link from "next/link";
import plans from "@/lib/website/proposed-plans.json";
export function ProposedPlans() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20">
      <h2 className="font-brand text-3xl">Proposed monthly plans</h2>
      <p className="mt-4 max-w-3xl text-muted-foreground">
        A clearer progression for individual operators and teams. These packages
        are under review and are not available to purchase. Current plans are
        listed below.
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <article
            key={p.name}
            className="rounded-3xl border border-border bg-card p-7"
          >
            <h3 className="font-brand text-2xl">{p.name}</h3>
            <p className="mt-5 font-brand text-4xl">
              ${p.price}
              <span className="text-sm text-muted-foreground"> / month</span>
            </p>
            <p className="mt-3 font-medium">
              {p.credits.toLocaleString("en-US")} credits / month
            </p>
            <p className="mt-4 text-muted-foreground">{p.for}</p>
            <ul className="mt-6 space-y-3">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link
              href="/demo"
              className="mt-8 inline-flex rounded-full border border-border px-5 py-3 font-medium"
            >
              Discuss {p.name}
            </Link>
          </article>
        ))}
      </div>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Proposed terms: USD, monthly billing, no annual commitment. Included
        credits reset each billing cycle. No automatic paid overages; optional
        top-ups require an explicit purchase. Taxes, if applicable, are
        additional. Cancellation stops the next renewal. Existing customers keep
        their agreed terms pending a separate migration.
      </p>
    </section>
  );
}
