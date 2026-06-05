"use client";

import Link from "next/link";
import { Building2, Mail, Globe, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FloatIn } from "@/components/ui/float-in";
import { cn } from "@/lib/utils";

/* ---------- Types passed in from the server ---------- */

export type CrmContact = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  status: string;
  updatedAt: string; // serialised Date
  entity: { id: string; name: string } | null;
};

export type CrmEntity = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  domain: string | null;
  updatedAt: string;
  _count: { contacts: number };
};

/* -------- Status badge helpers (mirroring the lib helpers) -------- */

function statusColor(status: string) {
  switch (status) {
    case "LEAD":
      return "secondary";
    case "CONTACTED":
      return "orange";
    case "REPLIED":
      return "orange";
    case "QUALIFIED":
      return "success";
    case "WON":
      return "success";
    case "LOST":
      return "destructive";
    default:
      return "secondary";
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    LEAD: "Lead",
    CONTACTED: "Contacted",
    REPLIED: "Replied",
    QUALIFIED: "Qualified",
    WON: "Won",
    LOST: "Lost",
    PROSPECT: "Prospect",
    CUSTOMER: "Customer",
    CHURNED: "Churned",
  };
  return map[status] ?? status;
}

/* --------- Floating row card --------- */

function RowCard({
  href,
  children,
  delay,
}: {
  href: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <FloatIn delay={delay}>
      <Link
        href={href}
        className={cn(
          "group flex items-center justify-between gap-4 rounded-2xl bg-card px-5 py-4",
          "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_1px_3px_-1px_rgba(0,0,0,0.06)]",
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_-4px_rgba(0,0,0,0.12),0_2px_6px_-2px_rgba(90,176,232,0.12)]"
        )}
      >
        {children}
      </Link>
    </FloatIn>
  );
}

/* --------- Contact rows --------- */

export function ContactRows({ contacts }: { contacts: CrmContact[] }) {
  return (
    <div className="space-y-2.5">
      {contacts.map((c, i) => (
        <RowCard key={c.id} href={`/crm/${c.id}`} delay={0.05 + i * 0.04}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {c.name || c.email || "Unnamed contact"}
              </span>
              <Badge variant={statusColor(c.status) as Parameters<typeof Badge>[0]["variant"]}>
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
                <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {c.email}
                </span>
              )}
              {c.title && <span className="truncate">{c.title}</span>}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(c.updatedAt).toLocaleDateString()}
          </span>
        </RowCard>
      ))}
    </div>
  );
}

/* --------- Entity rows --------- */

export function EntityRows({ entities }: { entities: CrmEntity[] }) {
  return (
    <div className="space-y-2.5">
      {entities.map((e, i) => (
        <RowCard
          key={e.id}
          href={`/crm/entity/${e.id}`}
          delay={0.05 + i * 0.04}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {e.name}
              </span>
              <Badge variant={statusColor(e.status) as Parameters<typeof Badge>[0]["variant"]}>
                {statusLabel(e.status)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {e.industry && <span className="truncate">{e.industry}</span>}
              {e.domain && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
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
        </RowCard>
      ))}
    </div>
  );
}
