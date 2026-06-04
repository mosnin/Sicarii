"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Shield, Users } from "lucide-react";
import { motion } from "motion/react";

const values = [
  {
    icon: Zap,
    title: "Speed & Quality",
    description: "We deliver fast without cutting corners. Every project goes through rigorous testing before launch.",
  },
  {
    icon: Shield,
    title: "Transparency",
    description: "Track every phase of your build. No black boxes — you always know exactly where your project stands.",
  },
  {
    icon: Users,
    title: "Partnership",
    description: "We're not just builders — we're partners. Direct communication, revision support, and ongoing collaboration.",
  },
];

export function AboutSection() {
  return (
    <section id="about" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          {/* Text content */}
          <div>
            <Badge variant="orange" className="mb-4">About Sicarii</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              A digital agency that puts{" "}
              <span className="text-gradient-orange">you in control</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Sicarii was built on a simple belief: clients deserve to
              see what&apos;s happening with their project at every step. No more
              waiting in the dark for updates. No more surprises.
            </p>
            <p className="mt-4 text-muted-foreground">
              From the moment you choose your service to the day we launch, you
              have full visibility into the process — plus direct messaging and
              revision support whenever you need it.
            </p>
            <Button variant="glow" size="lg" className="mt-8" asChild>
              <Link href="#services">
                Start Your Project
                <ArrowRight className="ml-1 h-5 w-5" />
              </Link>
            </Button>
          </div>

          {/* Values */}
          <div className="space-y-6">
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="flex gap-4 rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange/10">
                    <Icon className="h-5 w-5 text-orange" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{value.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {value.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
