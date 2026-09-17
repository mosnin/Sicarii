"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

export type IllustrationFrameProps = {
  /**
   * The benefit the picture proves, in the visitor's words. This is the only
   * copy in the frame: the illustration carries the proof, this carries the
   * promise. Never a feature name.
   */
  claim: string;
  /** The mechanism, one line, earned only after the claim has landed. */
  detail?: string;
  /**
   * Drop the outer section and its vertical rhythm, for placing the figure
   * inside a section that already owns its spacing (a homepage band).
   */
  inline?: boolean;
  children: React.ReactNode;
};

/**
 * The single frame every marketing illustration sits in.
 *
 * Centralising it is what keeps a set of third-party illustrations reading as
 * one system: one panel treatment, one entry animation, one reduced-motion
 * path, one accessibility contract. The illustration itself is decoration -
 * `aria-hidden` - because the claim beneath it is the content, and a screen
 * reader should get the argument without the scenery.
 */
export function IllustrationFrame({
  claim,
  detail,
  inline,
  children,
}: IllustrationFrameProps) {
  const reduce = useReducedMotion();
  const Wrapper = inline ? "div" : "section";

  return (
    <Wrapper className={inline ? "" : "px-4 pb-4 pt-12 sm:px-6 sm:pt-16 lg:px-8"}>
      <motion.figure
        initial={reduce ? false : { opacity: 0, y: 16, filter: "blur(5px)" }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.65, ease: EASE }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(90,176,232,0.10),transparent_60%)]"
        />

        <div aria-hidden="true" className="relative z-10 px-2 pt-8 sm:px-6 sm:pt-10">
          {children}
        </div>

        <figcaption className="relative z-10 border-t border-border/70 px-6 py-5 text-center sm:px-8">
          <p className="font-brand text-lg text-foreground sm:text-xl">{claim}</p>
          {detail ? (
            <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {detail}
            </p>
          ) : null}
        </figcaption>
      </motion.figure>
    </Wrapper>
  );
}
