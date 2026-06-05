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
  Search,
  BarChart2,
  Zap,
  Network,
  Mail,
  Phone,
  Cpu,
  TrendingUp,
  Radar,
  BookOpen,
  ScanSearch,
  CalendarClock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { DiscoverWorking } from "@/components/dashboard/discover-working";
import { cn } from "@/lib/utils";

// ─── types ──────────────────────────────────────────────────────────────────

type SaveAs = "entity" | "contact" | "link" | "raw";
type Field = {
  key: string;
  label: string;
  placeholder: string;
  optional?: boolean;
  type?: "text" | "select";
  options?: { value: string; label: string }[];
};

type Tool = {
  id: string;
  icon: typeof Building2;
  title: string;
  body: string;
  saveAs: SaveAs;
  fields: Field[];
  badge?: string; // "Default" | "Deep" etc
};

type Category = {
  id: string;
  label: string;
  tools: Tool[];
};

type Stage = "grid" | "input" | "working" | "results" | "queued";

type State = {
  stage: Stage;
  active: Tool | null;
  values: Record<string, string>;
  records: Record<string, unknown>[] | null;
  rawText: string | null; // for "raw" saveAs (scraped markdown etc)
  error: string | null;
};

type Action =
  | { type: "OPEN_TOOL"; tool: Tool }
  | { type: "BACK" }
  | { type: "SET_VALUE"; key: string; value: string }
  | { type: "RUN" }
  | { type: "SUCCESS"; records: Record<string, unknown>[]; rawText?: string }
  | { type: "QUEUED" }
  | { type: "FAIL"; error: string };

