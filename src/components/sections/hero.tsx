"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { Lock } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

// The homepage hero is a full-viewport cinematic block: a CloudFront video
// behind a two-line headline and a bottom call to action. Navigation is the
// shared floating Header (rendered by the page), so the nav stays consistent
// with every other page. Positioned `absolute` inside a `relative h-screen`
// block so the sections below scroll normally instead of being overlapped.
const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260510_060007_60275ce7-030c-4668-a160-8f364ec537d3.mp4";

export function HeroSection() {
  const reduce = useReducedMotion();
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // GSAP mouse parallax on the video. Disabled for reduced motion, where the
  // video is also paused to rest on its first frame.
  useEffect(() => {
    const wrap = videoWrapRef.current;
    if (!wrap) return;
    if (reduce) {
      videoRef.current?.pause();
      return;
    }

    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      target.x = ((e.clientX - cx) / cx) * 20;
      target.y = ((e.clientY - cy) / cy) * 20;
    };
    const tick = () => {
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
      gsap.set(wrap, { x: current.x, y: current.y });
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  return (
    <section className="relative h-screen w-full overflow-hidden bg-black text-white">
      {/* Video background, slightly over-scaled so the parallax never reveals edges */}
      <div
        ref={videoWrapRef}
        className="absolute inset-0 z-0 origin-center scale-[1.08]"
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          src={VIDEO_SRC}
          onLoadedMetadata={(e) => {
            e.currentTarget.playbackRate = 1.25;
          }}
          className="h-full w-full object-cover"
        />
      </div>
      {/* Subtle vignette so white text holds on any frame */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />

      {/* Headline */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="absolute inset-x-0 top-[120px] z-20 px-6 text-center"
      >
        <h1
          className="mx-auto font-sans font-normal"
          style={{ fontSize: "clamp(40px, 5.4vw, 72px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}
        >
          <span className="block text-white">Lead intelligence at agent speed.</span>
          <span className="block" style={{ color: "rgba(255,255,255,0.55)" }}>
            The CRM your agents run.
          </span>
        </h1>
      </motion.div>

      {/* Bottom block */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
        className="absolute inset-x-0 bottom-14 z-20 flex flex-col items-center gap-6 px-6"
      >
        <p className="max-w-[620px] text-center text-[15px] leading-relaxed">
          <span className="text-white">
            Point your agent at a name, a domain, or a prompt. It builds the
            database, finds who is in-market, and enriches every record.
          </span>
          <span className="text-white/55"> Structured, deduped, and wholly yours.</span>
        </p>

        <Link
          href="/sign-up"
          className="rounded-full bg-white px-8 py-3.5 text-[15px] font-medium text-black transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_32px_4px_rgba(90,176,232,0.35)] active:scale-[0.97]"
        >
          Get started today
        </Link>

        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-white/70">
          <Lock size={13} strokeWidth={1.5} />
          YOUR DATA. OWNED, EXPORTABLE, NEVER RESOLD.
        </div>
      </motion.div>
    </section>
  );
}
