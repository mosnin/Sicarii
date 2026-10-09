"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AgentPhoneKeyForm({ initialLast4 }: { initialLast4: string | null }) {
  const [last4, setLast4] = useState<string | null>(initialLast4);
  const [editing, setEditing] = useState(initialLast4 === null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function save(next: string) {
    setStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPhoneApiKey: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setLast4(data.agentPhoneKeyLast4 ?? null);
      setValue("");
      setEditing(data.agentPhoneKeyLast4 ? false : true);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait" initial={false}>
        {!editing && last4 ? (
          <motion.div
            key="connected"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex items-center justify-between gap-3 rounded-[4px] border border-border bg-muted/40 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-medium text-success">Connected</p>
                <p className="font-mono text-xs text-muted-foreground">
                  sk_live_••••••••••••{last4}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" strokeWidth={1.6} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => save("")}
                className="hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="editing"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Input
              type="password"
              value={value}
              placeholder="Paste your AgentPhone API key"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && value.trim() && save(value.trim())}
              className="font-mono"
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => save(value.trim())} disabled={!value.trim() || status === "saving"}>
                {status === "saving" ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} /> : null}
                Save key
              </Button>
              {last4 && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status === "done" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 text-xs font-medium text-success"
          >
            <Check className="h-4 w-4" strokeWidth={1.6} /> Saved
          </motion.p>
        )}
        {status === "error" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs font-medium text-destructive"
          >
            Couldn&apos;t save the key - try again.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
