import Link from "next/link";
import {
  Users,
  Building2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { FloatIn } from "@/components/ui/float-in";
import { ContactRows } from "@/components/dashboard/crm-rows";
import { EntityRows } from "@/components/dashboard/crm-rows";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";

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
        <h1 className="font-brand text-2xl sm:text-3xl text-foreground">CRM</h1>
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
      {/* Header */}
      <FloatIn delay={0} className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-brand text-2xl sm:text-3xl text-foreground">CRM</h1>
          <p className="text-muted-foreground mt-1">
            Your context engine — businesses and the people inside them, owned and
            enriched.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/discover">
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
      </FloatIn>

      {/* Tabs */}
      <FloatIn delay={0.06}>
        <div className="flex gap-1 border-b border-border">
          <TabLink href="/crm?tab=contacts" active={tab === "contacts"}>
            Contacts
            <span className="text-muted-foreground">{contactCount}</span>
          </TabLink>
          <TabLink href="/crm?tab=entities" active={tab === "entities"}>
            Entities
            <span className="text-muted-foreground">{entityCount}</span>
          </TabLink>
        </div>
      </FloatIn>

      <FloatIn delay={0.1}>
        {tab === "contacts" ? (
          <ContactsList userId={user.id} />
        ) : (
          <EntitiesList userId={user.id} />
        )}
      </FloatIn>
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

  // Serialise dates so the client component receives plain strings.
  const rows = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    title: c.title,
    status: c.status,
    updatedAt: c.updatedAt.toISOString(),
    entity: c.entity ?? null,
  }));

  return <ContactRows contacts={rows} />;
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

  // Serialise dates so the client component receives plain strings.
  const rows = entities.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    industry: e.industry,
    domain: e.domain,
    updatedAt: e.updatedAt.toISOString(),
    _count: e._count,
  }));

  return <EntityRows entities={rows} />;
}

