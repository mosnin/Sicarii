// Render arbitrary provider JSON in the app's design (no raw blobs). Pure render,
// safe in server components.

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(/\b(url|id|ceo|cto|cfo|hq|api)\b/gi, (m) => m.toUpperCase());
}

// Peel provider envelopes like {data}/{records}/{result}/{response}.
export function unwrap(value: unknown): unknown {
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

// Drop noisy keys (hashes, opaque ids, envelope markers).
export function cleanForView(value: unknown): unknown {
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

export function DataView({ value, className }: { value: unknown; className?: string }) {
  return <div className={className}>{renderValue(value)}</div>;
}

function renderValue(value: unknown): React.ReactNode {
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
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="inline-flex h-5 items-center rounded-[4px] bg-muted px-1.5 text-xs text-foreground">
              {String(v)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {value.map((v, i) => (
          <div key={i} className="rounded-[8px] border border-border p-2.5">
            {renderValue(v)}
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
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="grid min-h-6 grid-cols-[minmax(0,7rem)_1fr] items-start gap-2 text-sm">
            <span className="truncate text-muted-foreground">{humanizeKey(k)}</span>
            <div className="min-w-0">{renderValue(v)}</div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
