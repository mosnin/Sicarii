"use client";

/**
 * CustomFields - a record's operator-defined fields, rendered and edited by
 * type. Sits on a contact, company, or deal page next to the built-in columns.
 *
 * Two behaviours worth keeping: an empty field is still shown (a question the
 * operator asked is worth seeing unanswered), and a field the agent is meant
 * to fill says so, with the operator's own brief underneath, so nobody has to
 * guess what the blank means.
 *
 * Not wired into any page here on purpose. Export only; the record pages own
 * where it sits.
 */

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CustomFieldEntity = "CONTACT" | "ENTITY" | "PIPELINE_ENTRY";

type FieldType =
  | "TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "DATE"
  | "CHECKBOX"
  | "SELECT"
  | "URL"
  | "EMAIL"
  | "PHONE";

interface RecordField {
  fieldId: string;
  key: string;
  label: string;
  type: FieldType;
  value: string | number | boolean | null;
  display: string;
  required: boolean;
  agentFilled: boolean;
  agentBrief: string | null;
  options: { value: string; label: string }[];
}

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The server hands dates back as full ISO strings; the date input wants the
// calendar day only.
function toDateInput(value: string | number | boolean | null): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function toTextInput(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function CustomFields({
  entity,
  recordId,
  className,
  emptyLabel = "No custom fields on this record type yet.",
}: {
  entity: CustomFieldEntity;
  recordId: string;
  className?: string;
  emptyLabel?: string;
}) {
  const [fields, setFields] = useState<RecordField[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/fields/values?entity=${entity}&recordId=${encodeURIComponent(recordId)}`,
      );
      setFields(res.ok ? ((await res.json()).fields ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, [entity, recordId]);

  useEffect(() => {
    load();
  }, [load]);

  // One write per field. An empty input clears the value rather than storing
  // an empty string, so "unanswered" stays a real, visible state.
  async function save(field: RecordField, raw: string | number | boolean | null) {
    const value = typeof raw === "string" && !raw.trim() ? null : raw;
    if (value === field.value) return;
    setSavingKey(field.key);
    setError(null);
    try {
      const res = await fetch("/api/fields/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, recordId, key: field.key, value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Could not save ${field.label}.`);
        await load();
        return;
      }
      setFields((prev) =>
        prev.map((f) =>
          f.key === field.key
            ? { ...f, value: data.field?.value ?? null, display: data.field?.display ?? "" }
            : f,
        ),
      );
    } catch {
      setError("Something went wrong.");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Loading...</p>;
  }
  if (!fields.length) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyLabel}</p>;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {fields.map((f) => {
        const inputId = `custom-field-${f.fieldId}`;
        const isEmpty = f.value === null || f.value === "";
        return (
          <div key={f.fieldId} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
                {f.label}
              </label>
              {f.required && isEmpty && <Badge variant="warning">Needed</Badge>}
              {f.agentFilled && isEmpty && <Badge variant="primary">Your agent will fill this</Badge>}
              {savingKey === f.key && (
                <span className="text-xs text-muted-foreground">Saving...</span>
              )}
            </div>

            {f.type === "CHECKBOX" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  id={inputId}
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={f.value === true}
                  onChange={(e) => save(f, e.target.checked)}
                />
                {f.value === true ? "Yes" : "No"}
              </label>
            ) : f.type === "SELECT" ? (
              <select
                id={inputId}
                className={selectClass}
                value={typeof f.value === "string" ? f.value : ""}
                onChange={(e) => save(f, e.target.value || null)}
              >
                <option value="">Not set</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "LONG_TEXT" ? (
              <Textarea
                id={inputId}
                rows={3}
                defaultValue={toTextInput(f.value)}
                onBlur={(e) => save(f, e.target.value)}
              />
            ) : (
              <Input
                id={inputId}
                type={
                  f.type === "NUMBER"
                    ? "number"
                    : f.type === "DATE"
                      ? "date"
                      : f.type === "EMAIL"
                        ? "email"
                        : f.type === "URL"
                          ? "url"
                          : f.type === "PHONE"
                            ? "tel"
                            : "text"
                }
                defaultValue={f.type === "DATE" ? toDateInput(f.value) : toTextInput(f.value)}
                onBlur={(e) => save(f, e.target.value)}
              />
            )}

            {/* The operator's brief, shown while the answer is still missing:
                it explains what the blank is waiting for. */}
            {isEmpty && f.agentBrief && (
              <p className="text-xs text-muted-foreground">{f.agentBrief}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
