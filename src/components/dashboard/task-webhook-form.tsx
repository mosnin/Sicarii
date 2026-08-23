"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Where Scalar POSTs results when a scheduled task (intent monitor / research)
// completes, so an external agent (e.g. openclaw, Hermes) can be woken up.
export function TaskWebhookForm({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function save(next: string) {
    setStatus("saving");
    setErr(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskWebhookUrl: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? "Couldn't save.");
        setStatus("error");
        return;
      }
      setUrl(data.taskWebhookUrl ?? "");
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setErr("Network error.");
      setStatus("error");
    }
  }

  const valid = url.trim() === "" || /^https?:\/\/.+/i.test(url.trim());

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          value={url}
          placeholder="https://your-agent.example.com/webhook"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valid && save(url.trim())}
          className="font-mono"
        />
        <div className="flex items-center gap-2">
          <Button onClick={() => save(url.trim())} disabled={!valid || status === "saving"}>
            {status === "saving" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          {url.trim() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => save("")}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Clear webhook"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {!valid && <p className="text-xs text-destructive">Enter a valid https URL.</p>}

      <AnimatePresence>
        {status === "done" && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-xs font-medium text-primary">
            <Check className="h-3.5 w-3.5" /> Saved
          </motion.p>
        )}
        {status === "error" && err && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs font-medium text-destructive">
            {err}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
