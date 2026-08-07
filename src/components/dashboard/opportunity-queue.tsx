"use client";

/**
 * OpportunityQueue - the review surface for social opportunities.
 *
 * A saved watch finds posts; the posts land here; a human decides. That order
 * is the product, not a workflow preference: the provider behind social
 * discovery has no identity resolution at all (no confidence, no match score,
 * no candidates, no verification flag), so "the person who wrote this" is a
 * display name and nothing more. Nothing in this queue is a contact, and
 * converting one attaches it to a record the operator ALREADY has rather than
 * creating anything.
 *
 * Modelled on BreakupQueue: same eyebrow/panel/card shape, same optimistic
 * removal on decision, with the REST call as the source of truth.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type OpportunityItem = {
  id: string;
  platform: string;
  postUrl: string;
  text: string | null;
  authorRaw: unknown;
  publishedAt: string | null;
  intentScore: number | null;
  intentReason: string | null;
  monitor: { id: string; name: string } | null;
};

type ContactOption = { id: string; name: string | null; email: string | null; company: string | null };

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Read a display name out of the raw author blob without trusting its shape.
 * The provider declares author as additionalProperties with zero named
 * sub-fields and rotates its upstream scrapers, so every key here is a guess
 * and "Unknown author" is a perfectly good answer.
 */
function authorLabel(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Unknown author";
  const bag = raw as Record<string, unknown>;
  for (const key of ["name", "full_name", "display_name", "username", "handle", "screen_name", "nickname"]) {
    const value = bag[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Unknown author";
}

function platformLabel(platform: string): string {
  return platform.charAt(0) + platform.slice(1).toLowerCase();
}

function scoreTone(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-primary";
  return "text-muted-foreground";
}

export function OpportunityQueue({ initialOpportunities }: { initialOpportunities: OpportunityItem[] }) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState(initialOpportunities);

  if (items.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.07),0_1px_4px_-1px_rgba(0,0,0,0.05)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 80% at 100% 0%, rgba(90,176,232,0.08) 0%, transparent 65%)" }}
      />
      <div className="relative z-10 p-6 sm:p-8">
        <div className="flex items-baseline justify-between">
          <p className="font-brand text-xs uppercase tracking-[0.3em] text-primary">Worth a look</p>
          <span className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "post" : "posts"}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your social watches found these. They are posts, not people: we have no verified identity for whoever wrote
          them, so nothing is added to your CRM until you attach it to a record you already have.
        </p>

        <div className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <OpportunityCard
                  item={item}
                  onDecided={(id) => setItems((prev) => prev.filter((o) => o.id !== id))}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({
  item,
  onDecided,
}: {
  item: OpportunityItem;
  onDecided: (id: string) => void;
}) {
  const [attaching, setAttaching] = useState(false);
  const [busy, setBusy] = useState<"convert" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setBusy("dismiss");
    setError(null);
    try {
      const res = await fetch(`/api/social/opportunities/${item.id}/dismiss`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't dismiss this post.");
        return;
      }
      onDecided(item.id);
    } finally {
      setBusy(null);
    }
  }

  async function convert(contactId: string) {
    setBusy("convert");
    setError(null);
    try {
      const res = await fetch(`/api/social/opportunities/${item.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't attach this post.");
        return;
      }
      onDecided(item.id);
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;
  const published = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{authorLabel(item.authorRaw)}</p>
          <p className="text-xs text-muted-foreground">
            {platformLabel(item.platform)}
            {published ? ` · ${published}` : ""}
            {item.monitor ? ` · from "${item.monitor.name}"` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-medium ${scoreTone(item.intentScore)}`}>
            {item.intentScore == null ? "Unscored" : `Intent ${item.intentScore}`}
          </span>
          <Button size="sm" variant="outline" onClick={dismiss} disabled={disabled}>
            {busy === "dismiss" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Not a signal
          </Button>
          <Button size="sm" variant="glow" onClick={() => setAttaching((v) => !v)} disabled={disabled}>
            {busy === "convert" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Attach to a contact
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-muted/40 p-3">
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {item.text?.trim() || "The provider returned no text for this post."}
        </p>
        <a
          href={item.postUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 inline-block text-xs text-primary underline underline-offset-2"
        >
          Open the post
        </a>
      </div>

      {item.intentReason && (
        <p className="mt-2 text-xs text-muted-foreground">
          Why it surfaced: {item.intentReason}
        </p>
      )}

      {attaching && <ContactPicker disabled={disabled} onPick={convert} />}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Pick an EXISTING contact. There is deliberately no "create a contact from
 * this author" affordance: we cannot verify who the author is, and a CRM full
 * of same-name strangers is worse than a CRM with a gap.
 */
function ContactPicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (contactId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = query.trim();
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(term)}`);
        const d = await res.json().catch(() => ({}));
        setOptions(Array.isArray(d.contacts) ? d.contacts.slice(0, 6) : []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="mt-3 rounded-xl border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">
        Search a contact you already have. We never create one from a post author: nothing about them has been
        verified.
      </p>
      <Input
        className="mt-2"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, email or company"
        disabled={disabled}
        maxLength={200}
      />
      {loading && <p className="mt-2 text-xs text-muted-foreground">Searching...</p>}
      {!loading && query.trim().length >= 2 && options.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No match. Create and verify the contact first, then come back and attach this post.
        </p>
      )}
      <div className="mt-2 space-y-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.id)}
            className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/60 disabled:opacity-50"
          >
            {option.name || option.email || "Unnamed contact"}
            {option.company ? <span className="text-muted-foreground"> · {option.company}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
