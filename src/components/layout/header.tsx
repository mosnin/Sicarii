"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/logo-mark";
import { UserButton, useAuth } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { Menu, X, ArrowRight, ChevronDown } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

type MenuLink = { label: string; href: string; description: string };

type Featured = {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

type NavGroup = {
  label: string;
  links: MenuLink[];
  featured: Featured;
};

const groups: NavGroup[] = [
  {
    label: "Product",
    links: [
      { label: "Discover", href: "/product/discover", description: "Find the right companies and people from a name, a domain, or a prompt." },
      { label: "Enrich", href: "/product/enrich", description: "Fill every gap: firmographics, verified email, phone, and more." },
      { label: "Intent signals", href: "/product/signals", description: "See who is in-market before anyone else reaches out." },
      { label: "The agent", href: "/product/agent", description: "Chat that discovers, enriches, and writes to your CRM." },
    ],
    featured: {
      eyebrow: "New",
      title: "Agents that pay their own way",
      body: "Connected agents top up usage and buy plans in USDC over HTTP, no human in the loop.",
      href: "/integrations",
      cta: "See how agents connect",
    },
  },
  {
    label: "Solutions",
    links: [
      { label: "Why Scalar", href: "/product/why", description: "Structure, UI, and intelligence as one system, not messy files." },
      { label: "For agent builders", href: "/integrations", description: "Bring your own agent over MCP and give it a real database." },
      { label: "Data you own", href: "/security", description: "A single source of truth you control, exportable, never resold." },
      { label: "Pricing", href: "/pricing", description: "A seat plus usage credits. Pay for what your agents do." },
    ],
    featured: {
      eyebrow: "The thesis",
      title: "The CRM your agents run",
      body: "Lead intelligence and deal tracking that stays consistent while agents do the work.",
      href: "/product/why",
      cta: "See why",
    },
  },
  {
    label: "Resources",
    links: [
      { label: "How it works", href: "/product/how-it-works", description: "Connect your agent and it just works, in three steps." },
      { label: "Integrations", href: "/integrations", description: "OpenClaw, Hermes, Claude, and anything that speaks MCP." },
      { label: "Security and trust", href: "/security", description: "How your data stays isolated, owned, and yours." },
      { label: "FAQ", href: "/faq", description: "The honest answers to the common questions." },
    ],
    featured: {
      eyebrow: "Read",
      title: "The Scalar manifesto",
      body: "Why a structured, observed system beats agents dumping everything into files.",
      href: "/manifesto",
      cta: "Read the manifesto",
    },
  },
];

// Direct links (no mega menu), Apple-style.
const directLinks = [{ label: "Pricing", href: "/pricing" }];

/* ----------------------------- Mega menu panel ---------------------------- */

function MegaPanel({ group }: { group: NavGroup }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={group.label}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 2 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="grid grid-cols-[1.2fr_1fr] gap-2 p-2"
    >
      {/* Links column */}
      <div className="grid grid-cols-1 gap-0.5">
        {group.links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="group/link rounded-[4px] px-3 py-2.5 transition-colors hover:bg-hover"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{link.label}</p>
              <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-fg-tertiary opacity-0 transition-all duration-150 group-hover/link:translate-x-0 group-hover/link:opacity-100" />
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-tertiary">{link.description}</p>
          </Link>
        ))}
      </div>

      {/* Featured cell */}
      <Link
        href={group.featured.href}
        className="group/feat relative flex flex-col justify-between overflow-hidden rounded-[8px] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
      >
        <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18] dark:opacity-30" cell={12} speed={0.07} gradient />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_0%,rgba(90,176,232,0.16),transparent_60%)]" />
        <div className="relative">
          <p className="text-xs font-medium text-primary">{group.featured.eyebrow}</p>
          <p className="mt-2 text-base font-semibold leading-tight text-foreground">{group.featured.title}</p>
          <p className="mt-2 text-xs leading-relaxed text-fg-secondary">{group.featured.body}</p>
        </div>
        <div className="relative mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          {group.featured.cta}
          <ArrowRight className="h-3.5 w-3.5 text-primary transition-transform duration-150 group-hover/feat:translate-x-0.5" />
        </div>
      </Link>
    </motion.div>
  );
}

