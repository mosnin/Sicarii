"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import {
  IllustrationFrame,
  AuditTrail,
} from "@/components/marketing/illustrations";

const easeOut = [0.16, 1, 0.3, 1] as const;

// Trust stated plainly. Every claim here maps to something real in the
// product: per-user scoping, ownership checks on every operation, the accuracy
// rule, export and delete. No certifications we don't hold, no theater.
const pillars = [
  {
    eyebrow: "Isolation",
    title: "Your data is walled off, per account.",
    body: "Every record is scoped to your account, and every operation, whether it comes from the UI, the API, or an agent over MCP, runs through the same ownership checks. One account can never read or write another's data. There is no shared pool of customer records.",
  },
  {
    eyebrow: "Ownership",
    title: "You own it, and you can take it with you.",
    body: "Your CRM is a single source of truth you control. Enrichment flows in; your data does not leak out. We never sell it, and we never use it to train models for other customers. Export your full database whenever you want, and deleting a record or your account removes it.",
  },
  {
    eyebrow: "Accuracy",
    title: "A wrong answer is worse than no answer.",
    body: "Enrichment only saves data that matches the right person at the right company, verified by name and company or domain. If we can't confirm a match, we return nothing instead of a guess, and a miss is never charged. Accuracy is a security property: it keeps the wrong person's data out of your database.",
  },
  {
    eyebrow: "Access",
    title: "Agents get keys, not the master lock.",
    body: "Connect an agent with per-user API keys or OAuth, each scoped to your account and revocable at any time. High-stakes actions like sending email require confirmation, and rate limits keep automated access in check. Trust by construction, not by lockdown.",
  },
];

const practices = [
  "Encryption in transit across the application and APIs.",
  "Authentication handled by Clerk; we never store your password.",
  "Payments processed by Stripe; we never store full card numbers.",
  "Ownership checks on every read and write, in UI, API, and agent paths.",
  "Per-user API keys, revocable, with rate limiting on automated access.",
  "A published list of every subprocessor that touches your data.",
];

export default function SecurityPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 sm:py-32">
          <div className="absolute inset-0 bg-surface" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="primary" className="mb-4">Security &amp; Trust</Badge>
            <h1 className="font-semibold tracking-tight text-4xl text-foreground sm:text-5xl lg:text-6xl">
              Your data, <span className="text-gradient-orange">yours alone</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Scalar is built so the data your agents produce stays consistent,
              private, and under your control. Here is exactly how.
            </p>
          </div>
        </section>

        <IllustrationFrame
          claim="Every write is on the record, with the source attached."
          detail="Who changed what, when, and which provider it came from. Your agent works in the open, not in a black box."
        >
          <AuditTrail />
        </IllustrationFrame>

        {/* Pillars */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4">
            <div className="space-y-20">
              {pillars.map((pillar, index) => (
                <motion.div
                  key={pillar.eyebrow}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: index * 0.05, ease: easeOut }}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-tertiary">
                    {pillar.eyebrow}
                  </p>
                  <h2 className="font-semibold tracking-tight mt-3 text-2xl text-foreground sm:text-3xl">
                    {pillar.title}
                  </h2>
                  <p className="mt-4 leading-relaxed text-muted-foreground">{pillar.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Practices */}
        <section className="py-20 sm:py-28 bg-surface">
          <div className="mx-auto max-w-3xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, ease: easeOut }}
              className="relative overflow-hidden rounded-[12px] border border-border bg-background p-8 sm:p-12"
            >
              <LogoMark className="h-10 w-10" />
              <p className="mt-6 text-xs font-medium uppercase tracking-wide text-fg-tertiary">
                The practices
              </p>
              <h2 className="font-semibold tracking-tight mt-3 text-2xl text-foreground sm:text-3xl">
                What we do, in plain terms
              </h2>
              <ul className="mt-8 space-y-4">
                {practices.map((item) => (
                  <li key={item} className="flex gap-3 text-muted-foreground">
                    <span className="mt-2.5 h-px w-4 shrink-0 bg-primary/60" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-sm text-muted-foreground">
                Found a vulnerability? Report it to{" "}
                <a href="mailto:hello@tryscalar.xyz" className="text-primary hover:text-primary/80">
                  hello@tryscalar.xyz
                </a>{" "}
                and we will respond quickly.
              </p>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-semibold tracking-tight text-3xl text-foreground sm:text-4xl">
              A CRM you can trust is the only kind worth having.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Read how we handle data, or start building your database today.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" asChild>
                <Link href="/sign-up">
                  Get Started <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/privacy">Read the Privacy Policy</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
