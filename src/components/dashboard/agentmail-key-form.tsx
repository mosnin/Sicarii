"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AgentMailKeyForm({ initialLast4 }: { initialLast4: string | null }) {
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
        body: JSON.stringify({ agentMailApiKey: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setLast4(data.agentMailKeyLast4 ?? null);
      setValue("");
      setEditing(data.agentMailKeyLast4 ? false : true);
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Connected</p>
                <p className="font-mono text-xs text-muted-foreground">
                  agm-••••••••••••{last4}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => save("")}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="editing"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Input
              type="password"
              value={value}
              placeholder="Paste your AgentMail API key"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && value.trim() && save(value.trim())}
              className="font-mono"
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => save(value.trim())} disabled={!value.trim() || status === "saving"}>
                {status === "saving" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
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
            className="flex items-center gap-1 text-xs font-medium text-primary"
          >
            <Check className="h-3.5 w-3.5" /> Saved
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
