import Link from "next/link";
import Image from "next/image";

const footerLinks = {
  build: [
    { label: "Software", href: "/services#software" },
    { label: "Commerce", href: "/services#commerce" },
    { label: "AI", href: "/services#ai" },
    { label: "Infrastructure", href: "/services#infrastructure" },
  ],
  studio: [
    { label: "About Us", href: "/about" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact", href: "/contact" },
    { label: "FAQ", href: "/faq" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Client Login", href: "/sign-in" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-charcoal-dark px-4 pb-6 sm:px-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
        <div className="px-6 py-12 sm:px-8 lg:px-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="col-span-2 space-y-4 md:col-span-1">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/logo.svg"
                  alt="Scalar"
                  width={30}
                  height={30}
                  className="rounded-full"
                />
                <span className="font-brand text-lg font-bold text-white">Scalar</span>
              </Link>
              <p className="max-w-xs text-sm text-white/50">
                The CRM your agents run. Discover leads, enrich your database, and
                run email relationships — on data that never leaves your system.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-xs uppercase tracking-[0.2em] text-orange/80">Build</h4>
              <ul className="space-y-2.5">
                {footerLinks.build.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/55 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs uppercase tracking-[0.2em] text-orange/80">Studio</h4>
              <ul className="space-y-2.5">
                {footerLinks.studio.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/55 transition-colors hover:text-white"
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
                      className="text-sm text-white/55 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 border-t border-white/10 px-6 py-4 sm:flex-row sm:justify-between sm:px-8 lg:px-12">
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} Scalar. All rights reserved.
          </p>
          <p className="text-xs text-white/40">tryscalar.xyz</p>
        </div>
      </div>
    </footer>
  );
}
