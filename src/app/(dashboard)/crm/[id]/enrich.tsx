"use client";

import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";
import { Link2, Mail, Phone, RefreshCw, Sparkles, Check } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

type Field = "linkedin" | "email" | "phone";

const ALL_FIELDS: Field[] = ["linkedin", "email", "phone"];

// The one prominent Enrich action, on the Enrichment card. When fields are
// missing it finds them; when the contact is complete it re-checks for fresh
// data. Always present, so there is never a dead end.
export function ContactEnrichAll({ contactId, missing }: { contactId: string; missing: Field[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const complete = missing.length === 0;
  const targets = complete ? ALL_FIELDS : missing;

  async function enrichAll() {
    setRunning(true);
    setNote(null);
    let found = 0;
    for (const field of targets) {
      try {
        const res = await fetch(`/api/contacts/${contactId}/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field }),
        });
        if (res.ok) {
          found++;
          router.refresh(); // reflect each field as it lands
        }
      } catch {
        /* keep going; report at the end */
      }
    }
    setRunning(false);
    setNote(
      found > 0
        ? `Filled ${found} field${found === 1 ? "" : "s"}.`
        : "Couldn't find anything new for this contact.",
    );
  }

  return (
    <div>
      <Button size="sm" variant="glow" onClick={enrichAll} disabled={running} className="w-full">
        {running ? (
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="mr-1.5 inline-flex">
            <RefreshCw className="h-4 w-4" />
          </motion.span>
        ) : complete ? (
          <Check className="mr-1.5 h-4 w-4" />
        ) : (
          <Sparkles className="mr-1.5 h-4 w-4" />
        )}
        {running ? "Enriching…" : complete ? "Re-enrich" : `Enrich (${missing.length} to find)`}
      </Button>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

const META: Record<Field, { label: string; icon: typeof Mail }> = {
  linkedin: { label: "Find LinkedIn", icon: Link2 },
  email: { label: "Find email", icon: Mail },
  phone: { label: "Find phone", icon: Phone },
};

// Enrichment buttons for a contact - one per *missing* field. Once a field is
// filled (here or upstream) its button disappears on the next render.
export function ContactEnrich({
  contactId,
  missing,
}: {
  contactId: string;
  missing: Field[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useReducer(
    (s: Record<string, boolean>, p: { k: string; v: boolean }) => ({ ...s, [p.k]: p.v }),
    {}
  );
  const [err, setErr] = useReducer((_: string | null, n: string | null) => n, null);

  if (missing.length === 0) return null;

  async function run(field: Field) {
    setBusy({ k: field, v: true });
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) router.refresh();
      else setErr(data.error || `Couldn't find a ${field}.`);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy({ k: field, v: false });
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <p className="text-xs text-muted-foreground mb-2">Enrich</p>
      <div className="flex flex-wrap gap-2">
        {missing.map((f) => {
          const { label, icon: Icon } = META[f];
          const isBusy = busy[f];
          return (
            <Button key={f} variant="outline" size="sm" onClick={() => run(f)} disabled={isBusy}>
              {isBusy ? (
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="mr-1 inline-flex">
                  <RefreshCw className="h-3.5 w-3.5" />
                </motion.span>
              ) : (
                <Icon className="mr-1 h-3.5 w-3.5" />
              )}
              {label}
            </Button>
          );
        })}
      </div>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
