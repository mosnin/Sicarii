"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVertical, Map } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Three-dots menu on the CRM entities tab. Hosts the optional Map view.
export function CrmHeaderMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl"
            >
              <Link
                href="/crm/map"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Map className="h-4 w-4 text-muted-foreground" />
                Map view
              </Link>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
