"use client";

import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const testimonials = [
  {
    quote:
      "We needed AI agents to touch sensitive context without ever silently mutating it. Scalar built the trust gate — read via MCP, every write a reviewable diff, full audit trail and rollback. Exactly the architecture we needed.",
    name: "Poggle",
    role: "AI governance platform · poggle.xyz",
    rating: 5,
  },
  {
    quote:
      "They shipped our storefront end-to-end — product pages, subscriptions, a checkout built to convert. It's live, it's fast, and it sells.",
    name: "NeverAge",
    role: "DTC supplements · neverage.co",
    rating: 5,
  },
  {
    quote:
      "Our online ordering looks as good as the cookies taste. Scalar turned a storefront into something people actually want to check out from.",
    name: "Two Cookies NYC",
    role: "NYC bakery · twocookiesnyc.com",
    rating: 5,
  },
  {
    quote:
      "Across a portfolio of brands, Scalar built the operating infrastructure we run on — brand systems, fulfilment tooling, and architecture that scales with us.",
    name: "Studio Group",
    role: "Multi-brand commerce · tryscalar.xyz",
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-orange/80">Clients</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            Builders they <span className="text-gradient-orange">trust</span>
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="h-full"
            >
              <SpotlightCard className="h-full p-6 sm:p-8">
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-orange text-orange" />
                  ))}
                </div>
                <blockquote className="text-base leading-relaxed text-foreground/80">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-sm font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-orange"
          >
            See the work
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
