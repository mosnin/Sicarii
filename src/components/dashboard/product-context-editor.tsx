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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl bg-card p-5 shadow-sm sm:p-6"
    >
      {/* subtle animated accent sweep */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-24 h-40 bg-[radial-gradient(ellipse_at_center,rgba(90,176,232,0.18),transparent_70%)]"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative">
        <div className="mb-3">
          <p className="text-sm font-semibold text-foreground">Your product context</p>
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={14}
          className="w-full resize-y rounded-xl bg-muted/40 p-4 text-sm leading-relaxed text-foreground shadow-inner outline-none ring-2 ring-transparent transition-shadow placeholder:text-muted-foreground/70 focus:ring-primary/25"
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Scalar reads this before every action — saved to your workspace.
          </p>
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              {status === "done" && (
                <motion.span
                  key="done"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-xs font-medium text-primary"
                >
                  <Check className="h-3.5 w-3.5" /> Saved
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
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {status === "saving" ? "Saving…" : "Save context"}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
