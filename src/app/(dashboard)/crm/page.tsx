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
import { CrmHeaderMenu } from "@/components/dashboard/crm-header-menu";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";

type Tab = "contacts" | "entities";

// Server-side page size for both lists.
const PAGE = 500;

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { tab: tabParam, page: pageParam } = await searchParams;
  const tab: Tab = tabParam === "entities" ? "entities" : "contacts";
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
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
            Your context engine - businesses and the people inside them, owned and
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
          {tab === "entities" && <CrmHeaderMenu />}
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
          <ContactsList userId={user.id} page={page} />
        ) : (
          <EntitiesList userId={user.id} page={page} />
        )}
      </FloatIn>

      <Pager
        tab={tab}
        page={page}
        count={tab === "contacts" ? contactCount : entityCount}
      />
    </div>
  );
}

// Minimal pager, only shown once a list outgrows a single page.
function Pager({ tab, page, count }: { tab: Tab; page: number; count: number }) {
  if (count <= PAGE) return null;
  const totalPages = Math.ceil(count / PAGE);

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/crm?tab=${tab}&page=${Math.max(1, page - 1)}`}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          >
            Previous
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/crm?tab=${tab}&page=${Math.min(totalPages, page + 1)}`}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
          >
            Next
          </Link>
        </Button>
      </div>
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

async function ContactsList({ userId, page }: { userId: string; page: number }) {
  const contacts = await prisma.contact.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { entity: { select: { id: true, name: true } } },
    // The list row never renders the enrichment blob; skip pulling KBs per row.
    omit: { enrichment: true },
    skip: (page - 1) * PAGE,
    take: PAGE,
  });

  if (contacts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title="Let's find your people"
          description="Tell Scalar who you sell to and it discovers real people into your CRM, verified and deduped. Or add one by hand."
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button variant="glow" asChild>
                <Link href="/discover">Discover people</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/crm/new">
                  <Plus className="mr-1 h-4 w-4" />
                  Add manually
                </Link>
              </Button>
            </div>
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
    imageUrl: c.imageUrl,
    updatedAt: c.updatedAt.toISOString(),
    entity: c.entity ?? null,
  }));

  return <ContactRows contacts={rows} />;
}

async function EntitiesList({ userId, page }: { userId: string; page: number }) {
  const entities = await prisma.entity.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { contacts: true } } },
    // The list row never renders the enrichment blob; skip pulling KBs per row.
    omit: { enrichment: true },
    skip: (page - 1) * PAGE,
    take: PAGE,
  });

  if (entities.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Building2}
          title="Let's find your companies"
          description="Describe your ideal customer and Scalar discovers matching businesses with full profiles, straight into your pipeline. Or add one by hand."
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button variant="glow" asChild>
                <Link href="/discover">Discover companies</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/crm/entity/new">
                  <Plus className="mr-1 h-4 w-4" />
                  Add manually
                </Link>
              </Button>
            </div>
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
    location: e.location,
    logoUrl: e.logoUrl,
    updatedAt: e.updatedAt.toISOString(),
    _count: e._count,
  }));

  return <EntityRows entities={rows} />;
}

