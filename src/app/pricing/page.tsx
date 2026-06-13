"use client";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { UsageEstimator } from "@/components/marketing/usage-estimator";

// Launch sale: list price is 2x the live price, struck through. Set SALE=false
// to end it (prices then show at their live value with no strike-through).
const SALE = true;

type Plan = {
  name: string;
  price: number; // live monthly price (USD)
  credits: string;
  blurb: string;
  features: string[];
  cta: string;
  href: string;
  popular?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    price: 0,
    credits: "200 credits / mo",
    blurb: "Kick the tires. Feel your CRM fill itself, once.",
    features: [
      "1 seat",
      "Full MCP + the built-in agent",
      "All discovery & enrichment tools",
      "Community support",
    ],
    cta: "Start free",
    href: "/sign-up",
  },
  {
    name: "Starter",
    price: 39,
    credits: "3,000 credits / mo",
    blurb: "For one operator running an agent.",
    features: [
      "1 seat",
      "Full MCP + agent (read & write)",
      "All enrichment, discovery & deep research",
      "1 scheduled monitor",
      "Top-up credits at $0.012 each",
      "Email support",
    ],
    cta: "Get Starter",
    href: "/sign-up?plan=starter",
  },
  {
    name: "Pro",
    price: 129,
    credits: "12,000 credits / mo",
    blurb: "For power users compounding a real pipeline.",
    features: [
      "1 seat",
      "Everything in Starter",
      "10 scheduled monitors",
      "Multiple API keys for your agents",
      "Priority support",
    ],
    cta: "Get Pro",
    href: "/sign-up?plan=pro",
    popular: true,
  },
  {
    name: "Business",
    price: 99,
    credits: "8,000 credits / mo",
    blurb: "For running a wall of monitors on autopilot.",
    features: [
      "1 seat",
      "Everything in Pro",
      "25 scheduled monitors",
      "Priority support",
    ],
    cta: "Get Business",
    href: "/sign-up?plan=business",
  },
];

// What a credit buys. Credits are denominated in cents (1 credit = $0.01) and
// every action is priced at roughly 3x its underlying provider cost, so usage
// is always margin-positive. CRM reads/writes are free.
const creditCosts: { action: string; credits: string }[] = [
  { action: "Agent turn / CRM read & write", credits: "1" },
  { action: "Web search", credits: "2" },
  { action: "Find a contact's LinkedIn", credits: "3" },
  { action: "Find a verified work email", credits: "8" },
  { action: "Find a verified phone", credits: "12" },
  { action: "Discover companies from a prompt", credits: "12" },
  { action: "Deep report / analyze a site", credits: "8" },
  { action: "Enrich a company aspect", credits: "30" },
  { action: "Scheduled deep research run", credits: "18" },
];

function PriceTag({ plan }: { plan: Plan }) {
  if (plan.price === 0) {
    return <span className="font-brand text-5xl text-foreground">$0</span>;
  }
  const list = plan.price * 2;
  return (
    <div className="flex flex-col items-center">
      {SALE && (
        <span className="text-sm text-muted-foreground line-through">${list}</span>
      )}
      <div className="flex items-baseline gap-1">
        <span className="font-brand text-5xl text-foreground">${plan.price}</span>
        <span className="text-sm text-muted-foreground">/mo</span>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 sm:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_55%)]" />
          <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
            {SALE && (
              <Badge variant="primary" className="mb-4">Launch sale: 50% off</Badge>
            )}
            <h1 className="font-brand text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Pricing that scales with{" "}
              <span className="text-gradient-orange">your pipeline</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              A seat plus usage credits. You pay for the heavy lifting -
              discovery, enrichment, agent runs - as you create value, not for
              shelfware. Cancel anytime.
            </p>
          </div>
        </section>

        {/* Plan cards */}
        <section className="-mt-8 pb-8">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                >
                  <Card
                    className={cn(
                      "relative flex h-full flex-col",
                      plan.popular && "border-primary shadow-lg shadow-[0_8px_40px_-8px_rgba(90,176,232,0.35)]",
                    )}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge variant="default" className="bg-primary text-primary-foreground">Most popular</Badge>
                      </div>
                    )}
                    <CardHeader className="text-center">
                      <CardTitle className="font-brand text-xl">{plan.name}</CardTitle>
                      <div className="mt-4">
                        <PriceTag plan={plan} />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-primary">{plan.credits}</p>
                      <CardDescription className="mt-2">{plan.blurb}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                      <ul className="flex-1 space-y-3">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={plan.popular ? "glow" : "outline"}
                        className="mt-8 w-full"
                        asChild
                      >
                        <Link href={plan.href}>
                          {plan.cta}
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Enterprise strip */}
            <div className="mt-6 rounded-3xl border border-border bg-card p-6 text-center sm:flex sm:items-center sm:justify-between sm:text-left">
              <div>
                <p className="font-brand text-lg text-foreground">Enterprise</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bring your own provider keys (cost pass-through, cheaper
                  credits), volume pricing, SSO, and an SLA.
                </p>
              </div>
              <Button variant="outline" className="mt-4 sm:mt-0" asChild>
                <Link href="/contact">Talk to us <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </section>

        {/* How credits work */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-primary">How credits work</p>
              <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl">
                You only pay for the <span className="text-gradient-orange">heavy lifting</span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                1 credit = $0.01. Reading and writing your CRM is free; you spend
                credits only when an agent pulls real data from the outside world.
              </p>
            </div>
            <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-card">
              {creditCosts.map((row, i) => (
                <div
                  key={row.action}
                  className={cn(
                    "flex items-center justify-between px-6 py-3.5 text-sm",
                    i !== 0 && "border-t border-border/70",
                  )}
                >
                  <span className="text-foreground">{row.action}</span>
                  <span className="font-brand text-primary">
                    {row.credits} {row.credits === "1" ? "credit" : "credits"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Run out? Top up anytime, or your plan resets monthly. You are only
              charged when a lookup actually returns data, never for a miss.
            </p>
          </div>
        </section>

        {/* Interactive usage estimator */}
        <section className="pb-24 sm:pb-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-primary">Estimate</p>
              <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl">
                Size it to <span className="text-gradient-orange">your month</span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                Drag the sliders for the work your agents do. We will add up the
                credits and point you at the plan that fits.
              </p>
            </div>
            <div className="mt-12">
              <UsageEstimator />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
