import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Globe,
  Linkedin,
  MapPin,
  Briefcase,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { statusBadgeVariant, statusLabel } from "@/lib/contact-status";
import { ContactActions } from "./actions";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) notFound();

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact || contact.userId !== user.id) notFound();

  const emails = await prisma.contactEmail.findMany({
    where: { contactId: id },
    orderBy: { sentAt: "desc" },
  });

  const fields: { icon: typeof Mail; label: string; value: string | null }[] = [
    { icon: Briefcase, label: "Title", value: contact.title },
    { icon: Building2, label: "Company", value: contact.company },
    { icon: Mail, label: "Email", value: contact.email },
    { icon: Phone, label: "Phone", value: contact.phone },
    { icon: Globe, label: "Website", value: contact.website },
    { icon: Linkedin, label: "LinkedIn", value: contact.linkedin },
    { icon: MapPin, label: "Location", value: contact.location },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/crm"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to CRM
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">
              {contact.name || contact.email || "Unnamed contact"}
            </h1>
            <Badge variant={statusBadgeVariant(contact.status)}>
              {statusLabel(contact.status)}
            </Badge>
          </div>
          {contact.source && (
            <p className="mt-1 text-sm text-muted-foreground">
              Source: {contact.source}
            </p>
          )}
        </div>
        <ContactActions contactId={contact.id} currentStatus={contact.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <Card className="lg:col-span-1">
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
            {fields.every((f) => !f.value) && (
              <p className="text-sm text-muted-foreground">
                No details yet — enrich this contact to fill them in.
              </p>
            )}
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

        {/* Email thread store */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Conversation</CardTitle>
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
                    className="rounded-lg border border-border p-4"
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
      </div>
    </div>
  );
}
