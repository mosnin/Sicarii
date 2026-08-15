import Link from "next/link";
import { Users, Building2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { FloatIn } from "@/components/ui/float-in";
import { ContactRows } from "@/components/dashboard/crm-rows";
import { EntityRows } from "@/components/dashboard/crm-rows";
import { CrmHeaderMenu } from "@/components/dashboard/crm-header-menu";
import { CrmListsNav } from "@/components/dashboard/crm-lists-nav";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { contactWhere, listIndustries, listTags, parseListRules } from "@/lib/crm-lists";

type Tab = "contacts" | "entities";

const PAGE = 500;

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    list?: string;
    industry?: string;
    tag?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const tab: Tab = params.tab === "entities" ? "entities" : "contacts";
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
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

  const listId = params.list?.trim() || undefined;
  const industry = params.industry?.trim() || undefined;
  const tag = params.tag?.trim() || undefined;
  const status = params.status?.trim() || undefined;
  const q = params.q?.trim() || undefined;

  let smartRules = null;
  if (listId) {
    const seg = await prisma.segment.findFirst({
      where: { id: listId, userId: user.id },
      select: { kind: true, rules: true },
    });
    if (seg?.kind === "smart") smartRules = parseListRules(seg.rules);
  }

  const contactFilters = smartRules
    ? { ...smartRules, industry: industry ?? smartRules.industry, tag: tag ?? smartRules.tag, status: status ?? smartRules.status, q: q ?? smartRules.q }
    : { listId, industry, tag, status, q };

  const [contactCount, entityCount, lists, industries, tags] = await Promise.all([
    prisma.contact.count({ where: contactWhere(user.id, contactFilters) }),
    prisma.entity.count({
      where: {
        userId: user.id,
        ...(industry ? { industry: { equals: industry, mode: "insensitive" } } : {}),
      },
    }),
    prisma.segment.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { members: true } } },
    }),
    listIndustries(user.id),
    listTags(user.id),
  ]);

  const allContactCount = listId || industry || tag || status || q
    ? await prisma.contact.count({ where: { userId: user.id } })
    : contactCount;

  return (
    <div className="space-y-6">
      <FloatIn delay={0} className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-brand text-2xl sm:text-3xl text-foreground">CRM</h1>
          <p className="text-muted-foreground mt-1">
            Lists and segments so a big book stays sorted by who they are, not
            one pile.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/discover">Discover</Link>
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

      <FloatIn delay={0.06}>
        <div className="flex gap-1 border-b border-border">
          <TabLink href="/crm?tab=contacts" active={tab === "contacts"}>
            Contacts
            <span className="text-muted-foreground">{allContactCount}</span>
          </TabLink>
          <TabLink href="/crm?tab=entities" active={tab === "entities"}>
            Entities
            <span className="text-muted-foreground">{entityCount}</span>
          </TabLink>
        </div>
      </FloatIn>

      <FloatIn delay={0.1}>
        {tab === "contacts" ? (
          <div className="flex flex-col gap-6 lg:flex-row">
            <CrmListsNav
              lists={lists.map((l) => ({
                id: l.id,
                name: l.name,
                kind: l.kind,
                source: l.source,
                members: l._count.members,
              }))}
              industries={industries}
              tags={tags}
              active={{ list: listId, industry, tag, status }}
            />
            <div className="min-w-0 flex-1 space-y-4">
              {(listId || industry || tag || status) && (
                <p className="text-sm text-muted-foreground">
                  Showing {contactCount.toLocaleString()}
                  {listId ? " in this list" : ""}
                  {industry ? ` in ${industry}` : ""}
                  {tag ? ` tagged ${tag}` : ""}
                  {status ? ` · ${status.toLowerCase()}` : ""}.
                </p>
              )}
              <ContactsList
                userId={user.id}
                page={page}
                filters={contactFilters}
                lists={lists.map((l) => ({ id: l.id, name: l.name }))}
              />
            </div>
          </div>
        ) : (
          <EntitiesList userId={user.id} page={page} industry={industry} />
        )}
      </FloatIn>

      <Pager
        tab={tab}
        page={page}
        count={tab === "contacts" ? contactCount : entityCount}
        extra={
          listId || industry || tag || status
            ? {
                list: listId,
                industry,
                tag,
                status,
              }
            : undefined
        }
      />
    </div>
  );
}

function Pager({
  tab,
  page,
  count,
  extra,
}: {
  tab: Tab;
  page: number;
  count: number;
  extra?: { list?: string; industry?: string; tag?: string; status?: string };
}) {
  if (count <= PAGE) return null;
  const totalPages = Math.ceil(count / PAGE);
  const qs = (n: number) => {
    const p = new URLSearchParams();
    p.set("tab", tab);
    p.set("page", String(n));
    if (extra?.list) p.set("list", extra.list);
    if (extra?.industry) p.set("industry", extra.industry);
    if (extra?.tag) p.set("tag", extra.tag);
    if (extra?.status) p.set("status", extra.status);
    return `/crm?${p.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link
            href={qs(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          >
            Previous
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={qs(Math.min(totalPages, page + 1))}
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
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

async function ContactsList({
  userId,
  page,
  filters,
  lists,
}: {
  userId: string;
  page: number;
  filters: Parameters<typeof contactWhere>[1];
  lists: { id: string; name: string }[];
}) {
  const contacts = await prisma.contact.findMany({
    where: contactWhere(userId, filters),
    orderBy: { updatedAt: "desc" },
    include: { entity: { select: { id: true, name: true, industry: true } } },
    omit: { enrichment: true },
    skip: (page - 1) * PAGE,
    take: PAGE,
  });

  if (contacts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title={filters?.listId || filters?.industry || filters?.tag ? "Nothing in this view" : "Let's find your people"}
          description={
            filters?.listId || filters?.industry || filters?.tag
              ? "This list or filter is empty. Add people from All contacts, or discover new ones."
              : "Tell Scalar who you sell to and it discovers real people into your CRM, verified and deduped. Or add one by hand."
          }
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

  return <ContactRows contacts={rows} lists={lists} />;
}

async function EntitiesList({
  userId,
  page,
  industry,
}: {
  userId: string;
  page: number;
  industry?: string;
}) {
  const entities = await prisma.entity.findMany({
    where: {
      userId,
      ...(industry ? { industry: { equals: industry, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { contacts: true } } },
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
