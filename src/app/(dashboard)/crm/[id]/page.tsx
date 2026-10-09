import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Inbox,
} from "lucide-react";
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
import { SocialsEditor } from "./socials";
import { LogSocialMessage } from "./log-social";
import { ShareToTeam } from "./share-to-team";
import { listUserWorkspaces } from "@/lib/workspace";
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
    take: 50,
  });

  // Social conversations (LinkedIn / X / Instagram / Facebook), rendered in the
  // same Conversations card as email so the whole relationship reads as one
  // thread regardless of channel.
  const socialMessages = await prisma.contactSocialMessage.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Recent activity trail (notes, outreach, calls) - fed by the QuickNote
  // morph surface and the agent's log_outreach/add_activity tools.
  const activities = await prisma.activity.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const provenance = await getProvenanceMap("contact", id, user.id);

  // Teams: a PERSONAL contact can be shared into any team the viewer belongs
  // to. In team context user.id is the workspace row, which has no memberships,
  // so this is naturally empty and the button never renders there.
  const teams =
    user.accountType === "user" ? await listUserWorkspaces(user.id) : [];

  // One relationship, one thread: email and social messages merged by time.
  const SOCIAL_LABELS: Record<string, string> = {
    LINKEDIN: "LinkedIn",
    X: "X",
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook",
    OTHER: "Social",
  };
  const conversations = [
    ...emails.map((m) => ({
      id: `email-${m.id}`,
      channelLabel: "Email",
      direction: m.direction as string,
      subject: m.subject,
      body: m.body,
      threadRef: null as string | null,
      savedAsContext: m.savedAsContext,
      at: m.sentAt ?? m.createdAt,
    })),
    ...socialMessages.map((m) => ({
      id: `social-${m.id}`,
      channelLabel: SOCIAL_LABELS[m.channel] ?? "Social",
      direction: m.direction as string,
      subject: null as string | null,
      body: m.body,
      threadRef: m.threadRef,
      savedAsContext: m.savedAsContext,
      at: m.sentAt ?? m.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

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
    ...(["linkedin", "twitter", "instagram", "facebook"] as const).map((f) => {
      const labels = { linkedin: "LinkedIn", twitter: "X", instagram: "Instagram", facebook: "Facebook" };
      const v = contact[f];
      return {
        label: labels[f],
        value: v ? v.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null,
        href: v ? (v.startsWith("http") ? v : `https://${v}`) : undefined,
        provenanceField: f,
      };
    }),
    { label: "Location", value: contact.location },
  ];

  return (
    <div className="space-y-4">
      <FloatIn delay={0}>
        <Link
          href="/crm"
          className="inline-flex h-7 items-center gap-1 rounded-[4px] px-1.5 -ml-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
          Back to CRM
        </Link>
      </FloatIn>

      <FloatIn delay={0.03}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CrmAvatar src={contact.imageUrl} label={contact.name || contact.email} shape="circle" size={40} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-foreground">
                  {contact.name || contact.email || "Unnamed contact"}
                </h1>
                <Badge variant={statusBadgeVariant(contact.status)}>
                  {statusLabel(contact.status)}
                </Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {contact.entity && (
                  <Link
                    href={`/crm/entity/${contact.entity.id}`}
                    className="inline-flex h-5 items-center rounded-[4px] bg-muted px-1.5 text-foreground hover:bg-muted/80"
                  >
                    {contact.entity.name}
                  </Link>
                )}
                {contact.source && <span>Source: {contact.source}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ContactActions contactId={contact.id} currentStatus={contact.status} />
            <ShareToTeam
              contactId={contact.id}
              teams={teams.map((t) => ({ workspaceId: t.workspaceId, name: t.name }))}
            />
          </div>
        </div>
      </FloatIn>

      {/* Visible Trust: one headline rolling up all field provenance. */}
      {Object.keys(provenance).length > 0 && (
        <FloatIn delay={0.05}>
          <VerifiedStrip provenance={provenance} />
        </FloatIn>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Details */}
        <FloatIn delay={0.06} className="lg:col-span-1 space-y-4">
          <EnrichmentStatusCard
            tier={contactTier(contact)}
            action={<ContactEnrichAll contactId={contact.id} missing={missing} />}
          />
          <Panel title="Details">
            <div className="space-y-0.5">
              {fields.map((f) => (
                <FieldWithProvenance
                  key={f.label}
                  label={f.label}
                  value={f.value}
                  href={f.href}
                  meta={f.provenanceField ? provenance[f.provenanceField] : undefined}
                />
              ))}
            </div>
            {fields.every((f) => !f.value && !f.provenanceField) && (
              <p className="text-sm text-muted-foreground">
                No details yet. Enrich this contact to fill them in.
              </p>
            )}
            <div className="mt-3 space-y-3">
              <ContactEnrich contactId={contact.id} missing={missing} />
              <SocialsEditor
                contactId={contact.id}
                current={{
                  linkedin: contact.linkedin,
                  twitter: contact.twitter,
                  instagram: contact.instagram,
                  facebook: contact.facebook,
                }}
              />
              {!contact.entity && <MatchEntity contactId={contact.id} />}
              {contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {contact.notes && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{contact.notes}</p>
                </div>
              )}
            </div>
          </Panel>
        </FloatIn>

        {/* Email - AgentMail threads + saved context */}
        <FloatIn delay={0.08} className="lg:col-span-2 space-y-4">
          <ContactAgentMail contactId={contact.id} />
          <ContactAgentPhone contactId={contact.id} />

          {/* Activity trail + QuickNote morph surface */}
          <Panel title="Activity">
            <QuickNote contactId={contact.id} />
            {activities.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No activity yet. Notes you or your agent log will show up here.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-border rounded-[8px] border border-border">
                {activities.map((a) => (
                  <div key={a.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {a.kind}
                        {a.channel ? ` · ${a.channel}` : ""}
                        {a.actorLabel ? ` · ${a.actorLabel}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
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
          </Panel>

          <Panel title="Conversations">
            <LogSocialMessage contactId={contact.id} />
            {conversations.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No conversations yet"
                description="Email threads (via AgentMail) and social messages your agent or you log will appear here as one history, labeled by channel."
              />
            ) : (
              <div className="mt-3 divide-y divide-border rounded-[8px] border border-border">
                {conversations.map((m) => (
                  <div key={m.id} className="px-3 py-2.5">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary">{m.channelLabel}</Badge>
                        <Badge
                          variant={
                            m.direction === "OUTBOUND" ? "primary" : "secondary"
                          }
                        >
                          {m.direction === "OUTBOUND" ? "Sent" : "Received"}
                        </Badge>
                        {m.savedAsContext && (
                          <Badge variant="success">Saved as context</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {new Date(m.at).toLocaleString()}
                      </span>
                    </div>
                    {m.subject && (
                      <p className="text-sm font-medium text-foreground">{m.subject}</p>
                    )}
                    {m.body && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {m.body}
                      </p>
                    )}
                    {m.threadRef && (
                      <a
                        href={m.threadRef.startsWith("https://") ? m.threadRef : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                      >
                        {m.threadRef.startsWith("https://") ? "Open thread" : m.threadRef}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </FloatIn>
      </div>
    </div>
  );
}

// Twenty show-page panel: hairline border, 40px header row, padded body.
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[8px] border border-border bg-background">
      <header className="flex h-10 items-center border-b border-border px-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
