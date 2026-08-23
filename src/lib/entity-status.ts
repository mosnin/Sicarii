import type { BadgeProps } from "@/components/ui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  NEW: { label: "New", variant: "secondary" },
  ENRICHED: { label: "Enriched", variant: "orange" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
};

export const ENTITY_STATUSES = Object.keys(STATUS_META);

export function entityStatusLabel(status: string): string {
  return STATUS_META[status]?.label ?? status;
}

export function entityStatusBadgeVariant(status: string): BadgeVariant {
  return STATUS_META[status]?.variant ?? "secondary";
}
