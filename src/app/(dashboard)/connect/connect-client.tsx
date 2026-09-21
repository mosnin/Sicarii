"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";

type Status = {
  connected: boolean;
  firstWriteAt: string | null;
  via: string | null;
};

export function ConnectClient() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const res = await fetch("/api/connect/status").then((r) => r.json()).catch(() => null);
      if (!cancelled && res) setStatus(res);
    }
    void tick();
    const id = setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const connected = Boolean(status?.connected);

  return (
    <div className="space-y-8">
      <FloatIn>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="relative z-10 px-6 py-9 sm:px-10 sm:py-12">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">Scalar // Handshake</p>
            <h1 className="font-brand mt-2 text-3xl text-foreground sm:text-4xl">Connect your agent</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Create an API key in Settings, point your agent at the MCP URL, and
              make one write. This page listens and turns green when the first
              call lands. It does not invent a handshake.
            </p>
          </div>
        </div>
      </FloatIn>

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">First write</p>
        <p className="font-brand mt-2 text-2xl">
          {status == null ? "Listening..." : connected ? "Connected" : "Waiting for the first write"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {connected
            ? `A live agent call arrived${status?.via ? ` via ${status.via.replace("_", " ")}` : ""}. Your CRM is now being operated.`
            : "No agent write yet. Create a key, run any MCP tool, and stay on this page."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link href="/settings">Open Settings</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard">Back to the CRM</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
