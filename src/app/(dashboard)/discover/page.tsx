"use client";

import { useReducer, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "motion/react";
import {
  Globe,
  Mails,
  Building2,
  UserSearch,
  Plus,
  ArrowLeft,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { DiscoverWorking } from "@/components/dashboard/discover-working";
import { cn } from "@/lib/utils";

// ─── types ──────────────────────────────────────────────────────────────────

type SaveAs = "entity" | "contact";
type Field = { key: string; label: string; placeholder: string };

type Tool = {
  id: "enrich-domain" | "find-email" | "extract-urls" | "company-leads";
  icon: typeof Building2;
  title: string;
  body: string;
  saveAs: SaveAs;
  fields: Field[];
};

type Stage = "grid" | "input" | "working" | "results" | "queued";

type State = {
  stage: Stage;
  active: Tool | null;
  values: Record<string, string>;
  records: Record<string, unknown>[] | null;
  error: string | null;
};

type Action =
  | { type: "OPEN_TOOL"; tool: Tool }
  | { type: "BACK" }
  | { type: "SET_VALUE"; key: string; value: string }
  | { type: "RUN" }
  | { type: "SUCCESS"; records: Record<string, unknown>[] }
  | { type: "QUEUED" }
  | { type: "FAIL"; error: string };

// ─── constants ───────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    id: "enrich-domain",
    icon: Building2,
    title: "Enrich by domain",
    body: "Give a company domain, get a fully enriched company profile.",
    saveAs: "entity",
    fields: [{ key: "domain", label: "Company domain", placeholder: "acme.com" }],
  },
  {
    id: "find-email",
    icon: UserSearch,
    title: "Find emails",
    body: "First name + last name + company domain → a verified email.",
    saveAs: "contact",
    fields: [
      { key: "firstName", label: "First name", placeholder: "Jane" },
      { key: "lastName", label: "Last name", placeholder: "Doe" },
      { key: "domain", label: "Company domain", placeholder: "acme.com" },
    ],
  },
  {
    id: "extract-urls",
    icon: Globe,
    title: "Extract from a URL",
    body: "Paste a website, pull emails, phones, and socials.",
    saveAs: "contact",
    fields: [{ key: "url", label: "Website URL", placeholder: "https://acme.com/team" }],
  },
  {
    id: "company-leads",
    icon: Mails,
    title: "Company name → leads",
    body: "Turn a company name into enriched company records.",
    saveAs: "entity",
    fields: [{ key: "companyName", label: "Company name", placeholder: "Acme Inc." }],
  },
];

const SPRING = [0.16, 1, 0.3, 1] as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeRecords(result: unknown): Record<string, unknown>[] {
  if (result == null) return [];
  if (Array.isArray(result)) return result.filter(isObj);
  if (isObj(result)) {
    for (const v of Object.values(result)) {
      if (Array.isArray(v) && v.some(isObj)) return v.filter(isObj);
    }
    return [result];
  }
  return [];
}

function deepFind(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 4 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = deepFind(v, keys, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (
        typeof v === "string" &&
        v.trim() &&
        keys.some((key) => k.toLowerCase().includes(key))
      ) {
        return v.trim();
      }
    }
    for (const v of Object.values(value)) {
      const f = deepFind(v, keys, depth + 1);
      if (f) return f;
    }
  }
  return undefined;
}

type Extracted = {
  name?: string;
  email?: string;
  title?: string;
  company?: string;
  domain?: string;
  website?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
};

function extract(rec: Record<string, unknown>): Extracted {
  return {
    name: deepFind(rec, ["full_name", "fullname", "name", "contact"]),
    email: deepFind(rec, ["email"]),
    title: deepFind(rec, ["title", "position", "role", "headline"]),
    company: deepFind(rec, ["company", "organization", "employer"]),
    domain: deepFind(rec, ["domain"]),
    website: deepFind(rec, ["website", "url", "link"]),
    phone: deepFind(rec, ["phone", "tel"]),
    location: deepFind(rec, ["location", "city", "country", "region"]),
    linkedin: deepFind(rec, ["linkedin"]),
  };
}

/** Strip null/undefined/"" values from an object. */
function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null && v !== "")
  ) as Partial<T>;
}

