import Link from "next/link";
import { CONTACT_STATUSES, PIPELINE_STAGES } from "@/lib/lead-org";
import { statusLabel } from "@/lib/contact-status";
import { Button } from "@/components/ui/button";

export type LeadFilterValues = {
  status?: string;
  source?: string;
  tag?: string;
  list?: string;
  ownerId?: string;
  segmentId?: string;
  stage?: string;
};

export type LeadFilterOptions = {
  sources: string[];
  lists: string[];
  ownerIds: string[];
  tags: string[];
  segments: { id: string; name: string }[];
};

const selectClass =
  "h-9 max-w-[11rem] rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function stageLabel(stage: string) {
  return stage.charAt(0) + stage.slice(1).toLowerCase();
}

export function LeadFilters({
  values,
  options,
}: {
  values: LeadFilterValues;
  options: LeadFilterOptions;
}) {
  const active = Object.values(values).some(Boolean);

  return (
    <form method="get" className="flex flex-col gap-3">
      <input type="hidden" name="tab" value="contacts" />
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect name="status" label="Status" value={values.status}>
          {CONTACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="stage" label="Pipeline stage" value={values.stage}>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {stageLabel(s)}
            </option>
          ))}
        </FilterSelect>
        {options.sources.length > 0 && (
          <FilterSelect name="source" label="Source" value={values.source}>
            {options.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FilterSelect>
        )}
        {options.lists.length > 0 && (
          <FilterSelect name="list" label="List" value={values.list}>
            {options.lists.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FilterSelect>
        )}
        {options.tags.length > 0 && (
          <FilterSelect name="tag" label="Tag" value={values.tag}>
            {options.tags.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FilterSelect>
        )}
        {options.segments.length > 0 && (
          <FilterSelect name="segmentId" label="Segment" value={values.segmentId}>
            {options.segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </FilterSelect>
        )}
        {options.ownerIds.length > 0 && (
          <FilterSelect name="ownerId" label="Owner" value={values.ownerId}>
            {options.ownerIds.map((id) => (
              <option key={id} value={id}>
                {id === values.ownerId && values.ownerId ? id.slice(0, 8) : id.slice(0, 8)}
              </option>
            ))}
          </FilterSelect>
        )}
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
        {active && (
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href="/crm?tab=contacts">Clear</Link>
          </Button>
        )}
      </div>
    </form>
  );
}

function FilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span className="block">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={selectClass}>
        <option value="">Any</option>
        {children}
      </select>
    </label>
  );
}
