"use client";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqCategories = [
  {
    category: "Getting Started",
    questions: [
      {
        q: "How does the process work?",
        a: "It's simple: choose a service, create your account, complete a quick onboarding form with your project details, and submit payment. Once confirmed, you'll get access to your project dashboard where you can track every phase of the build in real-time.",
      },
      {
        q: "How long does a typical project take?",
        a: "Timelines vary by service and complexity. Funnels and landing pages typically take 2-3 weeks. Web applications and ecommerce stores range from 3-6 weeks. Custom enterprise projects are scoped individually. You'll see your specific timeline during onboarding.",
      },
      {
        q: "What information do I need to provide?",
        a: "During onboarding, we'll ask about your business, target audience, desired features, brand guidelines, and any specific requirements. The more detail you provide, the better we can tailor the build to your needs.",
      },
      {
        q: "Can I start a project without knowing exactly what I need?",
        a: "Absolutely. Our discovery phase is designed to help clarify your requirements. You can also book a free consultation through our contact page and we'll help you figure out the best approach.",
      },
    ],
  },
  {
    category: "Pricing & Payment",
    questions: [
      {
        q: "What payment methods do you accept?",
        a: "We process payments securely through Creem.io, which supports all major credit cards, debit cards, and select digital payment methods.",
      },
      {
        q: "Are there any hidden fees?",
        a: "No hidden fees. The price you see during onboarding is the price you pay. If your project scope changes significantly, we'll discuss any adjustments transparently before proceeding.",
      },
      {
        q: "Do you offer refunds?",
        a: "We offer a satisfaction guarantee through our revision process. If you're not happy with a deliverable, we'll work with you to make it right. Refund policies are outlined in our terms of service.",
      },
      {
        q: "Can I pay in installments?",
        a: "For enterprise projects, we offer milestone-based payment plans. Contact us to discuss payment options for your specific project.",
      },
    ],
  },
  {
    category: "Project Management",
    questions: [
      {
        q: "How do I track my project's progress?",
        a: "Your dashboard includes a real-time phase tracker (similar to DoorDash order tracking) that shows exactly where your project stands. Each phase — Discovery, Design, Development, Testing, Review, and Launch — updates as work progresses.",
      },
      {
        q: "How many revisions are included?",
        a: "Revision rounds depend on your plan: Starter includes 1 round, Professional includes 3 rounds, and Enterprise includes unlimited revisions. You can request revisions directly through your project dashboard.",
      },
      {
        q: "Can I upload files and assets?",
        a: "Yes! Your project page has a built-in file upload section where you can share brand assets, content documents, images, and any other files relevant to your project.",
      },
      {
        q: "How do I communicate with the team?",
        a: "Every project includes a direct messaging feature. You can chat with our team in real-time through your dashboard — no need for external email threads or Slack channels.",
      },
    ],
  },
  {
    category: "Technical",
    questions: [
      {
        q: "What technologies do you use?",
        a: "We use modern, industry-standard technologies including Next.js, React, TypeScript, Tailwind CSS, and various backend services depending on your project's needs. All projects are built for performance, scalability, and maintainability.",
      },
      {
        q: "Will I own the code?",
        a: "Yes. Once your project is complete and payment is finalized, you have full ownership of all code, designs, and assets created for your project.",
      },
      {
        q: "Do you provide hosting?",
        a: "We can deploy to your preferred hosting provider (Vercel, AWS, etc.) or recommend the best option for your project. Hosting costs are separate from our development fees.",
      },
      {
        q: "What about ongoing maintenance?",
        a: "All plans include post-launch support (7-90 days depending on your plan). For ongoing maintenance, we offer separate support agreements — contact us for details.",
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90, 176, 232,0.12),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="orange" className="mb-4">FAQ</Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Frequently asked{" "}
              <span className="text-gradient-orange">questions</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to know about working with Scalar.
              Can&apos;t find what you&apos;re looking for? Reach out to us directly.
            </p>
          </div>
        </section>

        {/* FAQ Sections */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4">
            <div className="space-y-12">
              {faqCategories.map((category) => (
                <div key={category.category}>
                  <h2 className="text-xl font-bold mb-4">{category.category}</h2>
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
            <h2 className="text-2xl font-bold">Still have questions?</h2>
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