// ─── reducer ─────────────────────────────────────────────────────────────────

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "OPEN_TOOL":
      return {
        ...state,
        stage: "input",
        active: action.tool,
        values: {},
        records: null,
        error: null,
      };
    case "BACK":
      return {
        ...state,
        stage: "grid",
        active: null,
        records: null,
        error: null,
      };
    case "SET_VALUE":
      return {
        ...state,
        values: { ...state.values, [action.key]: action.value },
      };
    case "RUN":
      return { ...state, stage: "working", error: null, records: null };
    case "SUCCESS":
      return { ...state, stage: "results", records: action.records };
    case "QUEUED":
      return { ...state, stage: "queued", error: null };
    case "FAIL":
      return { ...state, stage: "input", error: action.error };
    default:
      return state;
  }
}

const INITIAL: State = {
  stage: "grid",
  active: null,
  values: {},
  records: null,
  error: null,
};

// ─── motion helpers ───────────────────────────────────────────────────────────

const slideVariants = {
  initial: (dir: number) => ({ opacity: 0, y: dir * 14 }),
  animate: { opacity: 1, y: 0 },
  exit: (dir: number) => ({ opacity: 0, y: dir * -10 }),
};

// ─── recent results panel ─────────────────────────────────────────────────────

type RecentItem = {
  id: string;
  kind: "contact" | "entity";
  name?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  domain?: string | null;
  location?: string | null;
  source: string;
  createdAt: string;
};

