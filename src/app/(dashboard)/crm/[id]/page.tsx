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

  const fields: { label: string; value: string | null }[] = [
    { label: "Title", value: contact.title },
    { label: "Company", value: contact.company },
    { label: "Email", value: contact.email },
    { label: "Phone", value: contact.phone },
    { label: "Website", value: contact.website },
    { label: "LinkedIn", value: contact.linkedin },
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
          <ContactActions contactId={contact.id} currentStatus={contact.status} />
        </div>
      </FloatIn>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <FloatIn delay={0.1} className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields
                .filter((f) => f.value)
                .map((f) => (
                  <div key={f.label} className="text-sm">
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="break-words">{f.value}</p>
                  </div>
                ))}
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
        </FloatIn>

        {/* Email thread store */}
        <FloatIn delay={0.14} className="lg:col-span-2">
          <Card>
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
