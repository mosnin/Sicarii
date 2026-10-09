import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Users as UsersIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FloatIn } from "@/components/ui/float-in";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { entityStatusBadgeVariant, entityStatusLabel } from "@/lib/entity-status";
import { statusBadgeVariant, statusLabel } from "@/lib/contact-status";
import { AspectView, humanizeKey } from "@/components/dashboard/aspect-view";
import { CrmAvatar } from "@/components/dashboard/crm-avatar";
import { EnrichmentStatusCard, entityTier } from "@/components/dashboard/enrichment-status";
import { EntityActions } from "./actions";
import { EntityEditor } from "./editor";
import { getProvenanceMap } from "@/lib/provenance";
import { FieldWithProvenance } from "@/components/dashboard/provenance-pill";
import { VerifiedStrip } from "@/components/dashboard/verified-strip";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) notFound();

  const entity = await prisma.entity.findUnique({ where: { id } });
  if (!entity || entity.userId !== user.id) notFound();

  const contacts = await prisma.contact.findMany({
    where: { entityId: id },
    orderBy: { updatedAt: "desc" },
  });

  const provenance = await getProvenanceMap("entity", id, user.id);

  // Website and domain are the same fact - show one clickable Website row.
  const websiteUrl = entity.website || (entity.domain ? `https://${entity.domain}` : null);
  const websiteText = entity.website
    ? entity.website.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : entity.domain;

  // Fields with optional provenance metadata for enriched columns.
  const fields: { label: string; value: string | null | undefined; href?: string; provenanceField?: string }[] = [
    { label: "Industry", value: entity.industry, provenanceField: "industry" },
    { label: "Website", value: websiteText, href: websiteUrl ?? undefined, provenanceField: "website" },
    { label: "Phone", value: entity.phone, href: entity.phone ? `tel:${entity.phone}` : undefined, provenanceField: "phone" },
    { label: "Location", value: entity.location, provenanceField: "location" },
    { label: "Size", value: entity.size },
  ];

  // Enrichment payloads attached by the Enrich dropdown (firmographics, tech
  // stack, funding, ...), keyed by aspect. Rendered below so they're visible.
  const enrichment =
    entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
      ? (entity.enrichment as Record<string, unknown>)
      : null;
  const enrichmentEntries = enrichment
    ? Object.entries(enrichment).filter(([, v]) => v != null)
    : [];

  // ICP verdict from the deep report, if it has run.
  const deepReport = enrichment?.deepReport as { icpFit?: { isIcp: boolean; score: number; reasoning: string } } | undefined;
  const icp = deepReport?.icpFit;

  return (
    <div className="space-y-4">
      <FloatIn delay={0}>
        <Link
          href="/crm?tab=entities"
          className="inline-flex h-7 items-center gap-1 rounded-[4px] px-1.5 -ml-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
          Back to entities
        </Link>
      </FloatIn>

      <FloatIn delay={0.03}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CrmAvatar src={entity.logoUrl} label={entity.name} shape="square" size={40} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-foreground">{entity.name}</h1>
                <Badge variant={entityStatusBadgeVariant(entity.status)}>
                  {entityStatusLabel(entity.status)}
                </Badge>
              </div>
              {entity.source && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Source: {entity.source}
                </p>
              )}
            </div>
          </div>
          <EntityActions
            entityId={entity.id}
            hasDomain={Boolean(entity.domain)}
          />
        </div>
      </FloatIn>

      {/* Visible Trust: one headline rolling up all field provenance. */}
      {Object.keys(provenance).length > 0 && (
        <FloatIn delay={0.05}>
          <VerifiedStrip provenance={provenance} />
        </FloatIn>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <FloatIn delay={0.06} className="lg:col-span-1 space-y-4">
          <EnrichmentStatusCard tier={entityTier(entity.status, entity.enrichment)} />
          {icp && (
            <Panel
              title="ICP fit"
              action={
                <Badge variant={icp.isIcp ? "success" : "secondary"} className="tabular-nums">
                  {icp.isIcp ? `ICP match · ${icp.score}` : `Not ICP · ${icp.score}`}
                </Badge>
              }
            >
              <p className="text-sm text-muted-foreground">{icp.reasoning}</p>
            </Panel>
          )}
          <Panel title="Details">
            <div className="space-y-0.5">
              {fields.map((f) => (
                <FieldWithProvenance
                  key={f.label}
                  label={f.label}
                  value={f.value ?? null}
                  href={f.href}
                  meta={f.provenanceField ? provenance[f.provenanceField] : undefined}
                />
              ))}
            </div>
            <div className="mt-3 space-y-3">
              {entity.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{entity.description}</p>
                </div>
              )}
              {entity.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entity.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {entity.notes && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{entity.notes}</p>
                </div>
              )}
              <EntityEditor
                entityId={entity.id}
                initial={{
                  name: entity.name ?? "",
                  website: entity.website ?? "",
                  domain: entity.domain ?? "",
                  phone: entity.phone ?? "",
                  industry: entity.industry ?? "",
                  location: entity.location ?? "",
                  size: entity.size ?? "",
                  description: entity.description ?? "",
                }}
              />
            </div>
          </Panel>
        </FloatIn>

        <FloatIn delay={0.08} className="lg:col-span-2">
          <Panel
            title="Contacts"
            flush
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/crm/new?entityId=${entity.id}`}>
                  <Plus className="h-4 w-4" strokeWidth={1.6} />
                  Add
                </Link>
              </Button>
            }
          >
            {contacts.length === 0 ? (
              <EmptyState
                icon={UsersIcon}
                title="No contacts on this entity"
                description="Enrich the business to pull its contacts, or add people manually and assign them here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/crm/${c.id}`}
                      className="flex h-10 items-center gap-2 px-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <CrmAvatar src={c.imageUrl} label={c.name || c.email} shape="circle" size={20} />
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {c.name || c.email || "Unnamed contact"}
                      </span>
                      {c.email && (
                        <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
                          {c.email}
                        </span>
                      )}
                      <Badge variant={statusBadgeVariant(c.status)} className="ml-auto shrink-0">
                        {statusLabel(c.status)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </FloatIn>
      </div>

      {/* Enrichment aspects as a grid of panels (firmographics, funding,
          tech stack, traffic, news) - each rendered as real cards/stats, not a
          raw JSON blob. The deepReport key is surfaced via the ICP card above. */}
      {enrichmentEntries.filter(([k]) => k !== "deepReport").length > 0 && (
        <FloatIn delay={0.1}>
          <div>
            <h2 className="text-base font-semibold text-foreground">Intelligence</h2>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {enrichmentEntries
                .filter(([k]) => k !== "deepReport")
                .map(([key, val]) => (
                  <Panel key={key} title={humanizeKey(key)} className={/news|firmographic/i.test(key) ? "sm:col-span-2" : ""}>
                    <AspectView aspectKey={key} value={val} />
                  </Panel>
                ))}
            </div>
          </div>
        </FloatIn>
      )}
    </div>
  );
}

// Twenty show-page panel: hairline border, 40px header row, padded body.
function Panel({
  title,
  action,
  flush,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-[8px] border border-border bg-background", className)}>
      <header className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>
        {action}
      </header>
      <div className={flush ? undefined : "p-3"}>{children}</div>
    </section>
  );
}
