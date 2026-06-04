import Link from "next/link";
import { Users, Plus, Radar, Building2, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { statusBadgeVariant, statusLabel } from "@/lib/contact-status";

export default async function CrmPage() {
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

  const contacts = await prisma.contact.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">CRM</h1>
          <p className="text-muted-foreground mt-1">
            {contacts.length === 0
              ? "Every contact your agents discover and enrich lives here."
              : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} — discovered, enriched, and owned.`}
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
            <Link href="/crm/new">
              <Plus className="mr-1 h-4 w-4" />
              Add contact
            </Link>
          </Button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Use Discover to find and save contacts, or add one manually to get started."
            action={
              <Button variant="glow" asChild>
                <Link href="/discover">
                  <Radar className="mr-1 h-4 w-4" />
                  Open Discover
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
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
                    {c.company && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {c.company}
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
      )}
    </div>
  );
}
