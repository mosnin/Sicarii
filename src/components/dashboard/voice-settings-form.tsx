"use client";

/**
 * VoiceSettingsForm - the Settings control for voice-native CRM. Turning it
 * on requires a connected AgentPhone key (mirrors the webhook route's own
 * gate) and mints a per-user secret; the resulting URL is what the operator
 * pastes into AgentPhone's inbound-webhook config. That secret is the whole
 * authentication boundary for /api/webhooks/agentphone, so "New link" (a
 * rotate) is a real security control, not a cosmetic reset.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function VoiceSettingsForm({
  initialEnabled,
  connected,
  initialSecret,
  webhookBase,
}: {
  initialEnabled: boolean;
  connected: boolean;
  initialSecret: string | null;
  /** e.g. "https://www.tryscalar.xyz/api/webhooks/agentphone" - secret is
   *  appended client side as ?key=. */
  webhookBase: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [secret, setSecret] = useState(initialSecret);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = secret ? `${webhookBase}?key=${secret}` : null;

  async function patch(body: { enabled?: boolean; rotate?: boolean }) {
    const res = await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Couldn't save.");
    return data as { enabled: boolean; connected: boolean; secret: string | null };
  }

  async function toggle() {
    if (saving || !connected) return;
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      const data = await patch({ enabled: next });
      setEnabled(data.enabled);
      setSecret(data.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    if (rotating) return;
    setRotating(true);
    setError(null);
    try {
      const data = await patch({ rotate: true });
      setSecret(data.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rotate the link.");
    } finally {
      setRotating(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Voice-native CRM</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Call your AgentPhone number and ask Scalar out loud who to follow
            up with, what&apos;s hot in your pipeline, or what your agent did
            while you were away.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle voice-native CRM"
          onClick={toggle}
          disabled={saving || !connected}
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20",
            enabled ? "bg-primary" : "bg-muted",
            (saving || !connected) && "opacity-50",
          )}
        >
          <motion.span
            layout
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "inline-block h-3 w-3 rounded-full bg-white",
              enabled ? "ml-[14px]" : "ml-0.5",
            )}
          />
        </button>
      </div>

      {!connected && (
        <p className="text-xs text-muted-foreground">
          Connect your AgentPhone account above to enable voice.
        </p>
      )}

      <AnimatePresence>
        {enabled && url && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            <p className="text-xs text-muted-foreground">
              Paste this as the inbound-call webhook in your AgentPhone
              number&apos;s config. It is unique to your account - anyone with
              this link can hear your CRM read back over the phone, so treat
              it like a password and rotate it if it ever leaks.
            </p>
            <div className="flex h-8 items-center gap-1 rounded-[4px] border border-border bg-muted/40 pl-2.5 pr-0.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{url}</code>
              <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy voice webhook URL">
                {copied ? <Check className="h-4 w-4 text-success" strokeWidth={1.6} /> : <Copy className="h-4 w-4" strokeWidth={1.6} />}
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={rotate} disabled={rotating} aria-label="Generate a new link">
                {rotating ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} /> : <RefreshCw className="h-4 w-4" strokeWidth={1.6} />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
