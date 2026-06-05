"use client";

import { motion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const steps = [
  {
    title: "Connect",
    description:
      "Sign up, connect your domain and AgentMail key, and point Scalar at your product context. The agents have everything they need in minutes.",
  },
  {
    title: "Discover",
    description:
      "Tell the agent what you want - a company, a role, a list of sites. It finds contacts, pulls emails, and saves them straight into your CRM.",
  },
  {
    title: "Enrich",
    description:
      "Every record stays alive. Agents fill the gaps - title, company, socials - so your database compounds instead of rotting.",
  },
  {
    title: "Operate",
    description:
      "Run outreach through AgentMail, replay context on every reply, and watch every agent action in the audit log. Trust by design.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 bg-muted/40 py-24 dark:bg-charcoal-dark sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-orange/80">How it works</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            From first contact to <span className="text-gradient-orange">closed deal</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A calm, transparent process that keeps you in control the whole way through.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="h-full"
            >
              <SpotlightCard className="h-full p-6">
                <span className="font-brand text-3xl text-orange tabular-nums">
                  0{index + 1}
                </span>
                <h3 className="font-brand mt-3 text-xl text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
