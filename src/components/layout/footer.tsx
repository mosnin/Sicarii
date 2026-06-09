import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";

const footerLinks = {
  product: [
    { label: "Capabilities", href: "/#capabilities" },
    { label: "Intelligence", href: "/#intelligence" },
    { label: "Pricing", href: "/pricing" },
    { label: "Manifesto", href: "/manifesto" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Security", href: "/security" },
    { label: "Contact", href: "/contact" },
    { label: "FAQ", href: "/faq" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Acceptable Use", href: "/acceptable-use" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "Subprocessors", href: "/subprocessors" },
    { label: "DPA", href: "/dpa" },
    { label: "Refund Policy", href: "/refund-policy" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-muted/30 px-4 pb-6 sm:px-6 dark:bg-charcoal-dark">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-border bg-card dark:bg-white/[0.02]">
        <div className="px-6 py-12 sm:px-8 lg:px-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="col-span-2 space-y-4 md:col-span-1">
              <Link href="/" className="flex items-center gap-2">
                <LogoMark className="h-7 w-7" />
                <span className="font-brand text-lg font-bold text-foreground">Scalar</span>
              </Link>
              <p className="max-w-xs text-sm text-muted-foreground">
                The CRM your agents run. Discover leads, enrich your database, and
                run email relationships - on data that never leaves your system.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-xs uppercase tracking-[0.2em] text-orange/80">Product</h4>
              <ul className="space-y-2.5">
                {footerLinks.product.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs uppercase tracking-[0.2em] text-orange/80">Company</h4>
              <ul className="space-y-2.5">
                {footerLinks.company.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs uppercase tracking-[0.2em] text-orange/80">Legal</h4>
              <ul className="space-y-2.5">
                {footerLinks.legal.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-between sm:px-8 lg:px-12">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Scalar. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">tryscalar.xyz</p>
        </div>
      </div>
    </footer>
  );
}
