import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Users as UsersIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const provenance = await getProvenanceMap("entity", id);

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
    <div className="space-y-6">
      <FloatIn delay={0}>
        <Link
          href="/crm?tab=entities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to entities
        </Link>
      </FloatIn>

      <FloatIn delay={0.06}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CrmAvatar src={entity.logoUrl} label={entity.name} shape="square" size={44} className="mt-0.5" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-brand text-2xl sm:text-3xl text-foreground">{entity.name}</h1>
                <Badge variant={entityStatusBadgeVariant(entity.status)}>
                  {entityStatusLabel(entity.status)}
                </Badge>
              </div>
              {entity.source && (
                <p className="mt-1 text-sm text-muted-foreground">
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

      <div className="grid gap-6 lg:grid-cols-3">
        <FloatIn delay={0.1} className="lg:col-span-1 space-y-6">
          <EnrichmentStatusCard tier={entityTier(entity.status, entity.enrichment)} />
          {icp && (
            <div className={`rounded-2xl border p-4 shadow-sm ${icp.isIcp ? "border-green-500/30 bg-green-500/5" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">ICP fit</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${icp.isIcp ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                  {icp.isIcp ? `ICP match · ${icp.score}` : `Not ICP · ${icp.score}`}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{icp.reasoning}</p>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((f) => (
                <FieldWithProvenance
                  key={f.label}
                  label={f.label}
                  value={f.value ?? null}
                  href={f.href}
                  meta={f.provenanceField ? provenance[f.provenanceField] : undefined}
                />
              ))}
              {entity.description && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="whitespace-pre-wrap text-sm">{entity.description}</p>
                </div>
              )}
              {entity.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {entity.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {entity.notes && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-sm">{entity.notes}</p>
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
            </CardContent>
          </Card>
        </FloatIn>

        <FloatIn delay={0.14} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contacts</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/crm/new?entityId=${entity.id}`}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <EmptyState
                  icon={UsersIcon}
                  title="No contacts on this entity"
                  description="Enrich the business to pull its contacts, or add people manually and assign them here."
                />
              ) : (
                <div className="divide-y divide-border">
                  {contacts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/crm/${c.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40 rounded-lg px-2"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">
                          {c.name || c.email || "Unnamed contact"}
                        </span>
                        {c.email && (
                          <p className="truncate text-sm text-muted-foreground">
                            {c.email}
                          </p>
                        )}
                      </div>
                      <Badge variant={statusBadgeVariant(c.status)}>
                        {statusLabel(c.status)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </FloatIn>
      </div>

      {/* Enrichment aspects as a visual bento grid (firmographics, funding,
          tech stack, traffic, news) - each rendered as real cards/stats, not a
          raw JSON blob. The deepReport key is surfaced via the ICP card above. */}
      {enrichmentEntries.filter(([k]) => k !== "deepReport").length > 0 && (
        <FloatIn delay={0.18}>
          <div>
            <h2 className="font-brand text-lg text-foreground">Intelligence</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {enrichmentEntries
                .filter(([k]) => k !== "deepReport")
                .map(([key, val]) => (
                  <Card key={key} className={/news|firmographic/i.test(key) ? "sm:col-span-2" : ""}>
                    <CardHeader>
                      <CardTitle className="text-base">{humanizeKey(key)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AspectView aspectKey={key} value={val} />
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        </FloatIn>
      )}
    </div>
  );
}
