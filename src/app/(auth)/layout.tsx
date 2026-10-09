import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { AsciiField } from "@/components/dashboard/ascii-field";

// The proof points under the form. No client counts, no invented stats:
// just what the product is, stated plainly.
const proofPoints = [
  "Structured storage, a real UI, and built-in intelligence in one system.",
  "Your agent operates it directly over MCP. Discover, enrich, track, email.",
  "Your data stays yours. Isolated per account, never resold, never used to train.",
];

/**
 * The shell for sign-in and sign-up, in Twenty's login look: a quiet
 * surface over the low-opacity ASCII signature, one centered column with a
 * small logo tile, a heading, and the Clerk form. The `app-shell` class
 * applies the 13px app type scale.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell relative min-h-screen w-full overflow-hidden bg-background">
      {/* Signature backdrop */}
      <AsciiField
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07] dark:opacity-[0.15]"
        cell={14}
        speed={0.06}
        gradient
      />
      {/* Back to home */}
      <Link
        href="/"
        className="absolute left-4 top-4 z-20 inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
        Home
      </Link>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16">
        <div className="mx-auto flex w-full max-w-sm flex-col items-center">
          <Link
            href="/"
            aria-label="Scalar"
            className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border bg-card"
          >
            <LogoMark className="h-6 w-6" />
          </Link>
          <h1 className="mt-4 text-center text-xl font-semibold text-foreground">
            Welcome to Scalar
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            The CRM your agents run.
          </p>

          <div className="mt-6 w-full min-w-0">{children}</div>

          <ul className="mt-8 w-full space-y-1.5">
            {proofPoints.map((point) => (
              <li key={point} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-[7px] h-px w-2.5 shrink-0 bg-muted-foreground/40" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-muted-foreground/70">
            &copy; {new Date().getFullYear()} Scalar. A single source of truth you control.
          </p>
        </div>
      </div>
    </div>
  );
}
