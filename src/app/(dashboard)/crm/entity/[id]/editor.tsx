"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Fields = {
  name: string;
  website: string;
  domain: string;
  phone: string;
  industry: string;
  location: string;
  size: string;
  description: string;
};

// Inline editor so users (and, via the same PATCH endpoint, agents) can edit
// entity information. Delete lives in the header actions.
export function EntityEditor({ entityId, initial }: { entityId: string; initial: Fields }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<Fields>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof Fields, val: string) => setV((s) => ({ ...s, [k]: val }));

  async function save() {
    if (!v.name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name: v.name.trim(),
        website: v.website.trim() || null,
        domain: v.domain.trim() || null,
        phone: v.phone.trim() || null,
        industry: v.industry.trim() || null,
        location: v.location.trim() || null,
        size: v.size.trim() || null,
        description: v.description.trim() || null,
      };
      const res = await fetch(`/api/entities/${entityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setEditing(false); router.refresh(); }
      else setErr(data.error || "Couldn't save.");
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="border-t border-border pt-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setV(initial); setEditing(true); }}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit details
        </Button>
      </div>
    );
  }

  const FIELDS: { label: string; k: keyof Fields; ph?: string }[] = [
    { label: "Name", k: "name" },
    { label: "Website", k: "website", ph: "https://acme.com" },
    { label: "Domain", k: "domain", ph: "acme.com" },
    { label: "Phone", k: "phone" },
    { label: "Industry", k: "industry" },
    { label: "Location", k: "location" },
    { label: "Size", k: "size", ph: "11-50" },
  ];

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map(({ label, k, ph }) => (
          <div key={k}>
            <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
            <Input value={v[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Description</label>
        <textarea
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          rows={4}
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
