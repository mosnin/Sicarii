import Link from "next/link";
import {
  Users,
  Building2,
  Plus,
  Radar,
  Mail,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { statusBadgeVariant, statusLabel } from "@/lib/contact-status";
import { entityStatusBadgeVariant, entityStatusLabel } from "@/lib/entity-status";

type Tab = "contacts" | "entities";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "entities" ? "entities" : "contacts";
  const user = await getDbUser();

  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">CRM</h1>
        <p className="text-muted-foreground">
          Your account is being set up. Refresh in a moment.
        </p>
      </div>
    );
  }

  const [contactCount, entityCount] = await Promise.all([
    prisma.contact.count({ where: { userId: user.id } }),
    prisma.entity.count({ where: { userId: user.id } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">CRM</h1>
          <p className="text-muted-foreground mt-1">
            Your context engine — businesses and the people inside them, owned and
            enriched.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/discover">
              <Radar className="mr-1 h-4 w-4" />
              Discover
            </Link>
          </Button>
          <Button variant="glow" asChild>
            <Link href={tab === "entities" ? "/crm/entity/new" : "/crm/new"}>
              <Plus className="mr-1 h-4 w-4" />
              {tab === "entities" ? "Add entity" : "Add contact"}
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabLink href="/crm?tab=contacts" active={tab === "contacts"}>
          <Users className="h-4 w-4" />
          Contacts
          <span className="text-muted-foreground">{contactCount}</span>
        </TabLink>
        <TabLink href="/crm?tab=entities" active={tab === "entities"}>
          <Building2 className="h-4 w-4" />
          Entities
          <span className="text-muted-foreground">{entityCount}</span>
        </TabLink>
      </div>

      {tab === "contacts" ? (
        <ContactsList userId={user.id} />
      ) : (
        <EntitiesList userId={user.id} />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

async function ContactsList({ userId }: { userId: string }) {
  const contacts = await prisma.contact.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { entity: { select: { id: true, name: true } } },
    take: 500,
  });

  if (contacts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Use Discover or the agent to find and save people, or add one manually."
          action={
            <Button variant="glow" asChild>
              <Link href="/crm/new">
                <Plus className="mr-1 h-4 w-4" />
                Add contact
              </Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {contacts.map((c) => (
          <Link
            key={c.id}
            href={`/crm/${c.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">
                  {c.name || c.email || "Unnamed contact"}
                </span>
                <Badge variant={statusBadgeVariant(c.status)}>
                  {statusLabel(c.status)}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {c.entity?.name && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {c.entity.name}
                  </span>
                )}
                {c.email && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Mail className="h-3.5 w-3.5" />
                    {c.email}
                  </span>
                )}
                {c.title && <span className="truncate">{c.title}</span>}
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(c.updatedAt).toLocaleDateString()}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

async function EntitiesList({ userId }: { userId: string }) {
  const entities = await prisma.entity.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { contacts: true } } },
    take: 500,
  });

  if (entities.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Building2}
          title="No entities yet"
          description="Entities are the businesses in your pipeline. Ask the agent to find some, or add one manually."
          action={
            <Button variant="glow" asChild>
              <Link href="/crm/entity/new">
                <Plus className="mr-1 h-4 w-4" />
                Add entity
              </Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {entities.map((e) => (
          <Link
            key={e.id}
            href={`/crm/entity/${e.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{e.name}</span>
                <Badge variant={entityStatusBadgeVariant(e.status)}>
                  {entityStatusLabel(e.status)}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {e.industry && <span className="truncate">{e.industry}</span>}
                {e.domain && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Globe className="h-3.5 w-3.5" />
                    {e.domain}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {e._count.contacts} contact
                  {e._count.contacts === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(e.updatedAt).toLocaleDateString()}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
