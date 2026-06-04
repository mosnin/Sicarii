"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  Globe,
  ShoppingCart,
  TrendingUp,
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
  { label: "Web Applications", href: "/services#web-application", icon: Globe, description: "Custom web apps built to scale" },
  { label: "Ecommerce Stores", href: "/services#ecommerce-store", icon: ShoppingCart, description: "High-converting online stores" },
  { label: "Funnels", href: "/services#funnels", icon: TrendingUp, description: "Sales funnels that convert" },
  { label: "AI Automation", href: "/services#ai-automation", icon: Bot, description: "Automate with AI workflows" },
  { label: "Open Claw Deployment", href: "/services#open-claw-deployment", icon: Server, description: "Deploy & manage Open Claw" },
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
      className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[520px] rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-3 shadow-2xl animate-fade-in z-50"
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange/10 group-hover:bg-orange/20 transition-colors">
                <Icon className="h-4 w-4 text-orange" />
              </div>
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
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
        <div className="rounded-2xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-lg shadow-black/10">
          <div className="flex h-14 items-center justify-between px-4 sm:px-5">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.svg"
                alt="Sicarii"
                width={32}
                height={32}
                className="rounded-md"
              />
              <span className="text-base font-bold text-foreground hidden sm:inline">
                Sicarii
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
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/sign-in">Sign In</Link>
                    </Button>
                    <RainbowButton className="h-9 px-5 text-sm rounded-lg" asChild>
                      <Link href="/sign-up">
                        Get Started
                      </Link>
                    </RainbowButton>
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

      {/* Full-page mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />

          {/* Sidebar panel */}
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border shadow-2xl animate-slide-in-right flex flex-col">
            {/* Sidebar header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Link
                href="/"
                className="flex items-center gap-2"
                onClick={() => setMobileOpen(false)}
              >
                <Image
                  src="/logo.svg"
                  alt="Sicarii"
                  width={28}
                  height={28}
                  className="rounded-md"
                />
                <span className="font-bold">Sicarii</span>
              </Link>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer"
                onClick={() => setMobileOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Sidebar nav */}
            <div className="flex-1 overflow-y-auto p-4">
              <nav className="space-y-1">
                {navGroups.map((group) => (
                  <div key={group.label} className="mb-2">
                    <button
                      onClick={() =>
                        setExpandedGroup(
                          expandedGroup === group.label ? null : group.label
                        )
                      }
                      className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold hover:bg-muted transition-colors cursor-pointer"
                    >
                      {group.label}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          expandedGroup === group.label && "rotate-180"
                        )}
                      />
                    </button>
                    {expandedGroup === group.label && (
                      <div className="mt-1 ml-2 space-y-0.5">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                              onClick={() => setMobileOpen(false)}
                            >
                              <Icon className="h-4 w-4 text-orange" />
                              <div>
                                <p className="font-medium text-foreground">{item.label}</p>
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </nav>
            </div>

            {/* Sidebar footer */}
            <div className="p-4 border-t border-border space-y-2">
              {!isSignedIn ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    asChild
                  >
                    <Link href="/sign-in" onClick={() => setMobileOpen(false)}>
                      Sign In
                    </Link>
                  </Button>
                  <RainbowButton
                    className="w-full h-11 rounded-xl text-sm"
                    onClick={() => setMobileOpen(false)}
                    asChild
                  >
                    <Link href="/sign-up">
                      Get Started
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </RainbowButton>
                </>
              ) : (
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                    <LayoutDashboard className="mr-1 h-4 w-4" />
                    Dashboard
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
