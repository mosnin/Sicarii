"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FloatIn } from "@/components/ui/float-in";

const FIELDS = [
  { name: "name", label: "Name", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "company", label: "Company", type: "text" },
  { name: "title", label: "Title", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "website", label: "Website", type: "text" },
  { name: "linkedin", label: "LinkedIn", type: "text" },
  { name: "location", label: "Location", type: "text" },
] as const;

type EntityOption = { id: string; name: string };

export default function NewContactPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [entityId, setEntityId] = useState(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("entityId") ?? ""
      : ""
  );

  useEffect(() => {
    fetch("/api/entities")
      .then((r) => (r.ok ? r.json() : { entities: [] }))
      .then((d) => setEntities(d.entities ?? []))
      .catch(() => setEntities([]));
  }, []);

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

    if (Object.keys(payload).length === 0) {
      setError("Add at least one field.");
      setBusy(false);
      return;
    }
    payload.source = "manual";

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create contact.");
        setBusy(false);
        return;
      }
      const { contact } = await res.json();
      router.push(`/crm/${contact.id}`);
    } catch {
      setError("Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <FloatIn delay={0}>
        <Link
          href="/crm"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CRM
        </Link>
      </FloatIn>

      <FloatIn delay={0.06}>
        <Card>
          <CardHeader>
            <CardTitle className="font-brand text-xl">Add a contact</CardTitle>
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
                    </label>
                    <Input id={f.name} name={f.name} type={f.type} />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="entityId"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Entity (business)
                </label>
                <select
                  id="entityId"
                  name="entityId"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Solo (no entity)</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="notes"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Notes
                </label>
                <Textarea id="notes" name="notes" rows={3} />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="outline" asChild>
                  <Link href="/crm">Cancel</Link>
                </Button>
                <Button type="submit" variant="glow" disabled={busy}>
                  {busy ? "Saving…" : "Save contact"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </FloatIn>
    </div>
  );
}
