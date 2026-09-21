import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { MailboxesManager } from "@/components/dashboard/mail/mailboxes-manager";

export const dynamic = "force-dynamic";

// Agent mailboxes: the sending domains and inboxes Scalar's agents send cold
// mail from, their warmup state, and the unified inbox of what came back.
// Data loads client-side from /api/mail/status so the same page works for
// the Stripe return (?order=success) and stays live while fulfilment runs.
export default async function MailboxesPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const sp = await searchParams;
  const notice = sp.order === "success" ? "success" : sp.order === "cancelled" ? "cancelled" : null;

  return (
    <div className="space-y-8">
      <FloatIn>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-6 py-9 sm:px-10 sm:py-12">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">Scalar // Mailboxes</p>
            <h1 className="font-brand mt-2 text-3xl text-foreground sm:text-4xl">Agent mailboxes</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Real inboxes your agents send from and reply through. Buy lookalike domains and inboxes here, or bring your own; Scalar warms every mailbox before its first cold send, keeps it under a safe daily cap, watches bounces and complaints, and wakes your agent the moment a human writes back.
            </p>
          </div>
        </div>
      </FloatIn>

      <MailboxesManager initialNotice={notice} />
    </div>
  );
}
