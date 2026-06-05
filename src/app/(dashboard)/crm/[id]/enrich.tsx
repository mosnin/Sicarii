"use client";

import { useRouter } from "next/navigation";
import { useReducer } from "react";
import { Link2, Mail, Phone, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

type Field = "linkedin" | "email" | "phone";

const META: Record<Field, { label: string; icon: typeof Mail }> = {
  linkedin: { label: "Find LinkedIn", icon: Link2 },
  email: { label: "Find email", icon: Mail },
  phone: { label: "Find phone", icon: Phone },
};

// Enrichment buttons for a contact — one per *missing* field. Once a field is
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
