"use client";

/**
 * DashboardShell - the signed-in app frame, laid out the way Twenty lays out
 * its CRM, in Scalar's colors and with its ASCII signature: a persistent gray navigation drawer on the left and the page in a
 * white, hairline-bordered panel with a slim top bar.
 *
 * - Desktop (>= lg): the drawer is open by default and can be collapsed; the
 *   choice persists in localStorage. Collapsed, the top bar shows an expand
 *   button. The page panel scrolls on its own, like Twenty's record views.
 * - Mobile (< lg): no drawer. A flat bottom tab bar carries the nav, and the
 *   top bar keeps the workspace switcher, theme toggle and account menu.
 * - "Apps" opens the launchpad: a command-menu style overlay of every area.
 * - Respects `prefers-reduced-motion` (instant, no slides).
 *
 * MobileNavContext: exposes `navOpen: boolean` to descendants so the agent
 * composer can minimise itself while a mobile nav panel is open.
 */

import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
  type ComponentType,
} from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { AsciiField } from "@/components/dashboard/ascii-field";
import {
  Home,
  Radar,
  Telescope,
  Users,
  Crosshair,
  BookOpen,
  LayoutGrid,
  X,
  ChevronRight,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Gauge,
} from "lucide-react";

// ── MobileNavContext ──────────────────────────────────────────────────────────

type MobileNavContextValue = { navOpen: boolean };
const MobileNavContext = createContext<MobileNavContextValue>({ navOpen: false });

/** Consume in any dashboard child to react to the mobile nav panel state. */
export function useMobileNav() {
  return useContext(MobileNavContext);
}

// ── Shared nav data ──────────────────────────────────────────────────────────

// Icons may be lucide icons or our own brand mark; both accept className.
type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  accent?: boolean;
  /** Drawer section the item is listed under. */
  section: "workspace" | "agent" | "system";
};

// The agent is Scalar; render the brand logo as its nav icon.
const ScalarLogoIcon: NavIcon = ({ className }) => <LogoMark className={className} />;

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home, section: "workspace" },
  { label: "Discover", href: "/discover", icon: Telescope, section: "workspace" },
  { label: "Radar", href: "/radar", icon: Radar, section: "workspace" },
  { label: "CRM", href: "/crm", icon: Users, section: "workspace" },
  { label: "Field", href: "/field", icon: Crosshair, section: "workspace" },
  { label: "Autopilot", href: "/autopilot", icon: Gauge, section: "workspace" },
  { label: "Scalar", href: "/agent", icon: ScalarLogoIcon, section: "agent" },
  { label: "Context", href: "/product-context", icon: BookOpen, section: "agent" },
  { label: "Settings", href: "/settings", icon: Settings, section: "system" },
];

const NAV_SECTIONS: { key: NavItem["section"]; label: string | null }[] = [
  { key: "workspace", label: "Workspace" },
  { key: "agent", label: "Agent" },
];

// ── Launchpad data ───────────────────────────────────────────────────────────

type Tile = {
  label: string;
  href: string;
  description: string;
  highlight?: boolean;
};

const LAUNCHPAD_TILES: Tile[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    description:
      "Your CRM at a glance - pipeline health, recent activity, and agent status.",
  },
  {
    label: "Discover",
    href: "/discover",
    description:
      "AI-powered lead discovery - find the right people before they find you.",
  },
  {
    label: "CRM",
    href: "/crm",
    description:
      "Your contact and entity database - enriched, organised, and always current.",
  },
  {
    label: "Scalar",
    href: "/agent",
    description:
      "Talk to Scalar, your agent. Search, enrich, and orchestrate your pipeline in plain language.",
    highlight: true,
  },
  {
    label: "Product Context",
    href: "/product-context",
    description:
      "Ground your agents in your product - positioning, ICP, and message fit.",
  },
  {
    label: "Radar",
    href: "/radar",
    description:
      "Scheduled scans for in-market signals. Auto-add new records, or review run history.",
  },
  {
    label: "Field",
    href: "/field",
    description:
      "Customer segments + agentic pipelines. Build a segment from a prompt, then work the deals.",
  },
  {
    label: "Autopilot",
    href: "/autopilot",
    description:
      "Approve a budgeted spend plan once, then let Scalar run discovery, enrichment, and outreach unsupervised within the cap.",
  },
  {
    label: "Skills",
    href: "/skills",
    description:
      "Ready-made playbooks for operating Scalar. Copy or download as .md for your agent.",
  },
  {
    label: "Settings",
    href: "/settings",
    description:
      "Account, API keys, workspace, and integration preferences.",
  },
];

