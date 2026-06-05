"use client";

import Link from "next/link";
import { Radar, Users, Bot, BookOpen, ArrowRight } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { FloatIn } from "@/components/ui/float-in";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const quickLinks = [
  {
    href: "/discover",
    icon: Radar,
    title: "Discover",
    body: "Find and save contacts with built-in tools.",
  },
  {
    href: "/crm",
    icon: Users,
    title: "CRM",
    body: "Every contact your agents own and operate.",
  },
  {
    href: "/agent",
    icon: Bot,
    title: "Agent",
    body: "Chat to pull lists and enrich the database.",
  },
  {
    href: "/product-context",
    icon: BookOpen,
    title: "Context",
    body: "What you&apos;re selling — so agents sell with understanding.",
  },
];

interface DashboardOverviewProps {
  firstName?: string | null;
  total: number;
  active: number;
  won: number;
}

export function DashboardOverview({
  firstName,
  total,
  active,
  won,
}: DashboardOverviewProps) {
  const stats = [
    { label: "Contacts", value: total },
    { label: "In conversation", value: active },
    { label: "Won", value: won },
  ];

  return (
    <div className="space-y-8">
      {/* Header row */}
      <FloatIn delay={0} className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-brand text-3xl sm:text-4xl text-foreground">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1.5">
            Your agents are on it. Here&apos;s the state of your pipeline.
          </p>
        </div>
        <Button variant="glow" asChild>
          <Link href="/discover">
            <Radar className="mr-1.5 h-4 w-4" />
            Discover contacts
          </Link>
        </Button>
      </FloatIn>

      {/* Hero studio card */}
      <FloatIn delay={0.08}>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm min-h-[200px] flex flex-col justify-between p-7">
          {/* ASCII field background — low opacity, light-mode friendly */}
          <AsciiField
            className="absolute inset-0 h-full w-full opacity-[0.045]"
            cell={13}
          />
          {/* Subtle accent radial */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at bottom right, rgba(90,176,232,0.10) 0%, transparent 60%)",
            }}
          />
          <div className="relative z-10 flex flex-col gap-4">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary">
              Scalar // Pipeline overview
            </p>
            <div className="flex flex-wrap items-end gap-10">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="font-brand text-5xl sm:text-6xl text-foreground tabular-nums">
                    {s.value}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Bottom hairline accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(90,176,232,0.4) 50%, transparent)",
            }}
          />
        </div>
      </FloatIn>

      {/* Quick-link grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {quickLinks.map((q, i) => {
          const Icon = q.icon;
          return (
            <FloatIn key={q.href} delay={0.14 + i * 0.06}>
              <Link href={q.href} className="group block h-full">
                <SpotlightCard className="h-full border-border bg-card">
                  <div className="flex items-start gap-4 p-6">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold text-foreground">
                        {q.title}
                        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {q.body}
                      </p>
                    </div>
                  </div>
                </SpotlightCard>
              </Link>
            </FloatIn>
          );
        })}
      </div>
    </div>
  );
}
