import type { BadgeProps } from "@/components/ui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  NEW: { label: "New", variant: "secondary" },
  ENRICHED: { label: "Enriched", variant: "orange" },
  CONTACTED: { label: "Contacted", variant: "orange" },
  REPLIED: { label: "Replied", variant: "warning" },
  QUALIFIED: { label: "Qualified", variant: "orange" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
};

export const CONTACT_STATUSES = Object.keys(STATUS_META);

export function statusLabel(status: string): string {
  return STATUS_META[status]?.label ?? status;
}

export function statusBadgeVariant(status: string): BadgeVariant {
  return STATUS_META[status]?.variant ?? "secondary";
}
