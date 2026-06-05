"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Radar,
  Globe,
  Mails,
  Building2,
  UserSearch,
  Plus,
  ArrowLeft,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";

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

// ── helpers for the unknown Synthoz response shape ──────────────────────────
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
      if (typeof v === "string" && v.trim() && keys.some((key) => k.toLowerCase().includes(key))) {
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

export default function DiscoverPage() {
  const [active, setActive] = useState<Tool | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[] | null>(null);
  const reduce = useReducedMotion();

  function openTool(tool: Tool) {
    setActive(tool);
    setValues({});
    setError(null);
    setRecords(null);
  }

  function back() {
    setActive(null);
    setError(null);
    setRecords(null);
  }

  async function run() {
    if (!active) return;
    setLoading(true);
    setError(null);
    setRecords(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: active.id, ...values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Discovery failed. Please try again.");
        return;
      }
      setRecords(normalizeRecords(data.result));
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

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

      <AnimatePresence mode="wait">
        {!active ? (
          // ── Tool grid ──
          <motion.div
            key="grid"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="grid gap-4 sm:grid-cols-2"
          >
            {TOOLS.map((t, i) => (
              <FloatIn key={t.id} delay={i * 0.06}>
                <button type="button" onClick={() => openTool(t)} className="block w-full text-left">
                  <SpotlightCard className="h-full p-6 transition-transform hover:-translate-y-0.5">
                    <h3 className="font-brand text-lg">{t.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{t.body}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-orange">
                      Run tool
                    </span>
                  </SpotlightCard>
                </button>
              </FloatIn>
            ))}
          </motion.div>
        ) : (
          // ── Tool detail / runner ──
          <motion.div
            key={active.id}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            <button
              type="button"
              onClick={back}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> All tools
            </button>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4">
                <h2 className="font-brand text-lg">{active.title}</h2>
                <p className="text-muted-foreground text-sm">{active.body}</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {active.fields.map((f) => (
                  <div key={f.key} className={cn(active.fields.length === 1 && "sm:col-span-2")}>
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">{f.label}</label>
                    <Input
                      value={values[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && run()}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Button onClick={run} disabled={loading}>
                  {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Radar className="mr-1 h-4 w-4" />}
                  {loading ? "Running…" : "Run tool"}
                </Button>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-foreground">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results */}
            {records && <Results records={records} saveAs={active.saveAs} sourceTool={active.title} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── results list ────────────────────────────────────────────────────────────
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
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-brand text-lg">No results</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {sourceTool} didn&apos;t return anything for that input. Try a different value.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {records.length} result{records.length === 1 ? "" : "s"} — review and add what you want.
      </p>
      {records.map((rec, i) => (
        <FloatIn key={i} delay={i * 0.05}>
          <ResultCard rec={rec} saveAs={saveAs} />
        </FloatIn>
      ))}
    </div>
  );
}

function ResultCard({ rec, saveAs }: { rec: Record<string, unknown>; saveAs: SaveAs }) {
  const x = extract(rec);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const heading = x.name || x.company || x.domain || x.email || "Untitled result";
  const sub = [x.title, x.company !== heading ? x.company : null, x.location].filter(Boolean).join(" · ");

  async function addToCrm() {
    setSaving(true);
    setErr(null);
    try {
      const endpoint = saveAs === "entity" ? "/api/entities" : "/api/contacts";
      const payload =
        saveAs === "entity"
          ? {
              name: x.company || x.name || x.domain || heading,
              domain: x.domain,
              website: x.website,
              location: x.location,
              source: "discover",
              enrichment: rec,
            }
          : {
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
            };
      const clean = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v != null && v !== "")
      );
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? "Could not save to CRM.");
        return;
      }
      setSaved(true);
    } catch {
      setErr("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

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
          {sub && <p className="text-muted-foreground mt-0.5 truncate text-sm">{sub}</p>}
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
        <Button
          size="sm"
          onClick={addToCrm}
          disabled={saving || saved}
          variant={saved ? "outline" : "default"}
        >
          {saved ? (
            <>
              <Check className="mr-1 h-4 w-4" /> Added
            </>
          ) : saving ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving
            </>
          ) : (
            <>
              <Plus className="mr-1 h-4 w-4" /> Add to CRM
            </>
          )}
        </Button>
      </div>

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      <details className="group mt-3">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs">
          View raw data
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-xs">
          {JSON.stringify(rec, null, 2)}
        </pre>
      </details>
    </div>
  );
}