const CAPABILITIES = ["Discover", "Enrich", "Converse", "Close"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

// Readable names for the sub-routes that show up in the top bar breadcrumb.
const SEGMENT_LABELS: Record<string, string> = {
  new: "New",
  map: "Map",
  entity: "Company",
};

/** Breadcrumb for the page top bar: the owning nav item plus one sub-level. */
function useBreadcrumb(pathname: string) {
  const item = NAV_ITEMS.find((i) => isActivePath(pathname, i.href));
  const extra = LAUNCHPAD_TILES.find((t) => isActivePath(pathname, t.href));
  const root = item
    ? { label: item.label, href: item.href, icon: item.icon as NavIcon | null }
    : extra
      ? { label: extra.label, href: extra.href, icon: null }
      : null;
  if (!root) return { root: null, leaf: null as string | null };

  const rest = pathname.slice(root.href.length).split("/").filter(Boolean);
  let leaf: string | null = null;
  if (rest.length > 0) {
    const named = rest.map((seg) => SEGMENT_LABELS[seg]).filter(Boolean);
    if (rest.includes("new")) leaf = named.join(" / ") || "New";
    else if (rest[0] === "entity") leaf = "Company";
    else if (rest[0] === "map") leaf = "Map";
    else leaf = "Record";
  }
  return { root, leaf };
}

const SIDEBAR_WIDTH = 220; // px - Twenty's navigation drawer width
const STORAGE_KEY = "scalar-sidebar";
const DRAWER_EASE = [0.16, 1, 0.3, 1] as const;

// ── NavRow ───────────────────────────────────────────────────────────────────

function NavRow({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-7 items-center gap-2 rounded-[4px] px-1.5 text-sm transition-colors duration-100",
        active
          ? "bg-pressed font-medium text-foreground"
          : "text-fg-secondary hover:bg-hover hover:text-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-foreground" : "text-fg-secondary group-hover:text-foreground"
        )}
        strokeWidth={active ? 2 : 1.6}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// ── Sidebar (desktop navigation drawer) ──────────────────────────────────────

function Sidebar({
  onCollapse,
  onOpenLaunchpad,
  launchpadOpen,
}: {
  onCollapse: () => void;
  onOpenLaunchpad: () => void;
  launchpadOpen: boolean;
}) {
  const pathname = usePathname();
  const settings = NAV_ITEMS.find((i) => i.section === "system");

  return (
    <nav
      className="relative flex h-full flex-col gap-3 px-2 pb-2 pt-3"
      style={{ width: SIDEBAR_WIDTH }}
      aria-label="Primary sidebar"
    >
      {/* The ASCII signature, a whisper behind the drawer. */}
      <AsciiField className="pointer-events-none absolute inset-0 -z-0 h-full w-full opacity-[0.14] dark:opacity-30" />
      {/* ── Workspace header ── */}
      <div className="group/ws relative flex h-7 items-center justify-between gap-1 pl-1">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2 rounded-[4px] px-0.5 py-0.5 transition-colors hover:bg-hover"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-border bg-background">
            <LogoMark className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-semibold text-foreground">Scalar</span>
        </Link>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          className="flex h-6 w-6 items-center justify-center rounded-[4px] text-fg-tertiary opacity-0 transition-[opacity,background-color] duration-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-hover/ws:opacity-100"
        >
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>

      {/* Personal vs team context: switching orgs re-scopes every page to the
          shared workspace CRM. */}
      <div className="relative px-0.5">
        <OrganizationSwitcher
          afterSelectOrganizationUrl="/dashboard"
          afterSelectPersonalUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger:
                "w-full justify-between rounded-[4px] px-1.5 py-1 text-sm hover:bg-hover focus:shadow-none",
            },
          }}
        />
      </div>

      {/* ── Nav sections ── */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.key} className="flex flex-col gap-px">
            {section.label && (
              <p className="twenty-label flex h-6 items-center px-1.5">{section.label}</p>
            )}
            {NAV_ITEMS.filter((i) => i.section === section.key).map((item) => (
              <NavRow key={item.href} item={item} active={isActivePath(pathname, item.href)} />
            ))}
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="relative flex flex-col gap-px">
        <button
          type="button"
          onClick={onOpenLaunchpad}
          aria-label="Open apps menu"
          aria-haspopup="dialog"
          aria-expanded={launchpadOpen}
          className={cn(
            "group flex h-7 w-full items-center gap-2 rounded-[4px] px-1.5 text-sm transition-colors duration-100",
            launchpadOpen
              ? "bg-pressed font-medium text-foreground"
              : "text-fg-secondary hover:bg-hover hover:text-foreground"
          )}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={1.6} />
          <span>Apps</span>
        </button>
        {settings && (
          <NavRow item={settings} active={isActivePath(pathname, settings.href)} />
        )}
        <div className="mt-2 flex h-8 items-center justify-between border-t border-border pl-1 pt-2">
          <UserButton showName appearance={{ elements: { userButtonBox: "flex-row-reverse gap-2 text-sm text-foreground", avatarBox: "h-5 w-5" } }} />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

