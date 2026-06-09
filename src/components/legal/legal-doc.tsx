import Link from "next/link";
import type { ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";

export interface LegalSection {
  heading: string;
  body?: ReactNode[];
  bullets?: ReactNode[];
}

/**
 * The shared frame for every legal document: Privacy, Terms, Acceptable Use,
 * Cookies, Subprocessors, DPA, Refunds. One layout, one voice, so the legal
 * suite reads like a single brand instead of seven mismatched pages. Sections
 * are numbered automatically and accept paragraphs and/or bullet lists.
 */
export function LegalDoc({
  badge = "Legal",
  title,
  updated,
  intro,
  sections,
  related,
}: {
  badge?: string;
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
  related?: { label: string; href: string }[];
}) {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 sm:py-28">
          <div className="absolute inset-0 bg-muted/40 dark:bg-charcoal-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.10),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="orange" className="mb-4">{badge}</Badge>
            <h1 className="font-brand text-4xl tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">Last updated: {updated}</p>
          </div>
        </section>

        {/* Body */}
        <section className="pb-24">
          <div className="mx-auto max-w-3xl px-4">
            <p className="text-base leading-relaxed text-muted-foreground">{intro}</p>

            <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
              {sections.map((section, i) => (
                <div key={section.heading}>
                  <h2 className="font-brand text-lg text-foreground">
                    {i + 1}. {section.heading}
                  </h2>
                  {section.body?.map((paragraph, j) => (
                    <p key={j} className="mt-3">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets && (
                    <ul className="mt-3 space-y-2">
                      {section.bullets.map((bullet, j) => (
                        <li key={j} className="flex gap-3">
                          <span className="mt-2 h-px w-3 shrink-0 bg-orange/60" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {related && related.length > 0 && (
              <div className="mt-14 border-t border-border pt-8">
                <p className="text-xs uppercase tracking-[0.25em] text-orange/80">Related</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {related.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-orange/40 hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-12 text-sm text-muted-foreground">
              Questions about this document? Email{" "}
              <a href="mailto:hello@tryscalar.xyz" className="text-orange hover:text-orange-dark">
                hello@tryscalar.xyz
              </a>
              .
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/** A small inline link styled for legal-page prose. */
export function L({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-orange hover:text-orange-dark"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className="text-orange hover:text-orange-dark">
      {children}
    </Link>
  );
}
