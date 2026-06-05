"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import { AsciiField } from "@/components/dashboard/ascii-field";
import {
  Home,
  Radar,
  Users,
  Bot,
  BookOpen,
  LayoutGrid,
  X,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";

// ── Dock items ──────────────────────────────────────────────────────────────
// The dock is the primary navigation: an Apple-style magnifying dock. Real
// routes only, verified under src/app/(dashboard)/.
type DockItem = { label: string; href: string; icon: LucideIcon; accent?: boolean };

const dockItems: DockItem[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Discover", href: "/discover", icon: Radar },
  { label: "CRM", href: "/crm", icon: Users },
  { label: "Agent", href: "/agent", icon: Bot, accent: true },
  { label: "Context", href: "/product-context", icon: BookOpen },
];

// ── Launchpad tiles ─────────────────────────────────────────────────────────
type Tile = { label: string; href: string; description: string; highlight?: boolean };

const launchpadTiles: Tile[] = [
  { label: "Dashboard", href: "/dashboard", description: "Your CRM at a glance — pipeline health, recent activity, and agent status." },
  { label: "Discover", href: "/discover", description: "AI-powered lead discovery — find the right people before they find you." },
  { label: "CRM", href: "/crm", description: "Your contact and entity database — enriched, organised, and always current." },
  { label: "Agent", href: "/agent", description: "Talk to your agent — search, enrich, and orchestrate your pipeline in plain language.", highlight: true },
  { label: "Product Context", href: "/product-context", description: "Ground your agents in your product — positioning, ICP, and message fit." },
  { label: "Settings", href: "/settings", description: "Account, API keys, workspace, and integration preferences." },
];

const capabilities = ["Discover", "Enrich", "Converse", "Close"];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

// Base / magnified icon-container sizes (px) and the cursor influence radius.
const BASE = 46;
const MAX = 78;
const ICON_BASE = 20;
const ICON_MAX = 34;
const RADIUS = 130;

function DockButton({
  item,
  mouseX,
  active,
}: {
  item: DockItem;
  mouseX: MotionValue<number>;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: BASE };
    return val - b.x - b.width / 2;
  });

  const sizeSync = useTransform(distance, [-RADIUS, 0, RADIUS], [BASE, MAX, BASE]);
  const iconSync = useTransform(distance, [-RADIUS, 0, RADIUS], [ICON_BASE, ICON_MAX, ICON_BASE]);
  const spring = { mass: 0.1, stiffness: 170, damping: 14 };
  const size = useSpring(sizeSync, spring);
  const iconSize = useSpring(iconSync, spring);

  const Icon = item.icon;

  return (
    <Link href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined}>
      <motion.div
        ref={ref}
        style={{ width: size, height: size }}
        className="group relative flex items-center justify-center"
      >
        {/* Tooltip */}
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-xs font-medium opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-charcoal/90">
          {item.label}
        </span>

        <span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full transition-colors",
            item.accent
              ? "bg-orange text-white shadow-lg shadow-orange/30"
              : active
                ? "bg-orange/15 text-orange ring-1 ring-inset ring-orange/30"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          )}
        >
          <motion.span style={{ width: iconSize, height: iconSize }} className="flex">
            <Icon className="h-full w-full" strokeWidth={item.accent ? 2.4 : 2} />
          </motion.span>
        </span>

        {/* Running-app dot */}
        {active && !item.accent && (
          <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-orange" />
        )}
      </motion.div>
    </Link>
  );
}

