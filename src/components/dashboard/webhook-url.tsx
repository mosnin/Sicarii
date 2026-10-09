"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WebhookUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex h-8 items-center gap-2 rounded-[4px] border border-border bg-muted/40 pl-2.5 pr-0.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{url}</code>
      <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy webhook URL">
        {copied ? <Check className="h-4 w-4 text-success" strokeWidth={1.6} /> : <Copy className="h-4 w-4" strokeWidth={1.6} />}
      </Button>
    </div>
  );
}
