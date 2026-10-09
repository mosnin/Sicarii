"use client";

// The client component for /welcome. Handles the ICP input form, the SSE
// stream from /api/welcome, and the live table that fills row by row.
// No decorative icons. Calm, hairline-bordered panels and typography.

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
    <div className="mx-auto max-w-3xl py-2 sm:py-6">
      {/* Header */}
      <FloatIn>
        <div className="mb-5">
          <p className="twenty-label mb-1">
            Welcome to Scalar
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            {firstName ? `Hello, ${firstName}.` : "Hello."}
          </h1>
          <p className="mt-1 text-sm text-fg-tertiary">
            Tell Scalar who you sell to. In one sentence, it will build your CRM live.
          </p>
        </div>
      </FloatIn>

      {/* ICP input - shown when idle or running */}
      <AnimatePresence mode="wait">
        {phase !== "done" && (
          <motion.div key="input" {...(reduce ? {} : { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.2, ease: "easeOut" } })}>
            <section className="rounded-[8px] border border-border bg-background">
              <header className="flex h-10 items-center border-b border-border px-3">
                <label
                  htmlFor="icp-input"
                  className="text-sm font-medium text-foreground"
                >
                  Describe who you sell to
                </label>
              </header>
              <div className="p-3">
              <textarea
                id="icp-input"
                rows={3}
                className="w-full resize-none rounded-[4px] border border-input bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-fg-light focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 disabled:opacity-50"
                placeholder="e.g. Series A SaaS startups with 20-100 employees in the US that use Salesforce"
                value={icp}
                onChange={(e) => setIcp(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={phase === "running"}
                maxLength={500}
              />

              {/* One-tap examples to remove the blank-page friction */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="self-center text-sm text-fg-tertiary">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setIcp(ex.value)}
                    disabled={phase === "running"}
                    className="h-7 rounded-[4px] border border-border bg-background px-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-foreground disabled:opacity-50"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={skip}
                  className="text-sm text-fg-tertiary underline-offset-2 hover:text-foreground hover:underline"
                >
                  Skip for now
                </button>
                <Button
                  onClick={handleSubmit}
                  disabled={!icp.trim() || phase === "running"}
                >
                  {phase === "running" ? "Building your CRM..." : "Build my CRM"}
                </Button>
              </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live status line */}
      <AnimatePresence>
        {statusLine && (
          <motion.p
            key={statusLine}
            className="mt-4 text-sm text-fg-tertiary"
            {...(reduce
              ? {}
              : {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  exit: { opacity: 0 },
                  transition: { duration: 0.15 },
                })}
          >
            {statusLine}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Sample data notice */}
      {hasSamples && companies.length > 0 && (
        <p className="mt-1 text-xs text-fg-tertiary">
          Sample data shown. Configure EXA_API_KEY to discover real companies.
        </p>
      )}

      {/* Live table */}
      {companies.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-[8px] border border-border bg-background">
          <table className="twenty-table">
            <thead>
              <tr>
                <th>Company</th>
                <th className="hidden sm:table-cell">Industry</th>
                <th className="hidden md:table-cell">Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
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
          className="mt-4 rounded-[8px] border border-border bg-background"
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 4 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.2, ease: "easeOut" },
              })}
        >
          <header className="flex h-10 items-center justify-between border-b border-border px-3">
            <h2 className="text-sm font-medium text-foreground">
              Your CRM is already{" "}
              <span className="text-primary">working</span>.
            </h2>
            <span className="twenty-label">Ready</span>
          </header>
          <div className="p-3">
          {summary.total > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-[8px] border border-border px-3 py-2.5">
                <p className="twenty-label">
                  compan{summary.total === 1 ? "y" : "ies"}
                </p>
                <span className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
                  <CountUp value={summary.total} duration={0.8} />
                </span>
              </div>
              {summary.enriched > 0 && (
                <div className="rounded-[8px] border border-border px-3 py-2.5">
                  <p className="twenty-label">enriched</p>
                  <span className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
                    <CountUp value={summary.enriched} duration={0.9} />
                  </span>
                </div>
              )}
              {summary.hasNews > 0 && (
                <div className="rounded-[8px] border border-border px-3 py-2.5">
                  <p className="twenty-label">with news</p>
                  <span className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
                    <CountUp value={summary.hasNews} duration={1} />
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={goToDashboard}>
              See your CRM
            </Button>
            <Button variant="outline" asChild>
              <Link href="/integrations">Connect your agent</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-fg-tertiary">
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
          </div>
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
    found: "bg-tag-gray-bg text-tag-gray",
    enriching: "bg-tag-blue-bg text-tag-blue animate-pulse",
    enriched: "bg-tag-green-bg text-tag-green",
    news: "bg-tag-purple-bg text-tag-purple",
    sample: "bg-tag-gray-bg text-tag-gray italic",
  };

  return (
    <motion.tr
      layout={!reduce}
      {...(reduce
        ? {}
        : {
            initial: { opacity: 0, y: 4 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.2, ease: "easeOut" },
          })}
      className="align-top"
    >
      <td className="py-1.5">
        <div className="font-medium text-foreground">{company.name}</div>
        {company.domain && (
          <div className="mt-0.5 text-xs text-fg-tertiary">{company.domain}</div>
        )}
        {company.newsHeadline && (
          <div className="mt-0.5 text-xs text-primary">{company.newsHeadline}</div>
        )}
        {company.description && !company.newsHeadline && (
          <div className="mt-0.5 line-clamp-2 text-xs text-fg-tertiary">
            {company.description}
          </div>
        )}
      </td>
      <td className="hidden py-1.5 text-fg-secondary sm:table-cell">
        {company.industry ?? "-"}
      </td>
      <td className="hidden py-1.5 text-fg-secondary md:table-cell">
        {company.location ?? "-"}
      </td>
      <td className="py-1.5">
        <span className={`inline-flex h-5 items-center whitespace-nowrap rounded-[4px] px-1.5 text-xs font-medium ${statusColor[company.status]}`}>
          {statusLabel[company.status]}
        </span>
      </td>
    </motion.tr>
  );
}
