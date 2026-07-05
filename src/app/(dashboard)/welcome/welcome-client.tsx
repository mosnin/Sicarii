"use client";

// The client component for /welcome. Handles the ICP input form, the SSE
// stream from /api/welcome, and the live table that fills row by row.
// No decorative icons. Baby-blue + white brand. Calm typography.

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { FloatIn } from "@/components/ui/float-in";
import { CountUp } from "@/components/ui/count-up";
import type { WelcomeEvent, WelcomeCompanyRow } from "@/lib/welcome-orchestrator";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type Phase = "idle" | "running" | "done";

// One-tap example prompts so the first run never starts from a blank page.
const EXAMPLES = [
  { label: "Series A SaaS, US", value: "Series A SaaS startups with 20 to 100 employees in the US that use Salesforce" },
  { label: "Fintech hiring SDRs", value: "Series B fintech companies hiring SDRs" },
  { label: "AI infra startups", value: "AI infrastructure startups that raised funding in the last year" },
];

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export function WelcomeClient({ firstName }: { firstName?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [icp, setIcp] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusLine, setStatusLine] = useState("");
  const [companies, setCompanies] = useState<WelcomeCompanyRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; enriched: number; hasNews: number } | null>(null);
  const [radarSeeded, setRadarSeeded] = useState(false);
  const [hasSamples, setHasSamples] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(async () => {
    const query = icp.trim();
    if (!query || phase === "running") return;

    setPhase("running");
    setStatusLine("Starting...");
    setCompanies([]);
    setSummary(null);
    setHasSamples(false);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icp: query }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "Unknown error");
        setStatusLine(`Something went wrong: ${text}`);
        setPhase("idle");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Read SSE stream until done.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          let event: WelcomeEvent;
          try {
            event = JSON.parse(jsonStr) as WelcomeEvent;
          } catch {
            continue;
          }

          processEvent(event);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[welcome] stream error", err);
      setStatusLine("Something went wrong. You can still use your CRM.");
      setPhase("done");
    }

    function processEvent(event: WelcomeEvent) {
      switch (event.type) {
        case "status":
          if (event.message) setStatusLine(event.message);
          break;

        case "company":
          if (event.company) {
            if (event.company.isSample) setHasSamples(true);
            setCompanies((prev) => {
              const idx = prev.findIndex((r) => r.id === event.company!.id);
              if (idx === -1) return [...prev, event.company!];
              const next = [...prev];
              next[idx] = event.company!;
              return next;
            });
          }
          break;

        case "enriched":
        case "news":
          if (event.company) {
            setCompanies((prev) => {
              const idx = prev.findIndex((r) => r.id === event.company!.id);
              if (idx === -1) return [...prev, event.company!];
              const next = [...prev];
              next[idx] = event.company!;
              return next;
            });
          }
          break;

        case "error":
          // Non-fatal: update status line but keep running.
          if (event.message) setStatusLine(event.message);
          break;

        case "done":
          if (event.message) setStatusLine(event.message);
          setSummary({
            total: event.total ?? 0,
            enriched: event.enriched ?? 0,
            hasNews: event.hasNews ?? 0,
          });
          setRadarSeeded(Boolean(event.radarSeeded));
          setPhase("done");
          break;
      }
    }
  }, [icp, phase]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const goToDashboard = () => router.push("/dashboard");
  const skip = () => router.push("/dashboard");

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      {/* Header */}
      <FloatIn>
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary">
            Welcome to Scalar
          </p>
          <h1 className="font-brand text-4xl text-foreground sm:text-5xl">
            {firstName ? `Hello, ${firstName}.` : "Hello."}
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Tell Scalar who you sell to. In one sentence, it will build your CRM live.
          </p>
        </div>
      </FloatIn>

      {/* ICP input - shown when idle or running */}
      <AnimatePresence mode="wait">
        {phase !== "done" && (
          <motion.div key="input" {...(reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } })}>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <label
                htmlFor="icp-input"
                className="mb-3 block text-sm font-medium text-foreground"
              >
                Describe who you sell to
              </label>
              <textarea
                id="icp-input"
                rows={3}
                className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                placeholder="e.g. Series A SaaS startups with 20-100 employees in the US that use Salesforce"
                value={icp}
                onChange={(e) => setIcp(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={phase === "running"}
                maxLength={500}
              />

              {/* One-tap examples to remove the blank-page friction */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="self-center text-xs text-muted-foreground">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setIcp(ex.value)}
                    disabled={phase === "running"}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={skip}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Skip for now
                </button>
                <Button
                  onClick={handleSubmit}
                  disabled={!icp.trim() || phase === "running"}
                  size="lg"
                >
                  {phase === "running" ? "Building your CRM..." : "Build my CRM"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live status line */}
      <AnimatePresence>
        {statusLine && (
          <motion.p
            key={statusLine}
            className="mt-6 text-center text-sm text-muted-foreground"
            {...(reduce
              ? {}
              : {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  exit: { opacity: 0 },
                  transition: { duration: 0.3 },
                })}
          >
            {statusLine}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Sample data notice */}
      {hasSamples && companies.length > 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Sample data shown. Configure EXA_API_KEY to discover real companies.
        </p>
      )}

      {/* Live table */}
      {companies.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Company
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                  Industry
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence initial={false}>
                {companies.map((company) => (
                  <CompanyRow key={company.id} company={company} reduce={!!reduce} />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Done - end card */}
      {phase === "done" && summary !== null && (
        <motion.div
          className="mt-10 rounded-2xl border border-border bg-card p-8 text-center shadow-sm"
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 16 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
              })}
        >
          <p className="mb-1 text-xs uppercase tracking-[0.3em] text-primary">
            Ready
          </p>
          <h2 className="font-brand text-3xl text-foreground">
            Your CRM is already{" "}
            <span className="text-gradient-orange">working</span>.
          </h2>
          {summary.total > 0 && (
            <div className="mt-6 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-3">
              <div className="flex items-baseline gap-2">
                <span className="font-brand text-4xl tabular-nums text-foreground">
                  <CountUp value={summary.total} duration={1.2} />
                </span>
                <span className="text-sm text-muted-foreground">
                  compan{summary.total === 1 ? "y" : "ies"}
                </span>
              </div>
              {summary.enriched > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="font-brand text-4xl tabular-nums text-primary">
                    <CountUp value={summary.enriched} duration={1.5} />
                  </span>
                  <span className="text-sm text-muted-foreground">enriched</span>
                </div>
              )}
              {summary.hasNews > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="font-brand text-4xl tabular-nums text-foreground">
                    <CountUp value={summary.hasNews} duration={1.7} />
                  </span>
                  <span className="text-sm text-muted-foreground">with news</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={goToDashboard}>
              See your CRM
            </Button>
            <Link
              href="/integrations"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Connect your agent
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {radarSeeded ? (
              <>
                Your agent will keep scanning for matches every week, so there&apos;s
                something new when you return. Manage or pause it anytime in{" "}
                <Link href="/radar" className="text-primary hover:underline">
                  Radar
                </Link>
                .
              </>
            ) : (
              <>Next: connect an agent over MCP and it keeps your database growing.</>
            )}
          </p>
        </motion.div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Single company row - animates in and updates status in-place
// --------------------------------------------------------------------------

function CompanyRow({
  company,
  reduce,
}: {
  company: WelcomeCompanyRow;
  reduce: boolean;
}) {
  const statusLabel: Record<WelcomeCompanyRow["status"], string> = {
    found: "Found",
    enriching: "Enriching...",
    enriched: "Enriched",
    news: "Signal",
    sample: "Sample",
  };

  const statusColor: Record<WelcomeCompanyRow["status"], string> = {
    found: "text-muted-foreground",
    enriching: "text-primary animate-pulse",
    enriched: "text-foreground",
    news: "text-primary font-medium",
    sample: "text-muted-foreground italic",
  };

  return (
    <motion.tr
      layout={!reduce}
      {...(reduce
        ? {}
        : {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
          })}
      className="align-top transition-colors hover:bg-muted/30"
    >
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">{company.name}</div>
        {company.domain && (
          <div className="mt-0.5 text-xs text-muted-foreground">{company.domain}</div>
        )}
        {company.newsHeadline && (
          <div className="mt-1 text-xs text-primary">{company.newsHeadline}</div>
        )}
        {company.description && !company.newsHeadline && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {company.description}
          </div>
        )}
      </td>
      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
        {company.industry ?? "-"}
      </td>
      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
        {company.location ?? "-"}
      </td>
      <td className={`px-4 py-3 text-xs ${statusColor[company.status]}`}>
        {statusLabel[company.status]}
      </td>
    </motion.tr>
  );
}
