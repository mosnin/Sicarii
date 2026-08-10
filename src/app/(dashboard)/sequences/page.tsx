"use client";

/**
 * Sequences - the cadence surface. A sequence is an ordered set of email steps
 * with a wait between each; enroll a contact and Scalar sends each step on
 * schedule through the same safe path as every other send (suppression, daily
 * cap, unsubscribe link), and stops the instant the contact replies. This is
 * where an operator builds the outreach that runs while they are away.
 *
 * The page is deliberately calm: build a cadence on the left, watch what is
 * running on the right. No dashboards-of-dashboards; the work is the point.
 */

import { useCallback, useEffect, useState } from "react";
import { FloatIn } from "@/components/ui/float-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Step = { delayDays: number; subject: string; body: string };
type Sequence = {
  id: string;
  name: string;
  active: boolean;
  steps: { id: string; order: number; delayDays: number; subject: string }[];
  _count: { enrollments: number };
};

const emptyStep = (): Step => ({ delayDays: 3, subject: "", body: "" });

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([{ delayDays: 0, subject: "", body: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sequences");
      const data = await res.json();
      setSequences(data.sequences ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setError(null);
    if (!name.trim()) return setError("Give the sequence a name.");
    if (steps.some((s) => !s.subject.trim() || !s.body.trim())) return setError("Every step needs a subject and a body.");
    setSaving(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), steps }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(typeof d.error === "string" ? d.error : "Could not save the sequence.");
      } else {
        setName("");
        setSteps([{ delayDays: 0, subject: "", body: "" }]);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }, [name, steps, load]);

  const toggle = useCallback(
    async (seq: Sequence) => {
      // Optimistic; the list reloads to confirm.
      setSequences((prev) => prev.map((s) => (s.id === seq.id ? { ...s, active: !s.active } : s)));
      await fetch(`/api/sequences`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: seq.id, active: !seq.active }),
      }).catch(() => {});
      await load();
    },
    [load],
  );

  return (
    <div className="space-y-8">
      <FloatIn>
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Outreach</p>
          <h1 className="font-brand text-2xl text-foreground">Sequences</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Multi-step cadences that send themselves on schedule and stop the moment someone replies. Every step goes
            through the same safe path as a single send: nobody suppressed is ever contacted, and every message carries
            an unsubscribe link.
          </p>
        </div>
      </FloatIn>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Builder */}
        <FloatIn delay={0.05} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New sequence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Name (e.g. Founder intro, 3 touches)" value={name} onChange={(e) => setName(e.target.value)} />

              <div className="space-y-4">
                {steps.map((step, i) => (
                  <div key={i} className="rounded-xl border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">Step {i + 1}</span>
                      {steps.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}>
                          Remove
                        </Button>
                      )}
                    </div>
                    <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                      Wait
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={step.delayDays}
                        onChange={(e) =>
                          setSteps((s) => s.map((x, j) => (j === i ? { ...x, delayDays: Number(e.target.value) } : x)))
                        }
                        className="h-8 w-20"
                      />
                      days {i === 0 ? "after enrolling" : "after the previous step"}
                    </label>
                    <Input
                      placeholder="Subject"
                      value={step.subject}
                      onChange={(e) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))}
                      className="mb-2"
                    />
                    <textarea
                      placeholder="Body. Ground it in what you actually know about the contact."
                      value={step.body}
                      onChange={(e) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setSteps((s) => [...s, emptyStep()])} disabled={steps.length >= 20}>
                  Add step
                </Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving" : "Create sequence"}
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </FloatIn>

        {/* Running sequences */}
        <FloatIn delay={0.1} className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your sequences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading.</p>
              ) : sequences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sequences yet. Build one on the left, then enroll contacts from the CRM or ask your agent to.
                </p>
              ) : (
                sequences.map((seq) => (
                  <div key={seq.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{seq.name}</span>
                        <Badge variant={seq.active ? "success" : "secondary"}>{seq.active ? "Active" : "Paused"}</Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => void toggle(seq)}>
                        {seq.active ? "Pause" : "Resume"}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {seq.steps.length} step{seq.steps.length === 1 ? "" : "s"} · {seq._count.enrollments} enrolled
                    </p>
                    <ol className="mt-2 space-y-1">
                      {seq.steps
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((st) => (
                          <li key={st.id} className="text-xs text-muted-foreground">
                            <span className="text-foreground">Day {cumulativeDay(seq.steps, st.order)}</span> · {st.subject || "(no subject)"}
                          </li>
                        ))}
                    </ol>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </FloatIn>
      </div>
    </div>
  );
}

/** The day a step lands, counting from enrollment: the running sum of delays. */
function cumulativeDay(steps: { order: number; delayDays: number }[], order: number): number {
  return steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.order <= order)
    .reduce((sum, s) => sum + s.delayDays, 0);
}
