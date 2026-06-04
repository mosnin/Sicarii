"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { ArrowDown, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-charcoal-dark" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30, 77, 43,0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(30, 77, 43,0.08),transparent_50%)]" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center gap-6"
        >
          {/* Logo */}
          <Image
            src="/logo.svg"
            alt="Sicarii"
            width={80}
            height={80}
            className="rounded-xl"
            priority
          />

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-7xl">
            Digital Solutions{" "}
            <span className="text-gradient-orange">Built for Growth</span>
          </h1>

          <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Choose your service. Complete onboarding. Track every phase of your
            build in real-time. From web apps to AI automation — we bring your
            vision to life.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <RainbowButton className="h-14 px-10 text-base rounded-xl" asChild>
              <Link href="/services">
                View Services
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </RainbowButton>
            <Button variant="outline" size="lg" asChild>
              <Link href="/sign-in">Client Login</Link>
            </Button>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="mt-16"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowDown className="mx-auto h-6 w-6" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
