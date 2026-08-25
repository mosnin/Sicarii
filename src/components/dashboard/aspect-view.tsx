// Visual renderers for entity enrichment aspects (firmographics, tech stack,
// funding, website traffic, news). Provider payloads are raw and vary in shape,
// so extraction is DEFENSIVE: we deep-search for the meaningful fields and fall
// back to the generic DataView when a payload doesn't match. Pure render, safe
// in server components. No decorative icons (DESIGN.md rule).

import { DataView, cleanForView, humanizeKey, unwrap } from "@/components/dashboard/data-view";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// First primitive found under a key whose name matches any pattern.
function deepFind(value: unknown, patterns: RegExp[], depth = 0): string | number | undefined {
  if (depth > 6 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = deepFind(v, patterns, depth + 1);
      if (f !== undefined) return f;
    }
    return undefined;
  }
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if ((typeof v === "string" || typeof v === "number") && v !== "" && patterns.some((p) => p.test(k))) {
        return v;
      }
    }
    for (const v of Object.values(value)) {
      const f = deepFind(v, patterns, depth + 1);
      if (f !== undefined) return f;
    }
  }
  return undefined;
}

// First array of items found under a key whose name matches any pattern.
function deepFindArray(value: unknown, patterns: RegExp[], depth = 0): unknown[] | undefined {
  if (depth > 6 || value == null) return undefined;
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (Array.isArray(v) && v.length && patterns.some((p) => p.test(k))) return v;
    }
    for (const v of Object.values(value)) {
      const f = deepFindArray(v, patterns, depth + 1);
      if (f) return f;
    }
  }
  if (Array.isArray(value)) {
    // A top-level array of objects is itself the collection.
    if (value.length && isObj(value[0])) return value;
    for (const v of value) {
      const f = deepFindArray(v, patterns, depth + 1);
      if (f) return f;
    }
  }
  return undefined;
}

// Collect all technology/name-like strings from a technographics payload.
function collectTechNames(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 7 || value == null || out.size > 120) return;
  if (Array.isArray(value)) {
    for (const v of value) collectTechNames(v, out, depth + 1);
    return;
  }
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && v.trim() && /name|technology|tech|tool|product|vendor|category/i.test(k)) {
        out.add(v.trim());
      } else {
        collectTechNames(v, out, depth + 1);
      }
    }
  }
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtMoney(v: string | number | undefined): string | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n === 0) return typeof v === "string" ? v : undefined;
  return `$${fmtNum(n)}`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-brand text-lg tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function StatTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tiles.map((t) => (
        <Tile key={t.label} label={t.label} value={t.value} />
      ))}
    </div>
  );
}

function Firmographics({ value }: { value: unknown }) {
  const employees = deepFind(value, [/employee|headcount|staff|size/i]);
  const revenue = deepFind(value, [/revenue|annual_rev|turnover/i]);
  const founded = deepFind(value, [/found|established|year_started|inception/i]);
  const industry = deepFind(value, [/industry|sector|naics_desc|sic_desc/i]);
  const hq = deepFind(value, [/headquarter|hq|city|location|address|country/i]);
  const type = deepFind(value, [/company_type|ownership|type/i]);

  const tiles: { label: string; value: string }[] = [];
  if (employees != null) tiles.push({ label: "Employees", value: typeof employees === "number" ? fmtNum(employees) : String(employees) });
  const rev = fmtMoney(revenue);
  if (rev) tiles.push({ label: "Revenue", value: rev });
  if (founded != null) tiles.push({ label: "Founded", value: String(founded) });
  if (industry != null) tiles.push({ label: "Industry", value: String(industry) });
  if (hq != null) tiles.push({ label: "HQ", value: String(hq) });
  if (type != null) tiles.push({ label: "Type", value: String(type) });

  if (tiles.length < 2) return <FallbackView value={value} />;
  return <StatTiles tiles={tiles} />;
}

function TechStack({ value }: { value: unknown }) {
  const names = new Set<string>();
  collectTechNames(value, names);
  const list = [...names].filter((n) => n.length <= 40).slice(0, 80);
  if (list.length < 2) return <FallbackView value={value} />;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((t) => (
        <span key={t} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground">
          {t}
        </span>
      ))}
    </div>
  );
}

