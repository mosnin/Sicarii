import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FloatIn } from "@/components/ui/float-in";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { statusBadgeVariant, statusLabel } from "@/lib/contact-status";
import { ContactActions } from "./actions";
import { ContactEnrich, ContactEnrichAll } from "./enrich";
import { CrmAvatar } from "@/components/dashboard/crm-avatar";
import { EnrichmentStatusCard, contactTier } from "@/components/dashboard/enrichment-status";
import { ContactAgentMail } from "./agentmail";
import { ContactAgentPhone } from "./agentphone";
import { QuickNote } from "./quick-note";
import { MatchEntity } from "./match-entity";
import { getProvenanceMap } from "@/lib/provenance";
import { FieldWithProvenance } from "@/components/dashboard/provenance-pill";
import { VerifiedStrip } from "@/components/dashboard/verified-strip";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) notFound();

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { entity: { select: { id: true, name: true } } },
  });
  if (!contact || contact.userId !== user.id) notFound();

  const emails = await prisma.contactEmail.findMany({
    where: { contactId: id },
    orderBy: { sentAt: "desc" },
  });

  // Recent activity trail (notes, outreach, calls) - fed by the QuickNote
  // morph surface and the agent's log_outreach/add_activity tools.
  const activities = await prisma.activity.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const provenance = await getProvenanceMap("contact", id);

  // Which core fields are still missing (drives both the prominent Enrich
  // button on the status card and the per-field Find buttons in Details).
  const missing = [
    !contact.linkedin ? ("linkedin" as const) : null,
    !contact.email ? ("email" as const) : null,
    !contact.phone ? ("phone" as const) : null,
  ].filter((f): f is "linkedin" | "email" | "phone" => f !== null);

  // Fields with optional provenance metadata. Only enriched fields carry
  // provenance (title, company, location are usually manually entered).
  const fields: { label: string; value: string | null; href?: string; provenanceField?: string }[] = [
    { label: "Title", value: contact.title },
    { label: "Company", value: contact.company },
    { label: "Email", value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined, provenanceField: "email" },
    { label: "Phone", value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : undefined, provenanceField: "phone" },
    {
      label: "Website",
      value: contact.website ? contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
      href: contact.website
        ? contact.website.startsWith("http")
          ? contact.website
          : `https://${contact.website}`
        : undefined,
    },
    {
      label: "LinkedIn",
      value: contact.linkedin ? contact.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null,
      href: contact.linkedin
        ? contact.linkedin.startsWith("http")
          ? contact.linkedin
          : `https://${contact.linkedin}`
        : undefined,
      provenanceField: "linkedin",
    },
    { label: "Location", value: contact.location },
  ];

  return (
    <div className="space-y-6">
      <FloatIn delay={0}>
        <Link
          href="/crm"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CRM
        </Link>
      </FloatIn>

      <FloatIn delay={0.06}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CrmAvatar src={contact.imageUrl} label={contact.name || contact.email} shape="circle" size={44} className="mt-0.5" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-brand text-2xl sm:text-3xl text-foreground">
                  {contact.name || contact.email || "Unnamed contact"}
                </h1>
                <Badge variant={statusBadgeVariant(contact.status)}>
                  {statusLabel(contact.status)}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                {contact.entity && (
                  <Link
                    href={`/crm/entity/${contact.entity.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {contact.entity.name}
                  </Link>
                )}
                {contact.source && <span>Source: {contact.source}</span>}
              </div>
            </div>
          </div>
          <ContactActions contactId={contact.id} currentStatus={contact.status} />
        </div>
      </FloatIn>

      {/* Visible Trust: one headline rolling up all field provenance. */}
      {Object.keys(provenance).length > 0 && (
        <FloatIn delay={0.09}>
          <VerifiedStrip provenance={provenance} />
        </FloatIn>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <FloatIn delay={0.1} className="lg:col-span-1 space-y-6">
          <EnrichmentStatusCard
            tier={contactTier(contact)}
            action={<ContactEnrichAll contactId={contact.id} missing={missing} />}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((f) => (
                <FieldWithProvenance
                  key={f.label}
                  label={f.label}
                  value={f.value}
                  href={f.href}
                  meta={f.provenanceField ? provenance[f.provenanceField] : undefined}
                />
              ))}
              {fields.every((f) => !f.value && !f.provenanceField) && (
                <p className="text-sm text-muted-foreground">
                  No details yet. Enrich this contact to fill them in.
                </p>
              )}
              <ContactEnrich contactId={contact.id} missing={missing} />
              {!contact.entity && <MatchEntity contactId={contact.id} />}
              {contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {contact.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {contact.notes && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-sm">{contact.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </FloatIn>

        {/* Email - AgentMail threads + saved context */}
        <FloatIn delay={0.14} className="lg:col-span-2 space-y-6">
          <ContactAgentMail contactId={contact.id} />
          <ContactAgentPhone contactId={contact.id} />

          {/* Activity trail + QuickNote morph surface */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <QuickNote contactId={contact.id} />
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No activity yet. Notes you or your agent log will show up here.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {activities.map((a) => (
                    <div key={a.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {a.kind}
                          {a.channel ? ` · ${a.channel}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {a.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saved context</CardTitle>
            </CardHeader>
            <CardContent>
              {emails.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No emails yet"
                  description="Connect your AgentMail account in Settings to send and receive email here. Messages your agent saves as context will appear on this record."
                />
              ) : (
                <div className="space-y-4">
                  {emails.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl border border-border bg-card/50 p-4"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              m.direction === "OUTBOUND" ? "orange" : "secondary"
                            }
                          >
                            {m.direction === "OUTBOUND" ? "Sent" : "Received"}
                          </Badge>
                          {m.savedAsContext && (
                            <Badge variant="success">Saved as context</Badge>
                          )}
                        </div>
                        {m.sentAt && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(m.sentAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {m.subject && (
                        <p className="font-medium">{m.subject}</p>
                      )}
                      {m.body && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {m.body}
                        </p>
                      )}
                    </div>
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
