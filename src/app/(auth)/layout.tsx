import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { AsciiField } from "@/components/dashboard/ascii-field";

// The proof points on the brand panel. No client counts, no invented stats:
// just what the product is, stated plainly. Kept to three so the panel breathes.
const proofPoints = [
  "Structured storage, a real UI, and built-in intelligence in one system.",
  "Your agent operates it directly over MCP. Discover, enrich, track, email.",
  "Your data stays yours. Isolated per account, never resold, never used to train.",
];

/**
 * The shell for sign-in and sign-up. A split screen: a brand panel on the left
 * (hidden on mobile) over the ASCII signature, and the Clerk form on the right.
 * Replaces the bare centered form so the front door matches the product.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Signature backdrop */}
      <AsciiField
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.10] dark:opacity-[0.22]"
        cell={14}
        speed={0.06}
        gradient
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_12%_8%,rgba(90,176,232,0.16),transparent_60%)]" />

      {/* Back to home, floating over both columns */}
      <Link
        href="/"
        className="absolute left-5 top-5 z-20 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3.5 py-1.5 text-sm text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Home
      </Link>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between border-r border-border bg-card/40 p-12 backdrop-blur-sm lg:flex xl:p-16">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="font-brand text-xl font-bold text-foreground">Scalar</span>
          </Link>

          <div className="max-w-md">
            <p className="text-xs uppercase tracking-[0.3em] text-orange/80">
              The CRM your agents run
            </p>
            <h2 className="font-brand mt-4 text-3xl leading-tight text-foreground xl:text-4xl">
              Give agent work a home it{" "}
              <span className="text-gradient-orange">never forgets</span>.
            </h2>
            <ul className="mt-8 space-y-4">
              {proofPoints.map((point) => (
                <li key={point} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-2 h-px w-4 shrink-0 bg-orange/60" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Scalar. A single source of truth you control.
          </p>
        </div>

        {/* Form panel */}
        <div className="flex flex-col items-center justify-center px-4 py-20 sm:px-8">
          {/* Mobile wordmark (the brand panel is hidden below lg) */}
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <LogoMark className="h-8 w-8" />
            <span className="font-brand text-xl font-bold text-foreground">Scalar</span>
          </Link>
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
