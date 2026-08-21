"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LeadOrgEditor({
  contactId,
  list,
  tags,
  source,
}: {
  contactId: string;
  list: string | null;
  tags: string[];
  source: string | null;
}) {
  const router = useRouter();
  const [listValue, setListValue] = useState(list ?? "");
  const [tagsValue, setTagsValue] = useState(tags.join(", "));
  const [sourceValue, setSourceValue] = useState(source ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const nextTags = tagsValue
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list: listValue.trim() || null,
          source: sourceValue.trim() || null,
          tags: nextTags,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">Organization</p>
      <div className="space-y-1.5">
        <label htmlFor="lead-list" className="text-xs text-muted-foreground">
          List
        </label>
        <Input
          id="lead-list"
          value={listValue}
          onChange={(e) => setListValue(e.target.value)}
          placeholder="e.g. inbound Q3"
          maxLength={80}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="lead-tags" className="text-xs text-muted-foreground">
          Tags
        </label>
        <Input
          id="lead-tags"
          value={tagsValue}
          onChange={(e) => setTagsValue(e.target.value)}
          placeholder="comma-separated"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="lead-source" className="text-xs text-muted-foreground">
          Source
        </label>
        <Input
          id="lead-source"
          value={sourceValue}
          onChange={(e) => setSourceValue(e.target.value)}
          placeholder="e.g. linkedin, referral"
          maxLength={100}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy ? "Saving…" : "Save organization"}
      </Button>
    </form>
  );
}