function Funding({ value }: { value: unknown }) {
  const total = fmtMoney(deepFind(value, [/total_(raised|funding)|amount_raised|funding_total|total/i]));
  const lastRound = deepFind(value, [/last_round|latest_round|round_type|stage|series/i]);
  const rounds = deepFindArray(value, [/round|investment|fundinground/i]);

  const tiles: { label: string; value: string }[] = [];
  if (total) tiles.push({ label: "Total raised", value: total });
  if (lastRound != null) tiles.push({ label: "Latest round", value: String(lastRound) });
  if (rounds?.length) tiles.push({ label: "Rounds", value: String(rounds.length) });

  if (tiles.length === 0 && !rounds) return <FallbackView value={value} />;

  return (
    <div className="space-y-3">
      {tiles.length > 0 && <StatTiles tiles={tiles} />}
      {rounds && rounds.length > 0 && (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rounds.slice(0, 8).map((r, i) => {
            const stage = deepFind(r, [/round_type|stage|series|type|name/i]);
            const amount = fmtMoney(deepFind(r, [/amount|raised|value|money/i]));
            const date = deepFind(r, [/date|announced|closed_on|year/i]);
            return (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{stage != null ? String(stage) : `Round ${i + 1}`}</span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  {amount && <span className="tabular-nums text-foreground">{amount}</span>}
                  {date != null && <span className="text-xs">{String(date)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Traffic({ value }: { value: unknown }) {
  const visits = deepFind(value, [/visits|monthly_visits|traffic|sessions/i]);
  const rank = deepFind(value, [/rank|global_rank|alexa/i]);
  const bounce = deepFind(value, [/bounce/i]);
  const pages = deepFind(value, [/pages_per|page_views|pageviews/i]);
  const duration = deepFind(value, [/duration|time_on_site|visit_duration/i]);

  const tiles: { label: string; value: string }[] = [];
  if (visits != null) tiles.push({ label: "Monthly visits", value: typeof visits === "number" ? fmtNum(visits) : String(visits) });
  if (rank != null) tiles.push({ label: "Global rank", value: typeof rank === "number" ? `#${fmtNum(rank)}` : String(rank) });
  if (pages != null) tiles.push({ label: "Pages / visit", value: String(pages) });
  if (bounce != null) tiles.push({ label: "Bounce rate", value: String(bounce) });
  if (duration != null) tiles.push({ label: "Avg. visit", value: String(duration) });

  if (tiles.length < 2) return <FallbackView value={value} />;
  return <StatTiles tiles={tiles} />;
}

function News({ value }: { value: unknown }) {
  const items = deepFindArray(value, [/news|article|stories|items|records|results/i]) ?? (Array.isArray(unwrap(value)) ? (unwrap(value) as unknown[]) : undefined);
  if (!items || items.length === 0) return <FallbackView value={value} />;
  const articles = items.slice(0, 8).map((it) => ({
    title: deepFind(it, [/title|headline|name/i]),
    url: deepFind(it, [/url|link|permalink/i]),
    source: deepFind(it, [/source|publisher|site|domain/i]),
    date: deepFind(it, [/date|published|time/i]),
    summary: deepFind(it, [/summary|description|snippet|excerpt/i]),
  }));
  if (articles.every((a) => a.title == null)) return <FallbackView value={value} />;

  return (
    <div className="space-y-2">
      {articles.map((a, i) => {
        const title = a.title != null ? String(a.title) : "Untitled";
        const href = a.url != null ? String(a.url) : undefined;
        const inner = (
          <>
            <p className="text-sm font-medium text-foreground line-clamp-2">{title}</p>
            {a.summary != null && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{String(a.summary)}</p>}
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              {a.source != null && <span>{String(a.source)}</span>}
              {a.date != null && <span>· {String(a.date)}</span>}
            </div>
          </>
        );
        return href ? (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            {inner}
          </a>
        ) : (
          <div key={i} className="rounded-xl border border-border bg-card p-3">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function FallbackView({ value }: { value: unknown }) {
  return (
    <div className="max-h-96 overflow-auto rounded-xl border border-border bg-muted/30 p-4">
      <DataView value={cleanForView(value)} />
    </div>
  );
}

// Route an enrichment aspect to its visual renderer by storage key.
export function AspectView({ aspectKey, value }: { aspectKey: string; value: unknown }) {
  const k = aspectKey.toLowerCase();
  if (/firmographic/.test(k)) return <Firmographics value={value} />;
  if (/tech|technograph/.test(k)) return <TechStack value={value} />;
  if (/funding|acquisition/.test(k)) return <Funding value={value} />;
  if (/traffic/.test(k)) return <Traffic value={value} />;
  if (/news/.test(k)) return <News value={value} />;
  return <FallbackView value={value} />;
}

export { humanizeKey };
