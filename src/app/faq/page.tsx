"use client";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ChevronDown } from "lucide-react";
import * as Accordion from "@radix-ui/react-accordion";

const faqCategories = [
  {
    category: "Getting started",
    questions: [
      {
        q: "What is Scalar?",
        a: "Scalar is the CRM your agents run: structured storage, a real UI, and built-in intelligence in one system. Your AI agents discover leads, enrich records, track deals, and run email relationships, and the work lands in a clean, deduped database you can actually browse and trust, instead of rotting in scattered markdown files.",
      },
      {
        q: "Do I need to bring my own agent?",
        a: "No. Scalar ships with a built-in agent that can discover, enrich, and write your CRM from a chat. If you already run your own agent, connect it over MCP and it operates the same CRM through the same tools.",
      },
      {
        q: "Is there a free plan?",
        a: "Yes. The free tier includes 200 credits per month, one seat, MCP read access, the built-in agent, and all discovery and enrichment tools. Enough to feel your CRM fill itself before you pay anything.",
      },
    ],
  },
  {
    category: "Agents and MCP",
    questions: [
      {
        q: "How do I connect my agent?",
        a: "Any agent that speaks MCP works: Claude, OpenClaw, Hermes, or your own. Connect via OAuth, or generate an API key from Settings and point your agent at Scalar's MCP server. Once connected, it reads and writes your CRM immediately.",
      },
      {
        q: "What can a connected agent actually do?",
        a: "Everything the app can do: search and read records, create and update companies and contacts, run discovery and enrichment, and keep notes and context. Agents go through the same operations layer the UI uses, with dedup and validation on every write, so there is no drift between what your agent does and what you see.",
      },
    ],
  },
  {
    category: "Data and accuracy",
    questions: [
      {
        q: "Where does the enrichment data come from?",
        a: "Discovery and enrichment run on orchestrated best-in-class data providers. Scalar picks the right tool for each job, refines noisy results into real, deduped companies, and writes clean records into your CRM. We orchestrate providers; we do not sell data.",
      },
      {
        q: "What happens if Scalar can't verify a match?",
        a: "It returns nothing. Scalar never attaches data for the wrong person or company: every lookup verifies the name and the company or domain before saving, and a same-name stranger is treated as a miss, not a match. A wrong value is worse than no value, and a miss is never charged.",
      },
      {
        q: "Who owns my data?",
        a: "You do. Your CRM is a single source of truth you control: isolated per user, never resold, and never used to train models. Enrichment flows in; your data does not leak out.",
      },
    ],
  },
  {
    category: "Pricing and billing",
    questions: [
      {
        q: "How does pricing work?",
        a: "A seat plus usage credits, where 1 credit = $0.01. Reading and writing your CRM is free; you spend credits only when an agent pulls real data from the outside world, like discovery, enrichment, or deep research. Your cost scales with your pipeline, not with shelfware seats, and you can cancel anytime.",
      },
      {
        q: "What happens when I run out of credits?",
        a: "Paid plans reset their credits monthly, and you can top up anytime if you need more before the reset. You are only charged when a lookup actually returns verified data, never for a miss.",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative py-24 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-muted/40 dark:bg-charcoal-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="orange" className="mb-4">FAQ</Badge>
            <h1 className="font-brand text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Frequently asked{" "}
              <span className="text-gradient-orange">questions</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to know about Scalar. Can&apos;t find what
              you&apos;re looking for? Reach out to us directly.
            </p>
          </div>
        </section>

        {/* FAQ Sections */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4">
            <div className="space-y-12">
              {faqCategories.map((category) => (
                <div key={category.category}>
                  <h2 className="font-brand text-xl text-foreground mb-4">{category.category}</h2>
                  <Accordion.Root type="single" collapsible className="space-y-2">
                    {category.questions.map((item, i) => (
                      <Accordion.Item
                        key={i}
                        value={`${category.category}-${i}`}
                        className="rounded-xl border border-border overflow-hidden"
                      >
                        <Accordion.Trigger className="flex w-full items-center justify-between p-4 text-left text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer group [&[data-state=open]>svg]:rotate-180">
                          {item.q}
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
                        </Accordion.Trigger>
                        <Accordion.Content className="overflow-hidden data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
                          <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                            {item.a}
                          </div>
                        </Accordion.Content>
                      </Accordion.Item>
                    ))}
                  </Accordion.Root>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20 bg-muted/30 dark:bg-charcoal-dark/30">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-brand text-2xl text-foreground">Still have questions?</h2>
            <p className="mt-3 text-muted-foreground">
              We&apos;re here to help. Reach out and we&apos;ll get back to you within 24 hours.
            </p>
            <Button variant="glow" size="lg" className="mt-6" asChild>
              <Link href="/contact">
                Contact Us <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
