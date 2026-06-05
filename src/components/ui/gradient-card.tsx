"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AsciiField } from "@/components/dashboard/ascii-field";

// Shared green edge-glow replacing the original orange/amber.
const glow = {
  rest: "0 0 15px 3px rgba(90,176,232,0.7), 0 0 25px 5px rgba(143,204,242,0.5), 0 0 35px 7px rgba(191,226,248,0.35)",
  hover: "0 0 20px 4px rgba(90,176,232,0.9), 0 0 30px 6px rgba(143,204,242,0.7), 0 0 40px 8px rgba(191,226,248,0.5)",
} as const;

export type GradientCardProps = {
  title: string;
  description: string;
  index?: number;
  meta?: string;
  href?: string;
  cta?: string;
  className?: string;
  children?: ReactNode;
};

/**
 * Premium 3D-tilt gradient card in the Scalar palette (charcoal + green
 * glow) with the studio&apos;s ASCII signature. Reserved for the marketing
 * site&apos;s main features.
 */
export function GradientCard({
  title,
  description,
  index,
  meta,
  href,
  cta,
  className,
}: GradientCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setRotation({ x: -(y / rect.height) * 5, y: (x / rect.width) * 5 });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotation({ x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={cardRef}
      className={cn("relative h-full min-h-[420px] overflow-hidden rounded-[28px]", className)}
      style={{
        transformStyle: "preserve-3d",
        backgroundColor: "#0d0e12",
        // Soft downward glow with negative spread — no ring/halo edge.
        boxShadow: "0 24px 70px -30px rgba(90,176,232,0.30)",
      }}
      initial={{ y: 0 }}
      animate={{ y: isHovered ? -5 : 0, rotateX: rotation.x, rotateY: rotation.y, perspective: 1000 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Dark base */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(180deg,#000_0%,#000_70%)]" />

      {/* Signature ASCII field */}
      <AsciiField className="absolute inset-0 z-[5] h-full w-full opacity-[0.13]" cell={13} />

      {/* Noise texture */}
      <div
        className="absolute inset-0 z-10 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Green bottom glow */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-20 h-2/3"
        style={{
          background:
            "radial-gradient(ellipse at bottom right, rgba(90,176,232,0.6) -10%, rgba(90,176,232,0) 70%), radial-gradient(ellipse at bottom left, rgba(143,204,242,0.5) -10%, rgba(143,204,242,0) 70%)",
          filter: "blur(40px)",
        }}
        animate={{ opacity: isHovered ? 0.95 : 0.8, y: isHovered ? rotation.x * 0.5 : 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-[21] h-2/3"
        style={{
          background:
            "radial-gradient(circle at bottom center, rgba(90,176,232,0.6) -20%, rgba(90,176,232,0) 60%)",
          filter: "blur(45px)",
        }}
        animate={{ opacity: isHovered ? 0.9 : 0.75, y: isHovered ? `calc(10% + ${rotation.x * 0.3}px)` : "10%" }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Bottom border highlight + glow */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-25 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.05) 100%)",
        }}
        animate={{ boxShadow: isHovered ? glow.hover : glow.rest, opacity: isHovered ? 1 : 0.9 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Glass reflection */}
      <div
        className="pointer-events-none absolute inset-0 z-30"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 80%, rgba(255,255,255,0.05) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-40 flex h-full flex-col p-7">
        {index !== undefined && (
          <p className="font-brand text-sm tabular-nums text-orange/90">
            {String(index).padStart(2, "0")}
          </p>
        )}
        <div className="flex-1" />
        <motion.div
          initial={{ opacity: 0.6, filter: "blur(3px)" }}
          whileInView={{ opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
        >
          <h3 className="font-brand text-2xl leading-tight text-white">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/65">{description}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            {meta && <span className="font-brand text-sm text-orange">{meta}</span>}
            {href && (
              <Link
                href={href}
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-white"
              >
                {cta ?? "Learn more"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
