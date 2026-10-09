"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PLACEHOLDER = `What you sell, who it's for, and why it wins. The more Scalar knows, the sharper its outreach.

Example:
• Product: <what it is, in a sentence>
• Who it's for (ICP): <industries, company size, roles>
• The problem you solve: <pain you remove>
• Why you win: <differentiators vs. alternatives>
• Proof: <results, customers, metrics>
• Tone: <how outreach should sound>`;

export function ProductContextEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const dirty = value !== saved;

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productContext: value }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setSaved(value);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[8px] border border-border bg-card"
    >
      <header className="flex h-10 items-center border-b border-border px-3">
        <h2 className="text-sm font-medium text-foreground">Your product context</h2>
      </header>
      <div className="p-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={14}
          className="w-full resize-y rounded-[4px] border border-input bg-background px-2.5 py-2 text-sm leading-relaxed text-foreground transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Scalar reads this before every action - saved to your workspace.
          </p>
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              {status === "done" && (
                <motion.span
                  key="done"
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1 text-xs font-medium text-success"
                >
                  <Check className="h-4 w-4" strokeWidth={1.6} /> Saved
                </motion.span>
              )}
              {status === "error" && (
                <motion.span
                  key="err"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs font-medium text-destructive"
                >
                  Couldn&apos;t save
                </motion.span>
              )}
            </AnimatePresence>
            <Button onClick={save} disabled={!dirty || status === "saving"} size="sm">
              {status === "saving" && (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} />
              )}
              {status === "saving" ? "Saving…" : "Save context"}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
