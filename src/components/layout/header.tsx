"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";
import {
  Menu,
  X,
  Globe,
  ShoppingCart,
  Bot,
  Server,
  ChevronDown,
  CreditCard,
  FolderKanban,
  Users,
  Phone,
  HelpCircle,
  Shield,
  FileText,
  Briefcase,
  ArrowRight,
  LayoutDashboard,
} from "lucide-react";

interface MegaMenuItem {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
}

const servicesItems: MegaMenuItem[] = [
  { label: "Software", href: "/services#software", icon: Globe, description: "Web apps, SaaS & internal tools" },
  { label: "Commerce", href: "/services#commerce", icon: ShoppingCart, description: "Storefronts & commerce systems" },
  { label: "AI", href: "/services#ai", icon: Bot, description: "AI-native software & agents" },
  { label: "Infrastructure", href: "/services#infrastructure", icon: Server, description: "Cloud, deployment & architecture" },
];

const companyItems: MegaMenuItem[] = [
  { label: "About Us", href: "/about", icon: Users, description: "Our mission and values" },
  { label: "Portfolio", href: "/portfolio", icon: FolderKanban, description: "See our past work" },
  { label: "Pricing", href: "/pricing", icon: CreditCard, description: "Transparent pricing plans" },
  { label: "Contact", href: "/contact", icon: Phone, description: "Get in touch with us" },
];

const resourceItems: MegaMenuItem[] = [
  { label: "FAQ", href: "/faq", icon: HelpCircle, description: "Common questions answered" },
  { label: "How It Works", href: "/#how-it-works", icon: Briefcase, description: "Our process explained" },
  { label: "Privacy Policy", href: "/privacy", icon: Shield, description: "How we handle your data" },
  { label: "Terms of Service", href: "/terms", icon: FileText, description: "Service agreement" },
];

const navGroups = [
  { label: "Services", items: servicesItems },
  { label: "Company", items: companyItems },
  { label: "Resources", items: resourceItems },
];

// Staggered blur-up for the full-screen mobile menu items.
const menuItemVariants = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

function MegaMenuDropdown({
  items,
  isOpen,
  onClose,
}: {
  items: MegaMenuItem[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[520px] rounded-3xl border border-white/10 bg-charcoal/95 ring-1 ring-inset ring-white/5 backdrop-blur-2xl p-3 shadow-2xl shadow-black/50 animate-fade-in z-50"
    >
      <div className="grid grid-cols-2 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-muted group"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false); // full-screen menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { isSignedIn } = useAuth();

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Pill-style floating header */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl">
        <div className="rounded-full border border-white/10 bg-charcoal/80 shadow-2xl shadow-black/40 ring-1 ring-inset ring-white/5 backdrop-blur-2xl">
          <div className="flex h-14 items-center justify-between pl-4 pr-3 sm:pl-5 sm:pr-3">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.svg"
                alt="Scalar"
                width={30}
                height={30}
                className="rounded-full"
              />
              <span className="font-brand text-base font-bold text-foreground hidden sm:inline">
                Scalar
              </span>
            </Link>

            {/* Desktop Mega Menu Nav */}
            <nav className="hidden items-center gap-0.5 lg:flex">
              {navGroups.map((group) => (
                <div key={group.label} className="relative">
                  <button
                    onClick={() =>
                      setOpenMenu(openMenu === group.label ? null : group.label)
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors cursor-pointer",
                      openMenu === group.label
                        ? "text-orange bg-orange/5"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {group.label}
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        openMenu === group.label && "rotate-180"
                      )}
                    />
                  </button>
                  <MegaMenuDropdown
                    items={group.items}
                    isOpen={openMenu === group.label}
                    onClose={() => setOpenMenu(null)}
                  />
                </div>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Desktop auth */}
              <div className="hidden items-center gap-2 lg:flex">
                {!isSignedIn ? (
                  <>
                    <Link
                      href="/sign-in"
                      className="rounded-full px-3.5 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/sign-up"
                      className="rounded-full bg-orange px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-orange/25 transition-all hover:bg-orange-dark hover:shadow-orange/40"
                    >
                      Get Started
                    </Link>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/dashboard">
                        <LayoutDashboard className="mr-1 h-4 w-4" />
                        Dashboard
                      </Link>
                    </Button>
                    <UserButton />
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <button
                className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Full-screen ASCII mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[100] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="absolute inset-0 bg-charcoal-dark/95 backdrop-blur-xl" />
            <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-30" cell={14} />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(90,176,232,0.18),transparent_60%)]" />

            <motion.div
              className="relative flex h-full flex-col overflow-y-auto"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Top */}
              <div className="flex items-center justify-between px-5 pt-6">
                <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                  <Image
                    src="/logo.svg"
                    alt="Scalar"
                    width={30}
                    height={30}
                    className="rounded-full"
                  />
                  <span className="font-brand font-bold text-white">Scalar</span>
                </Link>
                <button
                  aria-label="Close menu"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition-colors hover:bg-white/10"
                  onClick={() => setMobileOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Nav — big typographic groups, staggered in */}
              <motion.nav
                className="flex-1 space-y-9 px-5 py-10"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.12 } } }}
                initial="hidden"
                animate="show"
              >
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <motion.p
                      variants={menuItemVariants}
                      className="text-xs uppercase tracking-[0.3em] text-orange/80"
                    >
                      {group.label}
                    </motion.p>
                    <div className="mt-3 space-y-1.5">
                      {group.items.map((item) => (
                        <motion.div key={item.href} variants={menuItemVariants}>
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className="block font-brand text-3xl leading-tight text-white/90 transition-colors hover:text-orange"
                          >
                            {item.label}
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.nav>

              {/* Footer CTA */}
              <div className="space-y-3 border-t border-white/10 px-5 pb-8 pt-5">
                {!isSignedIn ? (
                  <>
                    <Link
                      href="/sign-up"
                      onClick={() => setMobileOpen(false)}
                      className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-orange text-sm font-semibold text-white transition-colors hover:bg-orange-dark"
                    >
                      Get Started
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/sign-in"
                      onClick={() => setMobileOpen(false)}
                      className="flex h-12 w-full items-center justify-center rounded-full border border-white/15 text-sm font-medium text-white/80 transition-colors hover:text-white"
                    >
                      Sign In
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-orange text-sm font-semibold text-white transition-colors hover:bg-orange-dark"
                  >
                    <LayoutDashboard className="h-4 w-4" />
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
