"use client";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowUpRight, Globe, ShoppingCart, TrendingUp, Bot, Server } from "lucide-react";
import { motion } from "motion/react";

const caseStudies = [
  {
    title: "Luxury Fashion Store",
    client: "Maison Noir",
    service: "Ecommerce Store",
    icon: ShoppingCart,
    result: "3x conversion rate increase",
    description: "Built a high-end ecommerce platform with custom product visualization, seamless checkout, and inventory management for a luxury fashion brand.",
    tags: ["Ecommerce", "Shopify", "Custom Design"],
  },
  {
    title: "SaaS Analytics Platform",
    client: "DataPulse",
    service: "Web Application",
    icon: Globe,
    result: "10K+ users in 3 months",
    description: "Full-stack SaaS application with real-time analytics dashboards, user management, billing integration, and API access for enterprise clients.",
    tags: ["SaaS", "Dashboard", "API"],
  },
  {
    title: "Lead Generation System",
    client: "GrowthForge",
    service: "Funnels",
    icon: TrendingUp,
    result: "450% ROI on ad spend",
    description: "Multi-step sales funnel with A/B testing, email sequences, CRM integration, and detailed conversion tracking for a B2B marketing agency.",
    tags: ["Funnel", "CRM", "Email"],
  },
  {
    title: "Customer Support AI",
    client: "HelpStream",
    service: "AI Automation",
    icon: Bot,
    result: "70% ticket deflection",
    description: "AI-powered chatbot and workflow automation system that handles customer inquiries, routes complex issues, and generates support documentation.",
    tags: ["AI", "Chatbot", "Automation"],
  },
  {
    title: "Infrastructure Deployment",
    client: "CloudScale Labs",
    service: "Open Claw Deployment",
    icon: Server,
    result: "99.9% uptime achieved",
    description: "Full Open Claw deployment with custom configuration, monitoring dashboards, auto-scaling infrastructure, and 24/7 alert systems.",
    tags: ["DevOps", "Monitoring", "Infrastructure"],
  },
  {
    title: "Restaurant Ordering Platform",
    client: "TasteHub",
    service: "Web Application",
    icon: Globe,
    result: "200+ restaurants onboarded",
    description: "Multi-tenant ordering platform with restaurant dashboards, real-time order tracking, payment processing, and delivery management.",
    tags: ["Marketplace", "Real-time", "Payments"],
  },
];

const stats = [
  { value: "50+", label: "Projects Delivered" },
  { value: "98%", label: "Client Satisfaction" },
  { value: "35+", label: "Happy Clients" },
  { value: "4.9★", label: "Average Rating" },
];

export default function PortfolioPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative py-24 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-muted/40 dark:bg-charcoal-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90, 176, 232,0.12),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="orange" className="mb-4">Portfolio</Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Work that speaks{" "}
              <span className="text-gradient-orange">for itself</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              See how we&apos;ve helped businesses like yours launch, grow, and succeed
              with custom digital solutions.
            </p>
          </div>
        </section>

        {/* Stats Band */}
        <section className="py-12 border-y border-border bg-card/50">
          <div className="mx-auto max-w-5xl px-4 flex flex-wrap justify-center gap-12 sm:gap-16">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-orange sm:text-4xl">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Case Studies Grid */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {caseStudies.map((study, index) => {
                const Icon = study.icon;
                return (
                  <motion.div
                    key={study.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.08 }}
                  >
                    <Card className="group h-full hover:border-orange/40 transition-all duration-300">
                      <CardContent className="p-6 flex flex-col h-full">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange/10">
                            <Icon className="h-5 w-5 text-orange" />
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>

                        <Badge variant="secondary" className="w-fit mb-3 text-xs">
                          {study.service}
                        </Badge>

                        <h3 className="text-lg font-semibold">{study.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {study.client}
                        </p>

                        <p className="text-sm text-muted-foreground mt-3 flex-1">
                          {study.description}
                        </p>

                        <div className="mt-4 pt-4 border-t border-border">
                          <p className="text-sm font-semibold text-orange">{study.result}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {study.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 sm:py-32 bg-muted/30 dark:bg-charcoal-dark/30">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Ready to be our next success story?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Let&apos;s discuss your project and create something amazing together.
            </p>
            <Button variant="glow" size="lg" className="mt-8" asChild>
              <Link href="/contact">
                Start Your Project <ArrowRight className="ml-1 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
