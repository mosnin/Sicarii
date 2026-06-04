"use client";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, ArrowRight, Minus } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Starter",
    price: "$1,200",
    description: "Perfect for landing pages, funnels, and single-purpose sites.",
    features: [
      { name: "1 project", included: true },
      { name: "Custom design", included: true },
      { name: "Responsive & mobile-first", included: true },
      { name: "Basic SEO setup", included: true },
      { name: "1 round of revisions", included: true },
      { name: "14-day delivery", included: true },
      { name: "CMS integration", included: false },
      { name: "Advanced animations", included: false },
      { name: "Priority support", included: false },
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Professional",
    price: "$2,500",
    description: "For businesses that need a complete web application or store.",
    features: [
      { name: "1 project", included: true },
      { name: "Custom design", included: true },
      { name: "Responsive & mobile-first", included: true },
      { name: "Full SEO optimization", included: true },
      { name: "3 rounds of revisions", included: true },
      { name: "21-day delivery", included: true },
      { name: "CMS integration", included: true },
      { name: "Advanced animations", included: true },
      { name: "Priority support", included: false },
    ],
    cta: "Get Started",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For complex projects with advanced requirements and ongoing support.",
    features: [
      { name: "Unlimited projects", included: true },
      { name: "Custom design system", included: true },
      { name: "Responsive & mobile-first", included: true },
      { name: "Full SEO optimization", included: true },
      { name: "Unlimited revisions", included: true },
      { name: "Custom timeline", included: true },
      { name: "CMS integration", included: true },
      { name: "Advanced animations", included: true },
      { name: "Priority support", included: true },
    ],
    cta: "Contact Us",
    popular: false,
  },
];

const comparisonFeatures = [
  { name: "Custom Design", starter: true, professional: true, enterprise: true },
  { name: "Responsive Build", starter: true, professional: true, enterprise: true },
  { name: "SEO Optimization", starter: "Basic", professional: "Full", enterprise: "Full + Audit" },
  { name: "Revision Rounds", starter: "1", professional: "3", enterprise: "Unlimited" },
  { name: "Delivery Timeline", starter: "14 days", professional: "21 days", enterprise: "Custom" },
  { name: "CMS Integration", starter: false, professional: true, enterprise: true },
  { name: "Payment Integration", starter: false, professional: true, enterprise: true },
  { name: "API Integrations", starter: false, professional: "Up to 3", enterprise: "Unlimited" },
  { name: "Post-Launch Support", starter: "7 days", professional: "30 days", enterprise: "90 days" },
  { name: "Priority Support", starter: false, professional: false, enterprise: true },
  { name: "Dedicated Account Manager", starter: false, professional: false, enterprise: true },
];

function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="h-4 w-4 text-orange mx-auto" />
    ) : (
      <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" />
    );
  }
  return <span className="text-sm">{value}</span>;
}

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative py-24 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-charcoal-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30, 77, 43,0.12),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="orange" className="mb-4">Pricing</Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Transparent pricing,{" "}
              <span className="text-gradient-orange">no surprises</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Pick the plan that fits your project. Every plan includes design,
              development, testing, and launch support.
            </p>
          </div>
        </section>

        {/* Plan Cards */}
        <section className="py-16 sm:py-20 -mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <Card
                    className={cn(
                      "relative h-full flex flex-col",
                      plan.popular && "border-orange shadow-lg shadow-orange-glow/10"
                    )}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge variant="default" className="bg-orange text-white">
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="text-center">
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <div className="mt-4">
                        <span className="text-4xl font-bold">{plan.price}</span>
                        {plan.price !== "Custom" && (
                          <span className="text-muted-foreground text-sm ml-1">/ project</span>
                        )}
                      </div>
                      <CardDescription className="mt-2">
                        {plan.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <ul className="space-y-3 flex-1">
                        {plan.features.map((feature) => (
                          <li key={feature.name} className="flex items-center gap-2.5 text-sm">
                            {feature.included ? (
                              <Check className="h-4 w-4 shrink-0 text-orange" />
                            ) : (
                              <Minus className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                            )}
                            <span className={!feature.included ? "text-muted-foreground/60" : ""}>
                              {feature.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={plan.popular ? "glow" : "outline"}
                        className="w-full mt-8"
                        asChild
                      >
                        <Link href={plan.price === "Custom" ? "/contact" : "/sign-up"}>
                          {plan.cta}
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-center mb-8">Compare Plans</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 pr-4 font-medium text-muted-foreground w-1/4">Feature</th>
                    <th className="text-center py-3 px-4 font-medium w-1/4">Starter</th>
                    <th className="text-center py-3 px-4 font-medium text-orange w-1/4">Professional</th>
                    <th className="text-center py-3 px-4 font-medium w-1/4">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feature, i) => (
                    <tr key={feature.name} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                      <td className="py-3 pr-4 font-medium">{feature.name}</td>
                      <td className="py-3 px-4 text-center"><FeatureCell value={feature.starter} /></td>
                      <td className="py-3 px-4 text-center"><FeatureCell value={feature.professional} /></td>
                      <td className="py-3 px-4 text-center"><FeatureCell value={feature.enterprise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ CTA */}
        <section className="py-16 sm:py-20 bg-charcoal-dark/30">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-2xl font-bold">Have questions about pricing?</h2>
            <p className="mt-3 text-muted-foreground">
              Check our FAQ or reach out — we&apos;re happy to help you find the right plan.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button variant="outline" asChild>
                <Link href="/faq">View FAQ</Link>
              </Button>
              <Button variant="glow" asChild>
                <Link href="/contact">Talk to Us <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