function RecentResults({ pollWhilePending }: { pollWhilePending: boolean }) {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/discover/recent");
      const data = await res.json().catch(() => ({}));
      if (data.results) setItems(data.results);
      if (typeof data.pendingJobs === "number") setPending(data.pendingJobs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 8s while jobs are pending so results appear without a refresh.
  useEffect(() => {
    if (!pollWhilePending && pending === 0) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load, pending, pollWhilePending]);

  if (loading) return null;
  if (items.length === 0 && pending === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-brand text-base text-foreground">Recent results</h2>
        {pending > 0 && (
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            <Clock className="h-3 w-3" />
            {pending} pending
          </motion.span>
        )}
      </div>

      <div className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
        {items.map((item) => {
          const label = item.name ?? item.company ?? item.domain ?? item.email ?? "Unnamed";
          const sub = item.kind === "contact"
            ? [item.title, item.company].filter(Boolean).join(" · ")
            : item.domain ?? item.location ?? "";
          const href = item.kind === "contact" ? `/crm/contacts/${item.id}` : `/crm/entities/${item.id}`;
          const isWebhook = item.source === "synthoz-webhook";

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {item.kind}
                  </span>
                  {isWebhook && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      webhook
                    </span>
                  )}
                </div>
                <p className="font-brand truncate text-sm text-foreground">{label}</p>
                {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
              </div>
              <Link
                href={href}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const reduce = useReducedMotion();
  const { stage, active, values, records, error } = state;
  const hasQueued = stage === "queued";

  const run = useCallback(async () => {
    if (!active) return;
    dispatch({ type: "RUN" });
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: active.id, ...values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dispatch({
          type: "FAIL",
          error: data?.error ?? "Discovery failed. Please try again.",
        });
        return;
      }
      if (data?.queued) {
        dispatch({ type: "QUEUED" });
        return;
      }
      dispatch({ type: "SUCCESS", records: normalizeRecords(data.result) });
    } catch {
      dispatch({ type: "FAIL", error: "Network error — please try again." });
    }
  }, [active, values]);

  // Keyboard shortcut: Enter submits from input stage
  useEffect(() => {
    if (stage !== "input") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) run();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stage, run]);

  // Direction: forward = +1, backward = -1
  const stageOrder: Stage[] = ["grid", "input", "working", "results"];
  const stageDir = (from: Stage, to: Stage) =>
    stageOrder.indexOf(to) >= stageOrder.indexOf(from) ? 1 : -1;
  // We track stage transitions implicitly through AnimatePresence keys.

  return (
    <div className="space-y-8">
      {/* Header */}
      <FloatIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-brand text-2xl sm:text-3xl">Discover</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Pull real company &amp; contact data, then drop it straight into your CRM.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/crm/new">
              <Plus className="mr-1 h-4 w-4" />
              Add manually
            </Link>
          </Button>
        </div>
      </FloatIn>

      <AnimatePresence mode="wait" custom={1}>
        {/* ── GRID ── */}
        {stage === "grid" && (
          <motion.div
            key="grid"
            custom={-1}
            variants={reduce ? undefined : slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.32, ease: SPRING }}
            className="space-y-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {TOOLS.map((t, i) => (
                <FloatIn key={t.id} delay={i * 0.06}>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "OPEN_TOOL", tool: t })}
                    className="block w-full text-left"
                  >
                    <SpotlightCard className="h-full p-6">
                      <h3 className="font-brand text-lg">{t.title}</h3>
                      <p className="text-muted-foreground mt-1 text-sm">{t.body}</p>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                        Run tool
                      </span>
                    </SpotlightCard>
                  </button>
                </FloatIn>
              ))}
            </div>
            <RecentResults pollWhilePending={hasQueued} />
          </motion.div>
        )}

        {/* ── INPUT ── */}
        {stage === "input" && active && (
          <motion.div
            key={`input-${active.id}`}
            custom={stageDir("grid", "input")}
            variants={reduce ? undefined : slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.32, ease: SPRING }}
            className="space-y-4"
          >
            <button
              type="button"
              onClick={() => dispatch({ type: "BACK" })}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> All tools
            </button>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="font-brand text-lg">{active.title}</h2>
                <p className="text-muted-foreground text-sm">{active.body}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {active.fields.map((f) => (
                  <div
                    key={f.key}
                    className={cn(active.fields.length === 1 && "sm:col-span-2")}
                  >
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      {f.label}
                    </label>
                    <Input
                      value={values[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_VALUE",
                          key: f.key,
                          value: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Button onClick={run}>
                  Run tool
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-foreground">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── WORKING ── */}
        {stage === "working" && (
          <motion.div
            key="working"
            custom={1}
            variants={reduce ? undefined : slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.32, ease: SPRING }}
          >
            <DiscoverWorking />
          </motion.div>
        )}

        {/* ── QUEUED ── */}
        {stage === "queued" && active && (
          <motion.div
            key="queued"
            custom={1}
            variants={reduce ? undefined : slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.32, ease: SPRING }}
            className="space-y-4"
          >
            <button
              type="button"
              onClick={() => dispatch({ type: "BACK" })}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> All tools
            </button>
            <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
              <motion.div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
                animate={reduce ? {} : { scale: [1, 1.08, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="font-brand text-xl text-primary">S</span>
              </motion.div>
              <p className="font-brand text-lg text-foreground">Processing</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Your request is queued. Results will appear in your CRM automatically
                once they're ready — no need to wait here.
              </p>
              <Button
                variant="outline"
                className="mt-5 rounded-full"
                onClick={() => dispatch({ type: "OPEN_TOOL", tool: active })}
              >
                Run another
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── RESULTS ── */}
        {stage === "results" && active && records && (
          <motion.div
            key={`results-${active.id}`}
            custom={1}
            variants={reduce ? undefined : slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.32, ease: SPRING }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => dispatch({ type: "OPEN_TOOL", tool: active })}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back to tool
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "BACK" })}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
              >
                All tools
              </button>
            </div>

            <Results records={records} saveAs={active.saveAs} sourceTool={active.title} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── results list ─────────────────────────────────────────────────────────────

function Results({
  records,
  saveAs,
  sourceTool,
}: {
  records: Record<string, unknown>[];
  saveAs: SaveAs;
  sourceTool: string;
}) {
  if (records.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-border bg-card p-10 text-center"
      >
        <p className="font-brand text-lg">No results</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {sourceTool} didn&apos;t return anything for that input. Try a different value.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {records.length} result{records.length === 1 ? "" : "s"} — review and add what
        you want.
      </p>
      {records.map((rec, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: i * 0.06 }}
        >
          <ResultCard rec={rec} saveAs={saveAs} />
        </motion.div>
      ))}
    </div>
  );
}

// ─── match types ──────────────────────────────────────────────────────────────

type CrmContact = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  linkedin?: string | null;
  location?: string | null;
  enrichment?: unknown;
};

type CrmEntity = {
  id: string;
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  enrichment?: unknown;
};

type MatchResult = {
  contact: CrmContact | null;
  entity: CrmEntity | null;
};

type MatchState =
  | { status: "loading" }
  | { status: "ready"; match: MatchResult }
  | { status: "error" };

// ─── result card ──────────────────────────────────────────────────────────────

function ResultCard({
  rec,
  saveAs,
}: {
  rec: Record<string, unknown>;
  saveAs: SaveAs;
}) {
  const x = extract(rec);

  const heading = x.name || x.company || x.domain || x.email || "Untitled result";
  const sub = [x.title, x.company !== heading ? x.company : null, x.location]
    .filter(Boolean)
    .join(" · ");

  const chips = [
    x.email && { label: x.email },
    x.phone && { label: x.phone },
    x.website && { label: x.website },
    x.domain && !x.website && { label: x.domain },
  ].filter(Boolean) as { label: string }[];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-brand truncate text-base">{heading}</p>
          {sub ? (
            <p className="text-muted-foreground mt-0.5 truncate text-sm">{sub}</p>
          ) : null}
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <span
                  key={i}
                  className="text-muted-foreground inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs"
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CRM action — smart add-or-update */}
        <CrmAction rec={rec} extracted={x} saveAs={saveAs} />
      </div>

      <details className="group mt-4">
        <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1 text-xs select-none">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          View raw data
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-border bg-muted/50 p-3 text-xs">
          {JSON.stringify(rec, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ─── CRM action (smart add-or-update) ─────────────────────────────────────────

function CrmAction({
  rec,
  extracted,
  saveAs,
}: {
  rec: Record<string, unknown>;
  extracted: Extracted;
  saveAs: SaveAs;
}) {
  // We use a ref for the match state to avoid re-render loops, plus a
  // simple counter-state to trigger a re-render after async resolution.
  const matchRef = useRef<MatchState>({ status: "loading" });
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const email = extracted.email?.trim().toLowerCase() || "";
    const domain = extracted.domain?.trim().toLowerCase() || "";
    if (!email && !domain) {
      matchRef.current = { status: "ready", match: { contact: null, entity: null } };
      rerender();
      return;
    }
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (domain) params.set("domain", domain);

    fetch(`/api/discover/match?${params.toString()}`)
      .then((r) => r.json())
      .then((data: MatchResult) => {
        matchRef.current = { status: "ready", match: data };
        rerender();
      })
      .catch(() => {
        matchRef.current = { status: "error" };
        rerender();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ms = matchRef.current;

  if (ms.status === "loading") {
    return (
      <div className="flex h-8 w-24 shrink-0 items-center justify-center">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block h-1 w-1 rounded-full bg-muted-foreground"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
      </div>
    );
  }

  if (ms.status === "error") {
    // Fall back to a plain add — don't block the user
    return (
      <AddAction rec={rec} extracted={extracted} saveAs={saveAs} existingId={null} existingRecord={null} />
    );
  }

  const { contact, entity } = ms.match;

  // Determine what already exists based on saveAs
  const existingRecord: CrmContact | CrmEntity | null =
    saveAs === "contact" ? contact : entity;
  const existingId = existingRecord?.id ?? null;

  return (
    <AddAction
      rec={rec}
      extracted={extracted}
      saveAs={saveAs}
      existingId={existingId}
      existingRecord={existingRecord}
    />
  );
}

// ─── add / update action button ───────────────────────────────────────────────

type ActionState =
  | "idle"
  | "saving"
  | "done-added"
  | "done-updated"
  | "error";

function AddAction({
  rec,
  extracted: x,
  saveAs,
  existingId,
  existingRecord,
}: {
  rec: Record<string, unknown>;
  extracted: Extracted;
  saveAs: SaveAs;
  existingId: string | null;
  existingRecord: CrmContact | CrmEntity | null;
}) {
  const [actionState, setActionState] = useReducer(
    (_: ActionState, next: ActionState) => next,
    "idle"
  );
  const [addedFields, setAddedFields] = useReducer(
    (_: string[], next: string[]) => next,
    []
  );
  const [errMsg, setErrMsg] = useReducer((_: string | null, next: string | null) => next, null);

  const isUpdate = existingId !== null;

  async function handleAction() {
    setActionState("saving");
    setErrMsg(null);

    try {
      if (!isUpdate) {
        // ── ADD ──────────────────────────────────────────────────────────────
        const endpoint = saveAs === "entity" ? "/api/entities" : "/api/contacts";
        const payload =
          saveAs === "entity"
            ? stripEmpty({
                name: x.company || x.name || x.domain || "Unknown",
                domain: x.domain,
                website: x.website,
                location: x.location,
                source: "discover",
                enrichment: rec,
              })
            : stripEmpty({
                name: x.name,
                email: x.email,
                phone: x.phone,
                company: x.company,
                title: x.title,
                website: x.website,
                linkedin: x.linkedin,
                location: x.location,
                source: "discover",
                enrichment: rec,
              });

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrMsg(data?.error ?? "Could not save to CRM.");
          setActionState("error");
          return;
        }
        setActionState("done-added");
      } else {
        // ── UPDATE (merge: only fill empty fields) ────────────────────────────
        const endpoint =
          saveAs === "entity"
            ? `/api/entities/${existingId}`
            : `/api/contacts/${existingId}`;

        // Build a patch with only fields that are empty on the existing record
        // and present in the new data.
        const existing = existingRecord as Record<string, unknown>;
        const newFields: Record<string, unknown> = {};
        const fieldLog: string[] = [];

        const candidateFields: (keyof Extracted)[] =
          saveAs === "entity"
            ? ["domain", "website", "location"]
            : ["name", "email", "phone", "title", "company", "website", "linkedin", "location"];

        for (const field of candidateFields) {
          const newVal = x[field];
          const existingVal = existing[field];
          if (newVal && (!existingVal || existingVal === "")) {
            newFields[field] = newVal;
            fieldLog.push(field);
          }
        }

        // Merge enrichment: spread existing, override with new
        const existingEnrichment =
          isObj(existing.enrichment) ? existing.enrichment : {};
        newFields.enrichment = { ...existingEnrichment, ...rec };

        // Always update status to ENRICHED if it was NEW
        if (existing.status === "NEW") {
          newFields.status = "ENRICHED";
        }

        const patch = stripEmpty(newFields);

        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrMsg(data?.error ?? "Could not update CRM record.");
          setActionState("error");
          return;
        }
        setAddedFields(fieldLog);
        setActionState("done-updated");
      }
    } catch {
      setErrMsg("Network error while saving.");
      setActionState("error");
    }
  }

  const isDone = actionState === "done-added" || actionState === "done-updated";
  const isSaving = actionState === "saving";

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <AnimatePresence mode="wait">
        {actionState === "done-added" && (
          <motion.div
            key="done-added"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <Button size="sm" variant="outline" disabled>
              <Check className="mr-1 h-3.5 w-3.5 text-success" />
              Added
            </Button>
          </motion.div>
        )}

        {actionState === "done-updated" && (
          <motion.div
            key="done-updated"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-end gap-1"
          >
            <Button size="sm" variant="outline" disabled>
              <Check className="mr-1 h-3.5 w-3.5 text-success" />
              Updated
            </Button>
            {addedFields.length > 0 && (
              <p className="text-muted-foreground max-w-[140px] text-right text-xs leading-tight">
                added {addedFields.join(", ")}
              </p>
            )}
          </motion.div>
        )}

        {!isDone && (
          <motion.div
            key="action"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-end gap-1.5"
          >
            {isUpdate && actionState === "idle" && (
              <p className="text-muted-foreground max-w-[140px] text-right text-xs leading-tight">
                Already in CRM
              </p>
            )}
            <Button
              size="sm"
              variant={isUpdate ? "outline" : "default"}
              onClick={handleAction}
              disabled={isSaving}
              className={cn(
                isSaving && "opacity-70",
                isUpdate && "border-primary/40 text-primary hover:bg-primary/10"
              )}
            >
              {isSaving ? (
                <>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    className="mr-1 inline-flex"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </motion.span>
                  Saving…
                </>
              ) : isUpdate ? (
                <>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Update
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add to CRM
                </>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {errMsg && actionState === "error" && (
        <p className="max-w-[140px] text-right text-xs text-destructive">{errMsg}</p>
      )}
    </div>
  );
}
