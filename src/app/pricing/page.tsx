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
import { ProposedPlans } from "@/components/marketing/proposed-plans";
import Border2 from "@/components/pixel-perfect/border2";



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
    blurb: "Test a small research task before committing to a paid workflow.",
    features: [
      "1 seat",
      "MCP access and the built-in agent",
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
      "MCP and agent access to supported actions",
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
    blurb: "For an operator doing deeper account research.",
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
    blurb: "For monitoring more accounts with a smaller research allowance.",
    features: [
      "1 seat",
      "Same core research tools; fewer credits than Pro",
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
  { action: "CRM reads and writes", credits: "0" },
  { action: "Web search", credits: "2" },
  { action: "Find a contact's LinkedIn", credits: "3" },
  { action: "Find a work email", credits: "8" },
  { action: "Find a phone number", credits: "12" },
  { action: "Discover companies from a prompt", credits: "12" },
  { action: "Deep report / analyze a site", credits: "8" },
  { action: "Enrich a company aspect", credits: "30" },
  { action: "Scheduled deep research run", credits: "18" },
];

function PriceTag({ plan }: { plan: Plan }) {
  if (plan.price === 0) {
    return <span className="font-brand text-5xl text-foreground">$0</span>;
  }

  return (
    <div className="flex flex-col items-center">

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

            <h1 className="font-brand text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Pricing that scales with{" "}
              <span className="text-[#24658f] dark:text-primary">your pipeline</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              A seat plus usage credits. You pay for the heavy lifting -
              discovery, enrichment, agent runs - as you create value, not for
              shelfware. Cancel anytime.
            </p>
          </div>
        </section>

        <ProposedPlans />
        <h2 className="font-brand mx-auto max-w-6xl px-6 pb-12 text-3xl">Current plan catalog</h2>
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
                      <>
                        <Border2 className="opacity-80" />
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge variant="default" className="bg-primary text-[#132b3a]">For research volume</Badge>
                        </div>
                      </>
                    )}
                    <CardHeader className="text-center">
                      <CardTitle className="font-brand text-xl">{plan.name}</CardTitle>
                      <div className="mt-4">
                        <PriceTag plan={plan} />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[#24658f] dark:text-primary">{plan.credits}</p>
                      <CardDescription className="mt-2">{plan.blurb}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                      <ul className="flex-1 space-y-3">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#24658f] dark:text-primary" />
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
                  Discuss provider setup, volume, workspace access and support requirements. Custom service commitments require a written agreement.
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
              <p className="text-xs uppercase tracking-[0.25em] text-[#24658f] dark:text-primary">How credits work</p>
              <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl">
                You only pay for the <span className="text-[#24658f] dark:text-primary">heavy lifting</span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                Credits are usage units, not cash or a guaranteed number of leads. CRM reads and writes are free. Research, enrichment and provider-backed agent work can consume credits.
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
                  <span className="font-brand text-[#24658f] dark:text-primary">
                    {row.credits} {row.credits === "1" ? "credit" : "credits"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Plan allowances reset on the account cycle. Check your balance and top-up terms in billing. A multi-step task can incur several charges; successful earlier steps remain chargeable even if a later step finds nothing.
            </p>
          </div>
        </section>

        {/* Interactive usage estimator */}
        <section className="pb-24 sm:pb-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-[#24658f] dark:text-primary">Estimate</p>
              <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl">
                Size it to <span className="text-[#24658f] dark:text-primary">your month</span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                Estimate selected research actions below. This is a partial workload estimate, not a quote; agent turns and other actions can add usage.
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
