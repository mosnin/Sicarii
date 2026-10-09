import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";

const footerLinks = {
  product: [
    { label: "Capabilities", href: "/#capabilities" },
    { label: "Intelligence", href: "/#intelligence" },
    { label: "Integrations", href: "/integrations" },
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
    <footer className="bg-surface px-4 pb-6 sm:px-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[12px] border border-border bg-background">
        <div className="px-6 py-12 sm:px-8 lg:px-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="col-span-2 space-y-4 md:col-span-1">
              <Link href="/" className="flex items-center gap-2">
                <LogoMark className="h-6 w-6" />
                <span className="text-base font-semibold text-foreground">Scalar</span>
              </Link>
              <p className="max-w-xs text-sm text-fg-secondary">
                The CRM your agents run. Discover leads, enrich your database, and
                run email relationships - on data that never leaves your system.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-medium text-fg-tertiary">Product</h4>
              <ul className="space-y-2.5">
                {footerLinks.product.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-fg-secondary transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-medium text-fg-tertiary">Company</h4>
              <ul className="space-y-2.5">
                {footerLinks.company.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-fg-secondary transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-medium text-fg-tertiary">Legal</h4>
              <ul className="space-y-2.5">
                {footerLinks.legal.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-fg-secondary transition-colors hover:text-foreground"
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
          <p className="text-xs text-fg-tertiary">
            &copy; {new Date().getFullYear()} Scalar. All rights reserved.
          </p>
          <p className="text-xs text-fg-tertiary">tryscalar.xyz</p>
        </div>
      </div>
    </footer>
  );
}