// ── MobileBottomNav - persistent bottom tab bar (mobile only) ─────────────────

function MobileBottomNav({
  onOpenLaunchpad,
  launchpadOpen,
}: {
  onOpenLaunchpad: () => void;
  launchpadOpen: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-xl items-center justify-around px-1 py-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 items-center justify-center py-0.5"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-[4px] transition-colors",
                  active ? "bg-pressed text-foreground" : "text-fg-tertiary"
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.6} />
              </span>
            </Link>
          );
        })}

        {/* Apps launcher */}
        <button
          type="button"
          onClick={onOpenLaunchpad}
          aria-label="Open apps menu"
          aria-haspopup="dialog"
          aria-expanded={launchpadOpen}
          className="flex flex-1 items-center justify-center py-0.5"
        >
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-[4px] transition-colors",
              launchpadOpen ? "bg-pressed text-foreground" : "text-fg-tertiary"
            )}
          >
            <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </span>
        </button>
      </div>
    </nav>
  );
}

// ── Launchpad ────────────────────────────────────────────────────────────────

function Launchpad({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Apps menu"
          className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[10vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            aria-label="Close apps menu"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/30"
          />

          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: DRAWER_EASE }}
            className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[8px] border border-border bg-background shadow-2xl"
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border pl-3 pr-1.5">
              <div className="flex items-center gap-2 text-sm">
                <LayoutGrid className="h-4 w-4 text-fg-tertiary" strokeWidth={1.6} />
                <span className="font-medium text-foreground">Apps</span>
                <span className="text-fg-tertiary">Everything in Scalar</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-[4px] text-fg-tertiary transition-colors hover:bg-hover hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5">
              <p className="twenty-label px-2 pb-1 pt-1.5">Navigate</p>
              <ul className="flex flex-col gap-px">
                {LAUNCHPAD_TILES.map((tile, i) => {
                  const active = isActivePath(pathname, tile.href);
                  return (
                    <li key={tile.href}>
                      <Link
                        href={tile.href}
                        onClick={onClose}
                        className={cn(
                          "group flex items-center gap-3 rounded-[4px] px-2 py-2 transition-colors",
                          active ? "bg-pressed" : "hover:bg-hover"
                        )}
                      >
                        <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-fg-light">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-sm font-medium",
                              tile.highlight ? "text-primary" : "text-foreground"
                            )}
                          >
                            {tile.label}
                          </span>
                          <span className="block truncate text-xs text-fg-tertiary">
                            {tile.description}
                          </span>
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-fg-light opacity-0 transition-opacity group-hover:opacity-100"
                          strokeWidth={1.6}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex h-9 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-xs text-fg-tertiary">
              <span>What we do</span>
              {CAPABILITIES.map((c) => (
                <span key={c} className="text-fg-secondary">
                  {c}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── PageTopBar ───────────────────────────────────────────────────────────────

function PageTopBar({
  sidebarOpen,
  onExpand,
}: {
  sidebarOpen: boolean;
  onExpand: () => void;
}) {
  const pathname = usePathname();
  const { root, leaf } = useBreadcrumb(pathname);
  const Icon = root?.icon ?? null;

  return (
    <header className="sticky top-0 z-30 flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-2 backdrop-blur-md sm:px-3">
      <div className="flex min-w-0 items-center gap-1">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expand sidebar"
            className="mr-1 hidden h-7 w-7 items-center justify-center rounded-[4px] text-fg-tertiary transition-colors hover:bg-hover hover:text-foreground lg:flex"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
        {/* Mobile: the wordmark stands in for the drawer header. */}
        <Link href="/dashboard" className="mr-1 flex items-center lg:hidden" aria-label="Scalar home">
          <span className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-border">
            <LogoMark className="h-3.5 w-3.5" />
          </span>
        </Link>
        {root && (
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
            <Link
              href={root.href}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-[4px] px-1 py-0.5 transition-colors hover:bg-hover",
                leaf ? "text-fg-tertiary" : "font-medium text-foreground"
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />}
              <span className="truncate">{root.label}</span>
            </Link>
            {leaf && (
              <>
                <span className="text-fg-light">/</span>
                <span className="truncate px-1 font-medium text-foreground">{leaf}</span>
              </>
            )}
          </nav>
        )}
      </div>

      {/* Mobile keeps account controls in the top bar (no drawer below lg). */}
      <div className="flex items-center gap-1 lg:hidden">
        <OrganizationSwitcher
          afterSelectOrganizationUrl="/dashboard"
          afterSelectPersonalUrl="/dashboard"
        />
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}

// ── DashboardShell (main export) ─────────────────────────────────────────────

export function DashboardShell({
  isStaff,
  children,
}: {
  isStaff: boolean;
  children: React.ReactNode;
}) {
  void isStaff;
  const prefersReduced = useReducedMotion();

  // ── Drawer state - open by default on desktop, persisted ────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [launchpadOpen, setLaunchpadOpen] = useState(false);

  // Read the persisted choice after mount (browser API, post-SSR).
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "closed") {
      setSidebarOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []);

  const setDrawer = useCallback((open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
  }, []);

  const collapse = useCallback(() => setDrawer(false), [setDrawer]);
  const expand = useCallback(() => setDrawer(true), [setDrawer]);
  const openLaunchpad = useCallback(() => setLaunchpadOpen(true), []);
  const closeLaunchpad = useCallback(() => setLaunchpadOpen(false), []);

  const drawerTransition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.22, ease: DRAWER_EASE };

  return (
    <MobileNavContext.Provider value={{ navOpen: false }}>
      <div className="app-shell flex min-h-dvh bg-surface text-foreground lg:h-dvh lg:overflow-hidden">
        {/* ── Navigation drawer (desktop) ── */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              key="drawer"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={drawerTransition}
              className="hidden shrink-0 overflow-hidden lg:block"
            >
              <Sidebar
                onCollapse={collapse}
                onOpenLaunchpad={openLaunchpad}
                launchpadOpen={launchpadOpen}
              />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Page panel ── */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2",
            !sidebarOpen && "lg:pl-2"
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col bg-background lg:overflow-hidden lg:rounded-[8px] lg:border lg:border-border">
            <PageTopBar sidebarOpen={sidebarOpen} onExpand={expand} />
            <main className="flex-1 pb-24 lg:overflow-y-auto lg:pb-10">
              <div className="mx-auto max-w-7xl px-3 pt-5 sm:px-6 lg:px-8">{children}</div>
            </main>
          </div>
        </div>

        {/* ── Mobile bottom nav - mobile only ── */}
        <MobileBottomNav onOpenLaunchpad={openLaunchpad} launchpadOpen={launchpadOpen} />

        {/* ── Launchpad overlay ── */}
        <Launchpad open={launchpadOpen} onClose={closeLaunchpad} />
      </div>
    </MobileNavContext.Provider>
  );
}