// ─── constants ───────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: "web",
    label: "Web intelligence",
    tools: [
      {
        id: "web-search",
        icon: Search,
        title: "Web search",
        body: "Search the web with Tavily - fast, clean results with source links.",
        saveAs: "link",
        badge: "Default",
        fields: [
          { key: "query", label: "Query", placeholder: "nail salons in Miami" },
        ],
      },
      {
        id: "google-serp",
        icon: Globe,
        title: "Google SERP",
        body: "Pull structured Google search results via Bright Data.",
        saveAs: "link",
        fields: [
          { key: "query", label: "Query", placeholder: "CRM software alternatives" },
          { key: "country", label: "Country code", placeholder: "us", optional: true },
        ],
      },
      {
        id: "scrape-url",
        icon: BookOpen,
        title: "Scrape URL",
        body: "Extract clean markdown from any URL, bypassing anti-bot protection.",
        saveAs: "raw",
        fields: [
          { key: "url", label: "URL", placeholder: "https://acme.com/about" },
        ],
      },
      {
        id: "crawl-site",
        icon: Network,
        title: "Crawl site",
        body: "Crawl an entire site and extract content from every page.",
        saveAs: "raw",
        fields: [
          { key: "url", label: "Site URL", placeholder: "https://acme.com" },
        ],
      },
      {
        id: "analyze-site",
        icon: ScanSearch,
        title: "Analyze website",
        body: "Firecrawl deep-reads a company site and pulls the people on it as contacts.",
        saveAs: "contact",
        badge: "Firecrawl",
        fields: [
          { key: "url", label: "Company website", placeholder: "https://acme.com" },
        ],
      },
    ],
  },
  {
    id: "company",
    label: "Company intelligence",
    tools: [
      {
        id: "search-companies",
        icon: Building2,
        title: "Search companies",
        body: "Filter Explorium's database by country, industry, and size.",
        saveAs: "entity",
        fields: [
          { key: "country", label: "Country code", placeholder: "us", optional: true },
          { key: "industry", label: "Industry", placeholder: "SaaS", optional: true },
          { key: "size", label: "Company size", placeholder: "1-50", optional: true },
        ],
      },
      {
        id: "enrich-domain",
        icon: BarChart2,
        title: "Enrich by domain",
        body: "Give a company domain, get a full firmographic profile from Explorium.",
        saveAs: "entity",
        fields: [
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
        ],
      },
      {
        id: "company-funding",
        icon: TrendingUp,
        title: "Funding & acquisition",
        body: "Funding rounds, investors, and acquisition history for any company.",
        saveAs: "entity",
        fields: [
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
        ],
      },
      {
        id: "tech-stack",
        icon: Cpu,
        title: "Tech stack",
        body: "Discover the technologies a company runs, sourced by Explorium.",
        saveAs: "entity",
        fields: [
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
        ],
      },
      {
        id: "company-news",
        icon: Zap,
        title: "Company news",
        body: "Recent news and signals for a company via Pipe0.",
        saveAs: "link",
        fields: [
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
          { key: "companyName", label: "Company name", placeholder: "Acme Inc.", optional: true },
        ],
      },
      {
        id: "company-lookalikes",
        icon: ScanSearch,
        title: "Similar companies",
        body: "Find companies that look like your best customers, via Explorium.",
        saveAs: "entity",
        fields: [
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
        ],
      },
    ],
  },
  {
    id: "people",
    label: "People & contacts",
    tools: [
      {
        id: "find-people",
        icon: UserSearch,
        title: "Find people at company",
        body: "Explorium prospect search - filter by title, department, or seniority.",
        saveAs: "contact",
        fields: [
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
          { key: "jobTitle", label: "Job title", placeholder: "VP of Sales", optional: true },
          { key: "department", label: "Department", placeholder: "Sales", optional: true },
          { key: "level", label: "Level", placeholder: "vp", optional: true },
        ],
      },
      {
        id: "find-email",
        icon: Mail,
        title: "Find work email",
        body: "Pipe0's 50-provider waterfall - give a name and domain, get a verified email.",
        saveAs: "contact",
        fields: [
          { key: "firstName", label: "First name", placeholder: "Jane" },
          { key: "lastName", label: "Last name", placeholder: "Doe" },
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
          { key: "companyName", label: "Company name", placeholder: "Acme Inc.", optional: true },
        ],
      },
      {
        id: "find-mobile",
        icon: Phone,
        title: "Find mobile number",
        body: "Look up a direct mobile number for any professional via Pipe0.",
        saveAs: "contact",
        fields: [
          { key: "firstName", label: "First name", placeholder: "Jane" },
          { key: "lastName", label: "Last name", placeholder: "Doe" },
          { key: "domain", label: "Company domain", placeholder: "acme.com" },
          { key: "companyName", label: "Company name", placeholder: "Acme Inc.", optional: true },
        ],
      },
    ],
  },
  {
    id: "prospecting",
    label: "Prospecting",
    tools: [
      {
        id: "find-entities",
        icon: Radar,
        title: "Find companies",
        body: "Describe your ideal customer; Exa deep-researches a list of matching companies with full details. Add them one-by-one or all at once.",
        saveAs: "entity",
        badge: "Exa",
        fields: [
          { key: "query", label: "Describe the companies you want", placeholder: "Series A fintech startups in NYC using Stripe" },
          {
            key: "numResults",
            label: "How many to find",
            placeholder: "10",
            type: "select",
            options: [
              { value: "10", label: "10" },
              { value: "20", label: "20" },
              { value: "30", label: "30" },
              { value: "50", label: "50" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "intent",
    label: "Intent intelligence",
    tools: [
      {
        id: "intent-scan",
        icon: Radar,
        title: "Intent scanner",
        body: "Exa neural search - find companies and people actively looking for a product like yours.",
        saveAs: "entity",
        badge: "Exa",
        fields: [
          { key: "query", label: "What are you selling?", placeholder: "CRM software for sales teams" },
          {
            key: "category",
            label: "Result type",
            placeholder: "company",
            optional: true,
            type: "select",
            options: [
              { value: "", label: "Any" },
              { value: "company", label: "Companies" },
              { value: "news", label: "News" },
              { value: "personal site", label: "Personal sites" },
              { value: "linkedin profile", label: "LinkedIn" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "research",
    label: "Deep research",
    tools: [
      {
        id: "deep-research",
        icon: BookOpen,
        title: "Deep research",
        body: "Linkup exhaustive research - get a sourced answer on any topic, person, or company.",
        saveAs: "link",
        badge: "Linkup",
        fields: [
          { key: "query", label: "Research query", placeholder: "Who are the key decision makers at Stripe?" },
        ],
      },
      {
        id: "quick-research",
        icon: Search,
        title: "Quick research",
        body: "Fast Linkup search - standard depth, good for recent news or overview.",
        saveAs: "link",
        fields: [
          { key: "query", label: "Search query", placeholder: "Latest funding news at OpenAI" },
        ],
      },
    ],
  },
];

const SPRING = [0.16, 1, 0.3, 1] as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Safely derive a hostname from a possibly-invalid URL string. Never throws. */
function hostOf(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function normalizeRecords(result: unknown): { records: Record<string, unknown>[]; rawText?: string } {
  if (result == null) return { records: [] };

  // Enrichment envelope: { __subject, __data } - keep intact for EnrichmentResult.
  if (isObj(result) && "__subject" in result) {
    return { records: [result] };
  }

  // Company list: { companies: [...] } - addable prospect grid.
  if (isObj(result) && Array.isArray(result.companies)) {
    return { records: (result.companies as unknown[]).filter(isObj) };
  }

  // Scrape result: { markdown: string }
  if (isObj(result) && typeof result.markdown === "string") {
    return { records: [], rawText: result.markdown };
  }

  // Crawl result: { baseUrl, results: [...] }
  if (isObj(result) && Array.isArray(result.results)) {
    const recs = (result.results as unknown[]).filter(isObj);
    if (recs.length) return { records: recs };
  }

  // Linkup result: { answer?, sources: [...] }
  if (isObj(result) && Array.isArray(result.sources)) {
    const records = (result.sources as unknown[]).filter(isObj);
    const rawText = typeof result.answer === "string" ? result.answer : undefined;
    return { records, rawText };
  }

  // Tavily extract: [{ url, rawContent }]
  if (Array.isArray(result) && result.every((r) => isObj(r) && "rawContent" in r)) {
    const texts = (result as { rawContent?: string }[]).map((r) => r.rawContent).filter(Boolean).join("\n\n---\n\n");
    return { records: [], rawText: texts };
  }

  if (Array.isArray(result)) return { records: result.filter(isObj) };
  if (isObj(result)) {
    for (const v of Object.values(result)) {
      if (Array.isArray(v) && v.some(isObj)) return { records: v.filter(isObj) };
    }
    return { records: [result] };
  }
  return { records: [] };
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
  snippet?: string;
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
    snippet: deepFind(rec, ["content", "snippet", "description", "summary"]),
  };
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null && v !== "")
  ) as Partial<T>;
}

// Turn snake/camel keys into human labels: full_tech_stack → "Full tech stack".
function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(/\b(url|id|ceo|cto|cfo|hq|api)\b/gi, (m) => m.toUpperCase());
}

// Providers wrap payloads in {data}/{records}/{result}/{response}. Peel those
// to surface the meaningful object.
function unwrap(value: unknown): unknown {
  let v = value;
  for (let i = 0; i < 4; i++) {
    if (isObj(v)) {
      const keys = Object.keys(v);
      if (keys.length === 1 && ["data", "records", "result", "response"].includes(keys[0])) {
        v = v[keys[0]];
        continue;
      }
    }
    break;
  }
  return v;
}

// Drop noisy keys (hashes, opaque ids, internal envelope markers) for display.
function cleanForView(value: unknown): unknown {
  const v = unwrap(value);
  if (Array.isArray(v)) return v.map(cleanForView);
  if (isObj(v)) {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !/_hashed$|_id$|^id$|^__|correlation|request_status/i.test(k))
        .map(([k, val]) => [k, cleanForView(val)])
    );
  }
  return v;
}

// ─── reducer ─────────────────────────────────────────────────────────────────

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "OPEN_TOOL":
      return { ...state, stage: "input", active: action.tool, values: {}, records: null, rawText: null, error: null };
    case "BACK":
      return { ...state, stage: "grid", active: null, records: null, rawText: null, error: null };
    case "SET_VALUE":
      return { ...state, values: { ...state.values, [action.key]: action.value } };
    case "RUN":
      return { ...state, stage: "working", error: null, records: null, rawText: null };
    case "SUCCESS":
      return { ...state, stage: "results", records: action.records, rawText: action.rawText ?? null };
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
  rawText: null,
  error: null,
};

// ─── motion ───────────────────────────────────────────────────────────────────

const slideVariants = {
  initial: (dir: number) => ({ opacity: 0, y: dir * 14 }),
  animate: { opacity: 1, y: 0 },
  exit: (dir: number) => ({ opacity: 0, y: dir * -10 }),
};

// ─── recent results ───────────────────────────────────────────────────────────

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

function RecentResults() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discover/recent")
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.results) setItems(data.results); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3"
    >
      <h2 className="font-brand text-base text-foreground">Recently added</h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
        {items.map((item) => {
          const label = item.name ?? item.company ?? item.domain ?? item.email ?? "Unnamed";
          const sub = item.kind === "contact"
            ? [item.title, item.company].filter(Boolean).join(" · ")
            : item.domain ?? item.location ?? "";
          const href = item.kind === "contact" ? `/crm/${item.id}` : `/crm/entity/${item.id}`;
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
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{item.kind}</span>
                  {(item.source === "intent-monitor" || item.source === "exa-webhook") && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">intent</span>
                  )}
                  {item.source === "research-schedule" && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">research</span>
                  )}
                </div>
                <p className="font-brand truncate text-sm text-foreground">{label}</p>
                {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
              </div>
              <Link href={href} className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── schedule panel (intent monitor + research) ───────────────────────────────

function ScheduleMonitorPanel({ query, toolId, onClose }: { query: string; toolId: string; onClose: () => void }) {
  const isIntent = toolId === "intent-scan";
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const endpoint = isIntent ? "/api/intent-monitors" : "/api/research-schedules";
      const body = isIntent
        ? { name: name || query.slice(0, 60), query, frequency }
        : { name: name || query.slice(0, 60), query, provider: "linkup", depth: "deep", frequency };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data?.error ?? "Failed to schedule."); return; }
      setDone(true);
    } catch { setErr("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: SPRING }}
      className="rounded-2xl border border-primary/20 bg-primary/5 p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-brand text-sm text-foreground flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4 text-primary" />
            {isIntent ? "Schedule intent monitor" : "Schedule research"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isIntent
              ? "Exa will run this search on a schedule and add new results to your CRM automatically."
              : "Linkup will run deep research on a schedule and update your CRM."}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {done ? (
        <p className="text-sm text-primary flex items-center gap-1.5">
          <Check className="h-4 w-4" /> Scheduled - results will appear in your CRM automatically.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Monitor name (optional)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={query.slice(0, 50)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ─── CRM picker (select an existing entity/contact to enrich) ────────────────

type PickEntity = { id: string; name?: string | null; domain?: string | null; website?: string | null };
type PickContact = { id: string; name?: string | null; email?: string | null; company?: string | null; website?: string | null };

function CrmPicker({
  type,
  onPick,
}: {
  type: "entity" | "contact";
  onPick: (rec: PickEntity | PickContact) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<(PickEntity | PickContact)[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(type === "entity" ? "/api/entities" : "/api/contacts");
      const d = await res.json().catch(() => ({}));
      setItems(type === "entity" ? d.entities ?? [] : d.contacts ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [type]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  };

  const label = (it: PickEntity | PickContact) =>
    type === "entity"
      ? (it as PickEntity).name || (it as PickEntity).domain || "Untitled"
      : (it as PickContact).name || (it as PickContact).email || "Unnamed";
  const sub = (it: PickEntity | PickContact) =>
    type === "entity"
      ? (it as PickEntity).domain ?? ""
      : [(it as PickContact).company, (it as PickContact).email].filter(Boolean).join(" · ");

  const filtered = items
    .filter((it) => `${label(it)} ${sub(it)}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
      >
        <Building2 className="h-3.5 w-3.5" />
        {type === "entity" ? "Select a company from your CRM" : "Select a contact from your CRM"}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-border bg-card p-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${type === "entity" ? "companies" : "contacts"}…`}
                className="mb-2"
              />
              <div className="max-h-56 overflow-y-auto">
                {loading ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
                ) : filtered.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    {items.length === 0 ? `No ${type === "entity" ? "companies" : "contacts"} yet.` : "No matches."}
                  </p>
                ) : (
                  filtered.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => { onPick(it); setOpen(false); }}
                      className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <span className="text-sm text-foreground">{label(it)}</span>
                      {sub(it) && <span className="text-xs text-muted-foreground">{sub(it)}</span>}
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or enter manually
              <span className="h-px flex-1 bg-border" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const reduce = useReducedMotion();
  const { stage, active, values, records, rawText, error } = state;
  const [showSchedule, setShowSchedule] = useState(false);

  const run = useCallback(async () => {
    if (!active) return;
    setShowSchedule(false);
    dispatch({ type: "RUN" });
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: active.id, ...values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dispatch({ type: "FAIL", error: data?.error ?? "Discovery failed. Please try again." });
        return;
      }
      if (data?.queued) { dispatch({ type: "QUEUED" }); return; }
      const { records: recs, rawText: rt } = normalizeRecords(data.result);
      dispatch({ type: "SUCCESS", records: recs, rawText: rt });
    } catch {
      dispatch({ type: "FAIL", error: "Network error - please try again." });
    }
  }, [active, values]);

  useEffect(() => {
    if (stage !== "input") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) run();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stage, run]);

  const stageOrder: Stage[] = ["grid", "input", "working", "results"];
  const stageDir = (from: Stage, to: Stage) =>
    stageOrder.indexOf(to) >= stageOrder.indexOf(from) ? 1 : -1;

  const canSchedule = active && (active.id === "intent-scan" || active.id === "deep-research" || active.id === "quick-research");

  // Which CRM record (if any) this tool can be pre-filled from. Any tool scoped
  // to a company (domain or url field) can attach an entity; people tools attach
  // a contact.
  const hasField = (k: string) => active?.fields.some((f) => f.key === k) ?? false;
  const pickType: "entity" | "contact" | null = !active
    ? null
    : hasField("firstName")
      ? "contact"
      : hasField("domain") || hasField("url")
        ? "entity"
        : null;

  const set = (key: string, value?: string) => {
    if (value) dispatch({ type: "SET_VALUE", key, value });
  };
  const fillFromEntity = (e: PickEntity) => {
    const domain = e.domain ?? hostOf(e.website);
    const website = e.website ?? (domain ? `https://${domain}` : undefined);
    set("domain", domain);
    set("companyName", e.name ?? undefined);
    set("url", website); // for scrape/crawl/extract tools
  };
  const fillFromContact = (c: PickContact) => {
    const parts = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts[0]) set("firstName", parts[0]);
    if (parts.length > 1) set("lastName", parts[parts.length - 1]);
    const emailDomain = c.email?.includes("@") ? c.email.split("@")[1] : undefined;
    set("domain", hostOf(c.website) ?? emailDomain ?? hostOf(c.company));
    set("companyName", c.company ?? undefined);
  };

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
            className="space-y-10"
          >
            {CATEGORIES.map((cat, ci) => (
              <FloatIn key={cat.id} delay={ci * 0.04}>
                <div className="space-y-4">
                  <h2 className="font-brand text-base text-muted-foreground uppercase tracking-wide text-xs">
                    {cat.label}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.tools.map((t, i) => (
                      <FloatIn key={t.id} delay={ci * 0.04 + i * 0.05}>
                        <button
                          type="button"
                          onClick={() => dispatch({ type: "OPEN_TOOL", tool: t })}
                          className="block w-full text-left"
                        >
                          <SpotlightCard className="h-full p-5">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <t.icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              {t.badge && (
                                <span className="text-[10px] font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5 shrink-0">
                                  {t.badge}
                                </span>
                              )}
                            </div>
                            <h3 className="font-brand text-sm">{t.title}</h3>
                            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{t.body}</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                              Run tool
                            </span>
                          </SpotlightCard>
                        </button>
                      </FloatIn>
                    ))}
                  </div>
                </div>
              </FloatIn>
            ))}

            <RecentResults />
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
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <active.icon className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-brand text-lg">{active.title}</h2>
                    {active.badge && (
                      <span className="text-[10px] font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5">
                        {active.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">{active.body}</p>
                </div>
              </div>

              {pickType && (
                <CrmPicker
                  type={pickType}
                  onPick={(rec) =>
                    pickType === "entity"
                      ? fillFromEntity(rec as PickEntity)
                      : fillFromContact(rec as PickContact)
                  }
                />
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {active.fields.map((f) => (
                  <div
                    key={f.key}
                    className={cn(active.fields.length === 1 && "sm:col-span-2")}
                  >
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      {f.label}
                      {f.optional && <span className="ml-1 opacity-50">optional</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        value={values[f.key] || f.options?.[0]?.value || ""}
                        onChange={(e) => dispatch({ type: "SET_VALUE", key: f.key, value: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={values[f.key] ?? ""}
                        placeholder={f.placeholder}
                        onChange={(e) => dispatch({ type: "SET_VALUE", key: f.key, value: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Button onClick={run}>Run tool</Button>
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
                <Clock className="h-5 w-5 text-primary" />
              </motion.div>
              <p className="font-brand text-lg text-foreground">Processing</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Your request is queued. Results will appear in your CRM automatically once ready.
              </p>
              <Button variant="outline" className="mt-5 rounded-full" onClick={() => dispatch({ type: "OPEN_TOOL", tool: active })}>
                Run another
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── RESULTS ── */}
        {stage === "results" && active && (
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
              <div className="flex items-center gap-3">
                {canSchedule && !showSchedule && (
                  <button
                    type="button"
                    onClick={() => setShowSchedule(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Schedule recurring
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dispatch({ type: "BACK" })}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
                >
                  All tools
                </button>
              </div>
            </div>

            {/* Schedule panel */}
            <AnimatePresence>
              {showSchedule && canSchedule && (
                <ScheduleMonitorPanel
                  query={values.query ?? ""}
                  toolId={active.id}
                  onClose={() => setShowSchedule(false)}
                />
              )}
            </AnimatePresence>

            {/* Raw text (scraped content) */}
            {rawText && (
              <div className="space-y-2">
                {records && records.length > 0 && (
                  <p className="text-muted-foreground text-sm font-medium">Research answer</p>
                )}
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{rawText}</p>
                </div>
              </div>
            )}

            {records && records[0]?.__subject ? (
              <EnrichmentResult env={records[0]} />
            ) : records && records[0]?.__kind === "company" ? (
              <EntityFinderResults companies={records} />
            ) : records ? (
              <Results records={records} saveAs={active.saveAs} sourceTool={active.title} />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── designed JSON renderer ─────────────────────────────────────────────────
// Renders arbitrary provider data in the app's design instead of raw JSON.

function DataView({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="text-muted-foreground">-</span>;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const s = String(value);
    if (/^https?:\/\//i.test(s)) {
      return (
        <a href={s} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
          {s}
        </a>
      );
    }
    return <span className="break-words">{s}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">-</span>;
    const allScalar = value.every((v) => v === null || typeof v !== "object");
    if (allScalar) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v, i) => (
            <span key={i} className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
              {String(v)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {value.map((v, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <DataView value={v} />
          </div>
        ))}
      </div>
    );
  }

  if (isObj(value)) {
    const entries = Object.entries(value).filter(
      ([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
    );
    if (entries.length === 0) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 text-sm">
            <span className="text-xs text-muted-foreground pt-0.5">{humanize(k)}</span>
            <div className="min-w-0">
              <DataView value={v} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ─── enrichment result (match-or-create entity by domain) ───────────────────

function EnrichmentResult({ env }: { env: Record<string, unknown> }) {
  const subject = (env.__subject ?? {}) as { domain?: string | null; label?: string };
  const data = env.__data;
  const domain = subject.domain ?? undefined;
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function attach() {
    if (!domain) return;
    setState("saving");
    setMsg(null);
    try {
      const res = await fetch("/api/entities/upsert-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, key: subject.label ?? "enrichment", data }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d?.error ?? "Failed to attach."); setState("error"); return; }
      setMsg(d.created ? "Created entity & enriched" : "Enriched existing entity");
      setState("done");
    } catch {
      setMsg("Network error.");
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{subject.label}</p>
          <p className="font-brand truncate text-base">{domain ?? "Result"}</p>
        </div>
        {domain && (
          state === "done" ? (
            <Button size="sm" variant="outline" disabled>
              <Check className="mr-1 h-3.5 w-3.5 text-green-500" />
              {msg}
            </Button>
          ) : (
            <Button size="sm" onClick={attach} disabled={state === "saving"}>
              {state === "saving" ? (
                <>
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="mr-1 inline-flex">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </motion.span>
                  Saving…
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add &amp; enrich entity
                </>
              )}
            </Button>
          )
        )}
      </div>

      <div className="mt-4 max-h-[28rem] overflow-auto rounded-xl border border-border bg-muted/30 p-4">
        <DataView value={cleanForView(data)} />
      </div>

      {msg && state === "error" && <p className="mt-2 text-xs text-destructive">{msg}</p>}
    </div>
  );
}

// ─── entity finder (find-entities / refined web search) ─────────────────────

type FinderCompany = {
  companyName: string;
  domain?: string;
  website?: string;
  phone?: string;
  industry?: string;
  address?: string;
  description?: string;
  keyDecisionMakers?: { name: string; title?: string }[];
  sourceUrl?: string;
  inCrm?: boolean;
  existingId?: string | null;
};

function companyToEntityPayload(c: FinderCompany) {
  const dm = c.keyDecisionMakers?.length
    ? "Key decision makers: " +
      c.keyDecisionMakers.map((d) => (d.title ? `${d.name} (${d.title})` : d.name)).join(", ")
    : "";
  return stripEmpty({
    name: c.companyName,
    domain: c.domain,
    website: c.website,
    phone: c.phone,
    industry: c.industry,
    location: c.address,
    description: [c.description, dm].filter(Boolean).join("\n\n"),
    source: "discover",
    tags: ["discovered"],
    enrichment: c as unknown as Record<string, unknown>,
  });
}

function EntityFinderResults({ companies }: { companies: Record<string, unknown>[] }) {
  const list = companies as unknown as FinderCompany[];
  const [added, setAdded] = useState<Record<number, "added" | "saving">>({});
  const [bulk, setBulk] = useState<"idle" | "saving" | "done">("idle");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const addableIdx = list.map((c, i) => ({ c, i })).filter(({ c, i }) => !c.inCrm && added[i] !== "added");
  const newCount = list.filter((c) => !c.inCrm).length;

  async function addOne(i: number) {
    setAdded((s) => ({ ...s, [i]: "saving" }));
    try {
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyToEntityPayload(list[i])),
      });
      if (res.ok) setAdded((s) => ({ ...s, [i]: "added" }));
      else setAdded((s) => { const n = { ...s }; delete n[i]; return n; });
    } catch {
      setAdded((s) => { const n = { ...s }; delete n[i]; return n; });
    }
  }

  async function addAll() {
    setBulk("saving");
    setBulkMsg(null);
    try {
      const payload = addableIdx.map(({ c }) => companyToEntityPayload(c));
      if (payload.length === 0) { setBulk("done"); return; }
      const res = await fetch("/api/entities/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setAdded((s) => {
          const n = { ...s };
          addableIdx.forEach(({ i }) => (n[i] = "added"));
          return n;
        });
        setBulkMsg(`Added ${d.created}${d.skipped ? ` · skipped ${d.skipped} duplicate${d.skipped === 1 ? "" : "s"}` : ""}`);
        setBulk("done");
      } else {
        setBulkMsg(d?.error ?? "Bulk add failed.");
        setBulk("idle");
      }
    } catch {
      setBulkMsg("Network error.");
      setBulk("idle");
    }
  }

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <p className="font-brand text-lg">No companies found</p>
        <p className="text-muted-foreground mt-1 text-sm">Try a more specific description.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          {list.length} found · {newCount} new
        </p>
        <div className="flex items-center gap-3">
          {bulkMsg && <span className="text-xs text-muted-foreground">{bulkMsg}</span>}
          <Button size="sm" onClick={addAll} disabled={bulk === "saving" || addableIdx.length === 0}>
            {bulk === "saving" ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="mr-1 inline-flex">
                  <RefreshCw className="h-3.5 w-3.5" />
                </motion.span>
                Adding…
              </>
            ) : bulk === "done" && addableIdx.length === 0 ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5 text-green-500" />
                All added
              </>
            ) : (
              <>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add all ({addableIdx.length})
              </>
            )}
          </Button>
        </div>
      </div>

      {list.map((c, i) => {
        const state = c.inCrm ? "incrm" : added[i] ?? "idle";
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: SPRING, delay: Math.min(i * 0.04, 0.4) }}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noopener noreferrer" className="font-brand truncate text-base hover:text-primary">
                      {c.companyName}
                    </a>
                  ) : (
                    <p className="font-brand truncate text-base">{c.companyName}</p>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 truncate text-sm">
                  {[c.industry, c.address].filter(Boolean).join(" · ") || c.domain}
                </p>
                {c.description && (
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed line-clamp-3">{c.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.domain && <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{c.domain}</span>}
                  {c.phone && <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{c.phone}</span>}
                  {c.keyDecisionMakers?.slice(0, 3).map((d, j) => (
                    <span key={j} className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">
                      {d.name}{d.title ? ` · ${d.title}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="shrink-0">
                {state === "incrm" ? (
                  <Button size="sm" variant="outline" disabled>In CRM</Button>
                ) : state === "added" ? (
                  <Button size="sm" variant="outline" disabled>
                    <Check className="mr-1 h-3.5 w-3.5 text-green-500" />Added
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => addOne(i)} disabled={state === "saving"}>
                    {state === "saving" ? (
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="inline-flex">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </motion.span>
                    ) : (
                      <><Plus className="mr-1 h-3.5 w-3.5" />Add</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
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
          {sourceTool} didn&apos;t return anything for that input.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {records.length} result{records.length === 1 ? "" : "s"}
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

// ─── result card ──────────────────────────────────────────────────────────────

function ResultCard({ rec, saveAs }: { rec: Record<string, unknown>; saveAs: SaveAs }) {
  const x = extract(rec);

  const heading = x.name || x.company || x.domain || x.email || hostOf(x.website) || "Untitled";
  const sub = [x.title, x.company !== heading ? x.company : null, x.location]
    .filter(Boolean).join(" · ");

  const chips = [
    x.email && { label: x.email },
    x.phone && { label: x.phone },
    x.website && { label: hostOf(x.website) ?? x.website },
    x.domain && !x.website && { label: x.domain },
  ].filter(Boolean) as { label: string }[];

  const isLink = saveAs === "link" || saveAs === "raw";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {x.website && (
              <a
                href={x.website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-brand truncate text-base hover:text-primary transition-colors"
              >
                {heading}
              </a>
            )}
            {!x.website && (
              <p className="font-brand truncate text-base">{heading}</p>
            )}
            {x.website && (
              <a href={x.website} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {sub && <p className="text-muted-foreground mt-0.5 truncate text-sm">{sub}</p>}
          {x.snippet && (
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed line-clamp-3">{x.snippet}</p>
          )}
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <span key={i} className="text-muted-foreground inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {!isLink && <CrmAction rec={rec} extracted={x} saveAs={saveAs} />}
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

// ─── CRM action ───────────────────────────────────────────────────────────────

type CrmContact = { id: string; name?: string | null; email?: string | null; phone?: string | null; company?: string | null; title?: string | null; website?: string | null; linkedin?: string | null; location?: string | null; enrichment?: unknown; status?: string };
type CrmEntity = { id: string; name?: string | null; domain?: string | null; website?: string | null; industry?: string | null; location?: string | null; enrichment?: unknown; status?: string };
type MatchResult = { contact: CrmContact | null; entity: CrmEntity | null };
type MatchState = { status: "loading" } | { status: "ready"; match: MatchResult } | { status: "error" };

function CrmAction({ rec, extracted, saveAs }: { rec: Record<string, unknown>; extracted: Extracted; saveAs: SaveAs }) {
  const matchRef = useRef<MatchState>({ status: "loading" });
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const email = extracted.email?.trim().toLowerCase() || "";
    const domain = (extracted.domain?.trim().toLowerCase() || hostOf(extracted.website) || "").replace(/^www\./, "");
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
      .then((data: MatchResult) => { matchRef.current = { status: "ready", match: data }; rerender(); })
      .catch(() => { matchRef.current = { status: "error" }; rerender(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ms = matchRef.current;
  if (ms.status === "loading") {
    return (
      <div className="flex h-8 w-24 shrink-0 items-center justify-center">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="block h-1 w-1 rounded-full bg-muted-foreground"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
      </div>
    );
  }

  const existingRecord: CrmContact | CrmEntity | null =
    ms.status === "ready" ? (saveAs === "contact" ? ms.match.contact : ms.match.entity) : null;

  return (
    <AddAction rec={rec} extracted={extracted} saveAs={saveAs} existingId={existingRecord?.id ?? null} existingRecord={existingRecord} />
  );
}

// ─── add / update action ──────────────────────────────────────────────────────

type ActionState = "idle" | "saving" | "done-added" | "done-updated" | "error";

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
  const [actionState, setActionState] = useReducer((_: ActionState, next: ActionState) => next, "idle");
  const [addedFields, setAddedFields] = useReducer((_: string[], next: string[]) => next, []);
  const [errMsg, setErrMsg] = useReducer((_: string | null, next: string | null) => next, null);

  const isUpdate = existingId !== null;

  async function handleAction() {
    setActionState("saving");
    setErrMsg(null);
    try {
      if (!isUpdate) {
        const endpoint = saveAs === "entity" ? "/api/entities" : "/api/contacts";
        const payload = saveAs === "entity"
          ? stripEmpty({ name: x.company || x.name || x.domain || "Unknown", domain: x.domain, website: x.website, location: x.location, source: "discover", enrichment: rec })
          : stripEmpty({ name: x.name, email: x.email, phone: x.phone, company: x.company, title: x.title, website: x.website, linkedin: x.linkedin, location: x.location, source: "discover", enrichment: rec });
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setErrMsg(data?.error ?? "Could not save."); setActionState("error"); return; }
        setActionState("done-added");
      } else {
        const endpoint = saveAs === "entity" ? `/api/entities/${existingId}` : `/api/contacts/${existingId}`;
        const existing = existingRecord as Record<string, unknown>;
        const newFields: Record<string, unknown> = {};
        const fieldLog: string[] = [];
        const candidateFields: (keyof Extracted)[] = saveAs === "entity"
          ? ["domain", "website", "location"]
          : ["name", "email", "phone", "title", "company", "website", "linkedin", "location"];
        for (const field of candidateFields) {
          const newVal = x[field];
          const existingVal = existing[field];
          if (newVal && (!existingVal || existingVal === "")) { newFields[field] = newVal; fieldLog.push(field); }
        }
        newFields.enrichment = { ...(isObj(existing.enrichment) ? existing.enrichment : {}), ...rec };
        if (existing.status === "NEW") newFields.status = "ENRICHED";
        const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stripEmpty(newFields)) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setErrMsg(data?.error ?? "Could not update."); setActionState("error"); return; }
        setAddedFields(fieldLog);
        setActionState("done-updated");
      }
    } catch { setErrMsg("Network error."); setActionState("error"); }
  }

  const isDone = actionState === "done-added" || actionState === "done-updated";
  const isSaving = actionState === "saving";

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <AnimatePresence mode="wait">
        {actionState === "done-added" && (
          <motion.div key="done-added" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: SPRING }}>
            <Button size="sm" variant="outline" disabled><Check className="mr-1 h-3.5 w-3.5 text-green-500" />Added</Button>
          </motion.div>
        )}
        {actionState === "done-updated" && (
          <motion.div key="done-updated" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: SPRING }} className="flex flex-col items-end gap-1">
            <Button size="sm" variant="outline" disabled><Check className="mr-1 h-3.5 w-3.5 text-green-500" />Updated</Button>
            {addedFields.length > 0 && <p className="text-muted-foreground max-w-[140px] text-right text-xs leading-tight">added {addedFields.join(", ")}</p>}
          </motion.div>
        )}
        {!isDone && (
          <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col items-end gap-1.5">
            {isUpdate && actionState === "idle" && <p className="text-muted-foreground max-w-[140px] text-right text-xs leading-tight">Already in CRM</p>}
            <Button size="sm" variant={isUpdate ? "outline" : "default"} onClick={handleAction} disabled={isSaving}
              className={cn(isSaving && "opacity-70", isUpdate && "border-primary/40 text-primary hover:bg-primary/10")}
            >
              {isSaving ? (
                <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="mr-1 inline-flex"><RefreshCw className="h-3.5 w-3.5" /></motion.span>Saving…</>
              ) : isUpdate ? (
                <><RefreshCw className="mr-1 h-3.5 w-3.5" />Update</>
              ) : (
                <><Plus className="mr-1 h-3.5 w-3.5" />Add to CRM</>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      {errMsg && actionState === "error" && <p className="max-w-[140px] text-right text-xs text-destructive">{errMsg}</p>}
    </div>
  );
}
