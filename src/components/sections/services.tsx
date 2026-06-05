"use client";

import { services } from "@/lib/services";
import { motion } from "motion/react";
import { GradientCard } from "@/components/ui/gradient-card";

export function ServicesSection() {
  return (
    <section id="services" className="relative scroll-mt-24 bg-charcoal-dark py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-orange/80">What we build</p>
          <h2 className="font-brand mt-3 text-3xl text-white sm:text-4xl lg:text-5xl">
            Four disciplines. <span className="text-gradient-orange">One CRM.</span>
          </h2>
          <p className="mt-4 text-lg text-white/60">
            Scalar&apos;s agents discover, enrich, connect, and remember — on data that never
            leaves your system, with deep product context so they sell with understanding.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
            >
              <GradientCard
                index={index + 1}
                title={service.name}
                description={service.description}
                meta={service.startingPrice}
                href="/sign-up"
                cta="Get Started"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