export function AppDock({ isStaff = false }: { isStaff?: boolean }) {
  // isStaff is accepted for layout compatibility; no staff-only tiles exist in Scalar.
  void isStaff;
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const mouseX = useMotionValue(Infinity);

  // Apps launcher behaves like a dock item visually; give it the same magnify.
  const appsRef = useRef<HTMLDivElement>(null);
  const appsDistance = useTransform(mouseX, (val) => {
    const b = appsRef.current?.getBoundingClientRect() ?? { x: 0, width: BASE };
    return val - b.x - b.width / 2;
  });
  const appsSpring = { mass: 0.1, stiffness: 170, damping: 14 };
  const appsSize = useSpring(useTransform(appsDistance, [-RADIUS, 0, RADIUS], [BASE, MAX, BASE]), appsSpring);
  const appsIcon = useSpring(useTransform(appsDistance, [-RADIUS, 0, RADIUS], [ICON_BASE, ICON_MAX, ICON_BASE]), appsSpring);

  // Lock body scroll while the launchpad is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      {/* ── Floating magnifying dock ── */}
      <motion.nav
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-3"
        aria-label="Primary"
      >
        <div
          onMouseMove={(e) => mouseX.set(e.clientX)}
          onMouseLeave={() => mouseX.set(Infinity)}
          className="flex items-end gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-2 shadow-xl shadow-black/10 backdrop-blur-2xl dark:border-white/10 dark:bg-charcoal/80 dark:shadow-black/50 dark:ring-1 dark:ring-inset dark:ring-white/5"
        >
          {dockItems.map((item) => (
            <DockButton
              key={item.href}
              item={item}
              mouseX={mouseX}
              active={isActivePath(pathname, item.href)}
            />
          ))}

          <span className="mx-0.5 mb-3 h-7 w-px self-center bg-border/60 dark:bg-white/10" aria-hidden="true" />

          {/* Apps launcher */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open apps menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
          >
            <motion.div
              ref={appsRef}
              style={{ width: appsSize, height: appsSize }}
              className="group relative flex items-center justify-center"
            >
              <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-xs font-medium opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-charcoal/90">
                Apps
              </span>
              <span
                className={cn(
                  "flex h-full w-full items-center justify-center rounded-full transition-colors",
                  menuOpen
                    ? "bg-orange/15 text-orange ring-1 ring-inset ring-orange/30"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                <motion.span style={{ width: appsIcon, height: appsIcon }} className="flex">
                  <LayoutGrid className="h-full w-full" />
                </motion.span>
              </span>
            </motion.div>
          </button>
        </div>
      </motion.nav>

      {/* ── Full-page launchpad ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Apps menu"
            className="fixed inset-0 z-[100]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <button
              type="button"
              aria-label="Close apps menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 cursor-default bg-charcoal-dark/95 backdrop-blur-xl"
            />
            <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_25%,rgba(90,176,232,0.16),transparent_60%)]" />

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none relative flex h-full flex-col overflow-y-auto"
            >
              <div className="pointer-events-auto flex items-center justify-between px-5 pt-7 sm:px-10">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-orange/80">
                    Scalar // CRM
                  </p>
                  <h2 className="font-brand mt-1 text-3xl text-white sm:text-4xl">Everything</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition-colors hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="pointer-events-auto mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-10">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {launchpadTiles.map((tile, i) => {
                    const active = isActivePath(pathname, tile.href);
                    return (
                      <Link
                        key={tile.href}
                        href={tile.href}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "group relative flex flex-col justify-between gap-8 overflow-hidden rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-1",
                          tile.highlight
                            ? "border-orange/40 bg-orange/[0.07] hover:bg-orange/[0.12]"
                            : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]",
                          active && "ring-1 ring-orange/40"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <span
                            className={cn(
                              "font-brand text-sm tabular-nums",
                              tile.highlight ? "text-orange" : "text-white/40"
                            )}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <ArrowUpRight
                            className={cn(
                              "h-5 w-5 -translate-y-0.5 translate-x-0.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100",
                              tile.highlight ? "text-orange" : "text-white"
                            )}
                          />
                        </div>
                        <div>
                          <h3 className="font-brand text-2xl text-white">{tile.label}</h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                            {tile.description}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-10">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">What we do</p>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                    {capabilities.map((c) => (
                      <span key={c} className="font-brand text-xl text-white/70">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
