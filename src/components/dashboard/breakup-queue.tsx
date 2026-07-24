"use client";

/**
 * BreakupQueue - the review surface for stalled-deal breakup drafts. Scalar
 * notices a cold deal, writes a grounded "breakup" email, and holds it here
 * for one-click human approval; it is never auto-sent (see
 * docs/decisions/0012-breakup-drafts.md). Matches the NeedsYou card styling -
 * same eyebrow/panel pattern, no restyle - but is its own dedicated card since
 * it needs inline actions NeedsYou's plain worklist rows don't.
 *
 * Server component reads the initial queue via the ops layer (see
 * src/app/(dashboard)/dashboard/page.tsx); this client component owns the
 * approve/edit/dismiss interactions and removes a draft from view the moment
 * it's decided (optimistic - the REST call is the source of truth).
 */

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Loader2, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export type PendingDraftItem = {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  contact: { id: string; name: string | null; email: string | null; company: string | null; status: string };
};

const EASE = [0.16, 1, 0.3, 1] as const;

function contactLabel(contact: PendingDraftItem["contact"]): string {
  const who = contact.name || contact.email || "Unnamed contact";
  return contact.company ? `${who} · ${contact.company}` : who;
}

export function BreakupQueue({ initialDrafts }: { initialDrafts: PendingDraftItem[] }) {
  const reduce = useReducedMotion();
  const [drafts, setDrafts] = useState(initialDrafts);

  if (drafts.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.07),0_1px_4px_-1px_rgba(0,0,0,0.05)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 80% at 100% 0%, rgba(90,176,232,0.08) 0%, transparent 65%)" }}
      />
      <div className="relative z-10 p-6 sm:p-8">
        <div className="flex items-baseline justify-between">
          <p className="font-brand text-xs uppercase tracking-[0.3em] text-primary">Ready to close out</p>
          <span className="text-xs text-muted-foreground">
            {drafts.length} stalled {drafts.length === 1 ? "deal" : "deals"}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          These deals have gone cold. Scalar drafted a breakup email grounded in the real history - review, edit if
          you want, then approve or dismiss.
        </p>

        <div className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {drafts.map((draft) => (
              <motion.div
                key={draft.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <DraftCard
                  draft={draft}
                  onDecided={(id) => setDrafts((prev) => prev.filter((d) => d.id !== id))}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  onDecided,
}: {
  draft: PendingDraftItem;
  onDecided: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<"approve" | "dismiss" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      const res = await fetch(`/api/breakup-drafts/${draft.id}/approve`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't approve this draft.");
        return;
      }
      onDecided(draft.id);
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    setError(null);
    try {
      const res = await fetch(`/api/breakup-drafts/${draft.id}/dismiss`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't dismiss this draft.");
        return;
      }
      onDecided(draft.id);
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/breakup-drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't save your edits.");
        return;
      }
      setEditing(false);
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{contactLabel(draft.contact)}</p>
          <p className="text-xs text-muted-foreground">Cold since last touch · status {draft.contact.status}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={disabled}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={dismiss} disabled={disabled}>
            {busy === "dismiss" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1.5 h-3.5 w-3.5" />}
            Dismiss
          </Button>
          <Button size="sm" variant="glow" onClick={approve} disabled={disabled}>
            {busy === "approve" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
            Approve
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={disabled} maxLength={500} />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={disabled} rows={5} maxLength={20000} />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSubject(draft.subject);
                setBody(draft.body);
                setEditing(false);
              }}
              disabled={disabled}
            >
              Cancel
            </Button>
            <Button size="sm" variant="outline" onClick={saveEdit} disabled={disabled}>
              {busy === "save" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">{draft.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{draft.body}</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
