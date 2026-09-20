"use client";

/**
 * SocialsEditor - manual add/edit for a contact's social profiles plus the
 * "Find socials" discovery action. Verified matches (name AND company) save
 * automatically; unverified candidates are listed for the human to confirm,
 * one click each - the accuracy rule stays in the human's hands.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SocialField = "linkedin" | "twitter" | "instagram" | "facebook";

const FIELDS: { name: SocialField; label: string; placeholder: string }[] = [
  { name: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/..." },
  { name: "twitter", label: "X", placeholder: "x.com/..." },
  { name: "instagram", label: "Instagram", placeholder: "instagram.com/..." },
  { name: "facebook", label: "Facebook", placeholder: "facebook.com/..." },
];

type Candidate = {
  field: SocialField;
  url: string;
  title: string;
  snippet: string;
  verified: boolean;
};

type FindResult = {
  saved: Partial<Record<SocialField, string>>;
  candidates: Candidate[];
  message: string;
  error?: string;
};

export function SocialsEditor({
  contactId,
  current,
}: {
  contactId: string;
  current: Partial<Record<SocialField, string | null>>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [find, setFind] = useState<FindResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, string | null> = {};
    for (const f of FIELDS) {
      const v = String(form.get(f.name) ?? "").trim();
      payload[f.name] = v || null;
    }
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function findSocials() {
    setFinding(true);
    setError(null);
    setFind(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/find-socials`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as FindResult;
      if (!res.ok) {
        setError(data.error || "Search failed.");
        return;
      }
      setFind(data);
      if (Object.keys(data.saved ?? {}).length > 0) router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setFinding(false);
    }
  }

  async function saveCandidate(c: Candidate) {
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [c.field]: c.url }),
      });
      if (res.ok) {
        setFind((prev) =>
          prev
            ? { ...prev, candidates: prev.candidates.filter((x) => x.url !== c.url) }
            : prev,
        );
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const candidates = (find?.candidates ?? []).filter((c) => !c.verified);

  return (
    <div className="space-y-3 pt-1">
      {editing ? (
        <form onSubmit={save} className="space-y-2">
          {FIELDS.map((f) => (
            <div key={f.name} className="space-y-1">
              <label htmlFor={`social-${f.name}`} className="text-xs text-muted-foreground">
                {f.label}
              </label>
              <Input
                id={`social-${f.name}`}
                name={f.name}
                defaultValue={current[f.name] ?? ""}
                placeholder={f.placeholder}
                className="h-8 text-sm"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving..." : "Save socials"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit socials
          </Button>
          <Button size="sm" variant="outline" onClick={findSocials} disabled={finding}>
            {finding ? "Searching..." : "Find socials"}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {find && !editing && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{find.message}</p>
          {candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.map((c) => (
                <div key={c.url} className="rounded-lg border border-border bg-card/50 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {FIELDS.find((f) => f.name === c.field)?.label ?? c.field}
                      </p>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {c.title || c.url}
                      </a>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => saveCandidate(c)}>
                      Save
                    </Button>
                  </div>
                  {c.snippet && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.snippet}</p>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Unverified: confirm it is this exact person before saving.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
