"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

const easeOut = [0.16, 1, 0.3, 1] as const;

// The story, told straight: why Scalar exists. No invented history, no client
// counts, no team-size theater. Three beats and the principle that anchors them.
const story = [
  {
    eyebrow: "The problem",
    title: "Agents are brilliant at doing. Terrible at remembering.",
    body: [
      "An agent researches a company, drafts the outreach, finds the right person, and then forgets all of it. The output lands in scattered markdown files and loose notes: no schema, no dedup, no interface, no consistency.",
      "So it re-researches the same company twice. It contradicts itself. And you can't browse, query, or trust any of the work it already did. Agents without a real database are goldfish with PhDs.",
    ],
  },
  {
    eyebrow: "The answer",
    title: "Give the work a structured home.",
    body: [
      "Scalar is the place agent work lands and stays consistent: typed companies, contacts, deals, and emails in a real database, deduped and validated on the way in.",
      "And it comes with a real UI, so you can see, trust, edit, and navigate everything your agent did. Structure for the machine, an interface for the human, intelligence built into both.",
    ],
  },
  {
    eyebrow: "Agent-first",
    title: "Built for agents to operate, over MCP.",
    body: [
      "Scalar was built agent-first from day one. A secure MCP surface and per-user API keys mean your agent, whether that's Claude, OpenClaw, Hermes, or the built-in one, operates the CRM directly: discovering leads, enriching records, tracking deals, running email.",
      "Agents and humans go through the same operations layer, so there is never drift between what the agent does and what you see.",
    ],
  },
];

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative py-24 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-muted/40 dark:bg-charcoal-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="orange" className="mb-4">About</Badge>
            <h1 className="font-brand text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              The CRM your{" "}
              <span className="text-gradient-orange">agents run</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Scalar exists because agent work deserves a better home than a
              folder of markdown files. This is the why.
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4">
            <div className="space-y-20">
              {story.map((section, index) => (
                <motion.div
                  key={section.eyebrow}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.05, ease: easeOut }}
                >
                  <p className="text-xs uppercase tracking-[0.25em] text-orange/80">
                    {section.eyebrow}
                  </p>
                  <h2 className="font-brand mt-3 text-2xl text-foreground sm:text-3xl">
                    {section.title}
                  </h2>
                  {section.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 32)} className="mt-4 text-muted-foreground leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* The principle */}
        <section className="py-20 sm:py-28 bg-muted/30 dark:bg-charcoal-dark/30">
          <div className="mx-auto max-w-3xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: easeOut }}
              className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 sm:p-12 text-center"
            >
              <LogoMark className="mx-auto h-10 w-10" />
              <p className="mt-6 text-xs uppercase tracking-[0.25em] text-orange/80">
                The principle
              </p>
              <h2 className="font-brand mt-3 text-2xl text-foreground sm:text-3xl">
                A wrong answer is worse than{" "}
                <span className="text-gradient-orange">no answer</span>
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Enrichment must attach to the right person at the right company,
                verified, every time. If Scalar can&apos;t confirm a match, it
                returns nothing rather than a guess, and a miss is never charged.
                Accuracy beats coverage. That rule is the soul of the product:
                a CRM you can trust is the only kind worth having.
              </p>
              <Button variant="outline" className="mt-8" asChild>
                <Link href="/manifesto">
                  Read the manifesto <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-brand text-3xl text-foreground sm:text-4xl">
              Connect your agent. It just works.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Point your agent at Scalar over MCP, or use the built-in one, and
              watch your CRM fill itself.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button variant="glow" size="lg" asChild>
                <Link href="/sign-up">
                  Get Started <ArrowRight className="ml-1 h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/pricing">See Pricing</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
