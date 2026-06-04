"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  { name: "name", label: "Business name", type: "text", required: true },
  { name: "domain", label: "Domain", type: "text" },
  { name: "website", label: "Website", type: "text" },
  { name: "industry", label: "Industry", type: "text" },
  { name: "location", label: "Location", type: "text" },
  { name: "size", label: "Size", type: "text" },
] as const;

export default function NewEntityPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) {
      const val = String(v).trim();
      if (val) payload[k] = val;
    }
    if (!payload.name) {
      setError("A business name is required.");
      setBusy(false);
      return;
    }
    payload.source = "manual";

    try {
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create entity.");
        setBusy(false);
        return;
      }
      const { entity } = await res.json();
      router.push(`/crm/entity/${entity.id}`);
    } catch {
      setError("Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/crm?tab=entities"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to entities
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Add an entity</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <label
                    htmlFor={f.name}
                    className="text-sm font-medium text-muted-foreground"
                  >
                    {f.label}
                    {"required" in f && f.required && (
                      <span className="text-destructive"> *</span>
                    )}
                  </label>
                  <Input id={f.name} name={f.name} type={f.type} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="description"
                className="text-sm font-medium text-muted-foreground"
              >
                Description
              </label>
              <Textarea id="description" name="description" rows={3} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" asChild>
                <Link href="/crm?tab=entities">Cancel</Link>
              </Button>
              <Button type="submit" variant="glow" disabled={busy}>
                {busy ? "Saving…" : "Save entity"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
