"use client";

import { motion } from "motion/react";

const stats = [
  { value: "50+", label: "Projects Delivered" },
  { value: "98%", label: "Client Satisfaction" },
  { value: "35+", label: "Happy Clients" },
  { value: "<24h", label: "Response Time" },
];

export function StatsBand() {
  return (
    <section className="py-12 border-y border-border bg-card/50">
      <div className="mx-auto max-w-5xl px-4 flex flex-wrap justify-center gap-12 sm:gap-16">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="text-center"
          >
            <p className="text-3xl font-bold text-orange sm:text-4xl">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
