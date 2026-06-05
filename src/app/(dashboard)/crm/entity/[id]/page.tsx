import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Globe,
  MapPin,
  Briefcase,
  Users as UsersIcon,
  Building2,
  Plus,
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
import { EntityActions } from "./actions";

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

  const fields = [
    { icon: Briefcase, label: "Industry", value: entity.industry },
    { icon: Globe, label: "Domain", value: entity.domain },
    { icon: Globe, label: "Website", value: entity.website },
    { icon: MapPin, label: "Location", value: entity.location },
    { icon: Building2, label: "Size", value: entity.size },
  ];

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
          <EntityActions
            entityId={entity.id}
            hasDomain={Boolean(entity.domain)}
          />
        </div>
      </FloatIn>

      <div className="grid gap-6 lg:grid-cols-3">
        <FloatIn delay={0.1} className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields
                .filter((f) => f.value)
                .map((f) => {
                  const Icon = f.icon;
                  return (
                    <div key={f.label} className="flex items-start gap-3 text-sm">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{f.label}</p>
                        <p className="break-words">{f.value}</p>
                      </div>
                    </div>
                  );
                })}
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
    </div>
  );
}