/* -------------------------------- Header ---------------------------------- */

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { isSignedIn } = useAuth();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close everything on route change, the render-phase way (no effect needed):
  // when the path differs from the last render, reset and bail into a re-render.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setActive(null);
    setMobileOpen(false);
  }

  // Bar gains a solid surface and hairline once you leave the very top of the page.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll behind the full-screen mobile menu.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Escape closes the open mega menu.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setActive(null), 140);
  }, [cancelClose]);

  const activeGroup = groups.find((g) => g.label === active) ?? null;

  return (
    <>
      <header
        className="fixed top-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2"
        onMouseLeave={scheduleClose}
        onMouseEnter={cancelClose}
      >
        <motion.div
          animate={{
            paddingTop: scrolled ? 0 : 2,
            paddingBottom: scrolled ? 0 : 2,
          }}
          transition={{ duration: 0.2, ease: EASE }}
          className={cn(
            "rounded-[8px] border backdrop-blur-md transition-colors duration-200",
            scrolled ? "border-border bg-background/95" : "border-border-light bg-background/80",
          )}
        >
          <div className="flex h-12 items-center justify-between pl-3 pr-2 sm:pl-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2" aria-label="Scalar home">
              <LogoMark className="h-6 w-6" priority />
              <span className="hidden text-base font-semibold text-foreground sm:inline">Scalar</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-0.5 lg:flex">
              {groups.map((group) => {
                const isOpen = active === group.label;
                return (
                  <button
                    key={group.label}
                    type="button"
                    onMouseEnter={() => {
                      cancelClose();
                      setActive(group.label);
                    }}
                    onFocus={() => setActive(group.label)}
                    onClick={() => setActive(isOpen ? null : group.label)}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-1 rounded-[4px] px-3 text-sm font-medium transition-colors",
                      isOpen ? "bg-hover text-foreground" : "text-fg-secondary hover:text-foreground",
                    )}
                  >
                    {group.label}
                    <ChevronDown className={cn("h-3 w-3 text-fg-tertiary transition-transform duration-150", isOpen && "rotate-180")} />
                  </button>
                );
              })}
              {directLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onMouseEnter={() => setActive(null)}
                  className="flex h-8 items-center rounded-[4px] px-3 text-sm font-medium text-fg-secondary transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 lg:flex">
                <ThemeToggle />
                {!isSignedIn ? (
                  <>
                    <Link
                      href="/sign-in"
                      className="flex h-8 items-center rounded-[4px] px-3 text-sm font-medium text-fg-secondary transition-colors hover:text-foreground"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/sign-up"
                      className="flex h-8 items-center rounded-[4px] bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Get started
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/dashboard"
                      className="flex h-8 items-center rounded-[4px] px-3 text-sm font-medium text-fg-secondary transition-colors hover:text-foreground"
                    >
                      Dashboard
                    </Link>
                    <UserButton />
                  </>
                )}
              </div>

              {/* Mobile trigger */}
              <button
                type="button"
                aria-label="Open menu"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[4px] text-foreground transition-colors hover:bg-hover lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={18} strokeWidth={1.6} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Mega menu panel */}
        <AnimatePresence>
          {activeGroup && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 2 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute left-1/2 top-[calc(100%+0.5rem)] hidden w-[min(92vw,720px)] -translate-x-1/2 overflow-hidden rounded-[8px] border border-border bg-background shadow-lg lg:block"
              onMouseEnter={cancelClose}
            >
              <AnimatePresence mode="wait">
                <MegaPanel key={activeGroup.label} group={activeGroup} />
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Full-screen mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[100] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-background/97 backdrop-blur-xl" />
            <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" cell={14} speed={0.09} gradient />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_15%,rgba(90,176,232,0.18),transparent_60%)]" />

            <motion.div
              className="relative flex h-full flex-col overflow-y-auto"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <div className="flex items-center justify-between px-5 pt-6">
                <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                  <LogoMark className="h-6 w-6" />
                  <span className="font-semibold text-foreground">Scalar</span>
                </Link>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-border bg-background text-foreground transition-colors hover:bg-hover"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X size={18} strokeWidth={1.6} />
                  </button>
                </div>
              </div>

              <motion.nav
                className="flex-1 space-y-8 px-5 py-9"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } } }}
                initial="hidden"
                animate="show"
              >
                {groups.map((group) => (
                  <div key={group.label}>
                    <motion.p
                      variants={{
                        hidden: { opacity: 0, y: 6 },
                        show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
                      }}
                      className="text-xs font-medium text-fg-tertiary"
                    >
                      {group.label}
                    </motion.p>
                    <div className="mt-3 space-y-1">
                      {group.links.map((link) => (
                        <motion.div
                          key={link.label}
                          variants={{
                            hidden: { opacity: 0, y: 6 },
                            show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
                          }}
                        >
                          <Link
                            href={link.href}
                            onClick={() => setMobileOpen(false)}
                            className="block text-2xl font-medium leading-tight text-foreground transition-colors hover:text-primary"
                          >
                            {link.label}
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.nav>

              <div className="space-y-3 border-t border-border px-5 pb-9 pt-5">
                {!isSignedIn ? (
                  <>
                    <Link
                      href="/sign-up"
                      onClick={() => setMobileOpen(false)}
                      className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[8px] bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Get started
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/sign-in"
                      onClick={() => setMobileOpen(false)}
                      className="flex h-11 w-full items-center justify-center rounded-[8px] border border-border text-sm font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-foreground"
                    >
                      Sign in
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-11 w-full items-center justify-center rounded-[8px] bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Dashboard
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
