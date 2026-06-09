"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const UPGRADES = [
  { plan: "starter", label: "Starter", price: "$39/mo" },
  { plan: "pro", label: "Pro", price: "$129/mo" },
  { plan: "business", label: "Business", price: "$99/seat/mo" },
] as const;

export function BillingUpgrade() {
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function upgrade(plan: string) {
    setPending(plan);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 501) {
        setMessage("Billing launches soon");
        return;
      }
      if (!res.ok || !data.url) {
        setMessage(data.error ?? "Couldn't start checkout - try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setMessage("Couldn't start checkout - try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        {UPGRADES.map(({ plan, label, price }) => (
          <Button
            key={plan}
            variant="outline"
            className="flex-1"
            disabled={pending !== null}
            onClick={() => upgrade(plan)}
          >
            {pending === plan ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {label} <span className="text-muted-foreground">{price}</span>
          </Button>
        ))}
      </div>
      <AnimatePresence>
        {message && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs font-medium text-muted-foreground"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
