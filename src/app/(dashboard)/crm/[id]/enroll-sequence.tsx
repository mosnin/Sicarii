"use client";

/**
 * EnrollInSequence - start a cadence for this contact from the contact page,
 * where the operator already is. Ties the sequence engine to the record: pick
 * an active sequence, enroll, and the automated touches begin (and stop when
 * they reply). Shows only when the operator has at least one active sequence,
 * so it never clutters an account that is not running cadences.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type SeqOption = { id: string; name: string; active: boolean };

export function EnrollInSequence({ contactId }: { contactId: string }) {
  const [sequences, setSequences] = useState<SeqOption[]>([]);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/sequences");
        const data = await res.json();
        const active = (data.sequences ?? []).filter((s: SeqOption) => s.active);
        setSequences(active);
        if (active[0]) setSelected(active[0].id);
      } catch {
        /* leave empty; the control simply will not render */
      }
    })();
  }, []);

  const enroll = useCallback(async () => {
    if (!selected) return;
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch(`/api/sequences/${selected}/enroll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(typeof data.error === "string" ? data.error : "Could not enroll.");
      } else {
        setState("done");
        setMessage(data.alreadyEnrolled ? "Already in this sequence." : "Enrolled. The cadence starts now.");
      }
    } catch {
      setState("error");
      setMessage("Could not enroll.");
    }
  }, [selected, contactId]);

  if (sequences.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <p className="mb-2 text-sm font-medium">Enroll in a sequence</p>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Sequence"
        >
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button onClick={() => void enroll()} disabled={state === "busy" || state === "done"}>
          {state === "busy" ? "Enrolling" : state === "done" ? "Enrolled" : "Enroll"}
        </Button>
      </div>
      {message && (
        <p className={`mt-2 text-xs ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>
      )}
    </div>
  );
}
