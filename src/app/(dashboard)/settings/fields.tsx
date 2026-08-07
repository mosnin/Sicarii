"use client";

/**
 * CustomFieldsManager - where an operator declares the columns their business
 * actually runs on ("Compliance framework", "Renewal date", "Seats") and, in
 * the agent brief, writes down in plain prose what each one means and where to
 * look for it. That brief is the product: the agent reads it over MCP and
 * fills the field itself, with no code change from us.
 *
 * Not wired into any page here on purpose. Export only; the settings page owns
 * where it sits.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const ENTITIES = [
  { value: "CONTACT", label: "People", noun: "person" },
  { value: "ENTITY", label: "Companies", noun: "company" },
  { value: "PIPELINE_ENTRY", label: "Deals", noun: "deal" },
] as const;

const TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "CHECKBOX", label: "Yes / no" },
  { value: "SELECT", label: "Choice list" },
  { value: "URL", label: "Link" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
] as const;

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type EntityValue = (typeof ENTITIES)[number]["value"];
type TypeValue = (typeof TYPES)[number]["value"];

interface FieldOption {
  id: string;
  value: string;
  label: string;
}

interface FieldDefinition {
  id: string;
  entity: EntityValue;
  key: string;
  label: string;
  type: TypeValue;
  agentFilled: boolean;
  agentBrief: string | null;
  required: boolean;
  showOnSheet: boolean;
  showOnTable: boolean;
  position: number;
  archivedAt: string | null;
  options: FieldOption[];
}

interface Draft {
  label: string;
  type: TypeValue;
  agentBrief: string;
  agentFilled: boolean;
  required: boolean;
  showOnSheet: boolean;
  showOnTable: boolean;
  optionsText: string;
}

const emptyDraft: Draft = {
  label: "",
  type: "TEXT",
  agentBrief: "",
  agentFilled: true,
  required: false,
  showOnSheet: true,
  showOnTable: false,
  optionsText: "",
};

// Mirrors normalizeFieldKey in src/lib/fields.ts so the operator sees the key
// they are about to get while typing. The server is still the authority: it
// re-normalises and rejects reserved names.
function previewKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function draftFrom(field: FieldDefinition): Draft {
  return {
    label: field.label,
    type: field.type,
    agentBrief: field.agentBrief ?? "",
    agentFilled: field.agentFilled,
    required: field.required,
    showOnSheet: field.showOnSheet,
    showOnTable: field.showOnTable,
    optionsText: field.options.map((o) => o.label).join("\n"),
  };
}

function bodyFrom(draft: Draft) {
  return {
    label: draft.label.trim(),
    type: draft.type,
    agentBrief: draft.agentBrief.trim() || null,
    agentFilled: draft.agentFilled,
    required: draft.required,
    showOnSheet: draft.showOnSheet,
    showOnTable: draft.showOnTable,
    ...(draft.type === "SELECT"
      ? {
          options: draft.optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((label) => ({ label })),
        }
      : {}),
  };
}

export function CustomFieldsManager() {
  const [entity, setEntity] = useState<EntityValue>("CONTACT");
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const noun = ENTITIES.find((e) => e.value === entity)?.noun ?? "record";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fields?entity=${entity}`);
      setFields(res.ok ? ((await res.json()).fields ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    load();
  }, [load]);

  function closeForm() {
    setAdding(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setError(null);
  }

  async function save() {
    if (!draft.label.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const editing = editingId !== null;
      const res = await fetch(editing ? `/api/fields/${editingId}` : "/api/fields", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? bodyFrom(draft) : { entity, ...bodyFrom(draft) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not save that field.");
        return;
      }
      closeForm();
      await load();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: FieldDefinition) {
    if (
      !confirm(
        `Remove "${field.label}"? If any ${noun} already has a value in it, the field is archived and those answers are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fields/${field.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not remove that field.");
        return;
      }
      setNotice(
        data.archived
          ? `Archived "${field.label}". Its ${data.valueCount} saved answer${data.valueCount === 1 ? "" : "s"} are kept.`
          : `Deleted "${field.label}".`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const formOpen = adding || editingId !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custom fields</CardTitle>
        <CardDescription>
          Add the columns your business actually runs on. Each field carries a
          brief: plain prose telling your agent what belongs there and where to
          look, so it can go fill the field on its own.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Which record type these fields live on */}
        <div className="flex flex-wrap gap-2">
          {ENTITIES.map((e) => (
            <Button
              key={e.value}
              size="sm"
              variant={entity === e.value ? "default" : "outline"}
              onClick={() => {
                setEntity(e.value);
                closeForm();
                setNotice(null);
              }}
            >
              {e.label}
            </Button>
          ))}
        </div>

        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

        {/* Existing fields */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No custom fields on {noun} records yet. Add one and your agent can
            start filling it.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {fields.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.label}</span>
                    <code className="text-xs text-muted-foreground">{f.key}</code>
                    <Badge variant="outline">
                      {TYPES.find((t) => t.value === f.type)?.label ?? f.type}
                    </Badge>
                    {f.required && <Badge variant="warning">Required</Badge>}
                    {f.agentFilled ? (
                      <Badge variant="primary">Agent fills this</Badge>
                    ) : (
                      <Badge variant="secondary">You fill this</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {f.agentBrief ? (
                      f.agentBrief
                    ) : f.agentFilled ? (
                      <span className="text-warning">
                        No brief yet. Your agent has nothing to go on for this one.
                      </span>
                    ) : (
                      "Filled by hand."
                    )}
                  </p>
                  {f.type === "SELECT" && f.options.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choices: {f.options.map((o) => o.label).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setAdding(false);
                      setEditingId(f.id);
                      setDraft(draftFrom(f));
                      setError(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(f)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create / edit form */}
        {formOpen ? (
          <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="field-label" className="text-xs font-medium text-muted-foreground">
                  Field name
                </label>
                <Input
                  id="field-label"
                  value={draft.label}
                  placeholder="Compliance framework"
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
                {draft.label.trim() && editingId === null && (
                  <p className="text-xs text-muted-foreground">
                    Your agent will call this{" "}
                    <code className="text-foreground">
                      {previewKey(draft.label) || "..."}
                    </code>
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="field-type" className="text-xs font-medium text-muted-foreground">
                  Type
                </label>
                <select
                  id="field-type"
                  className={selectClass}
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as TypeValue })}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {draft.type === "SELECT" && (
              <div className="space-y-1.5">
                <label htmlFor="field-options" className="text-xs font-medium text-muted-foreground">
                  Choices, one per line
                </label>
                <Textarea
                  id="field-options"
                  rows={4}
                  value={draft.optionsText}
                  placeholder={"SOC 2\nISO 27001\nHIPAA\nNone"}
                  onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Your agent can only pick from this list. Anything else is
                  rejected rather than quietly added.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="field-brief" className="text-xs font-medium text-muted-foreground">
                Agent brief
              </label>
              <Textarea
                id="field-brief"
                rows={4}
                value={draft.agentBrief}
                placeholder="Which security framework this company is certified against. Check their trust or security page first, then the footer of their site. If nothing says it plainly, leave this empty."
                onChange={(e) => setDraft({ ...draft, agentBrief: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                This prose is exactly what your agent reads before it fills the
                field. Write it the way you would brief a new hire: what the
                field means, where to look, and what counts as good enough. Say
                so if you would rather have it blank than guessed, because an
                empty field beats a wrong one.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.agentFilled}
                  onChange={(e) => setDraft({ ...draft, agentFilled: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Let my agent fill this
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.showOnSheet}
                  onChange={(e) => setDraft({ ...draft, showOnSheet: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Show on the record
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.showOnTable}
                  onChange={(e) => setDraft({ ...draft, showOnTable: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Show as a list column
              </label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button size="sm" variant="glow" disabled={busy || !draft.label.trim()} onClick={save}>
                {busy ? "Saving..." : editingId ? "Save changes" : "Add field"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding(true);
              setDraft(emptyDraft);
              setNotice(null);
            }}
          >
            Add a field
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
