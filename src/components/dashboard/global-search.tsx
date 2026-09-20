"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

type EntityHit = { id: string; name: string; domain: string | null; industry: string | null };
type ContactHit = { id: string; name: string | null; email: string | null; company: string | null };

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState<EntityHit[]>([]);
  const [contacts, setContacts] = useState<ContactHit[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setEntities([]);
      setContacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        setEntities(data.entities ?? []);
        setContacts(data.contacts ?? []);
      } catch {
        /* aborted or failed - ignore */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close on outside click / Escape.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const hasResults = entities.length > 0 || contacts.length > 0;
  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search contacts & companies…"
        className="w-full rounded-full border border-border bg-background/60 px-5 py-3 text-sm text-foreground shadow-sm outline-none ring-2 ring-transparent backdrop-blur-md transition-shadow placeholder:text-muted-foreground focus:ring-primary/25"
      />

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-xl"
          >
            {loading && !hasResults ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
            ) : !hasResults ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                No matches for &ldquo;{q.trim()}&rdquo;
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto py-1">
                {entities.length > 0 && (
                  <div className="px-2 py-1">
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Companies
                    </p>
                    {entities.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => go(`/crm/entity/${e.id}`)}
                        className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
                      >
                        <span className="text-sm font-medium text-foreground">{e.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {[e.industry, e.domain].filter(Boolean).join(" · ") || "Company"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {contacts.length > 0 && (
                  <div className="px-2 py-1">
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Contacts
                    </p>
                    {contacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => go(`/crm/${c.id}`)}
                        className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
                      >
                        <span className="text-sm font-medium text-foreground">
                          {c.name || c.email || "Contact"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[c.company, c.email].filter(Boolean).join(" · ") || "Contact"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
