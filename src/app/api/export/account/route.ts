// Full account export. The product promises your data is "exportable any time,
// never resold" - and until now that meant two flat CSVs (contacts, entities)
// that dropped everything the platform added: synced mail, meetings, evidence
// facts, custom fields, deals and their money, social context, suppressions.
// This returns ONE complete JSON archive of everything a tenant owns, so the
// ownership claim is true in full. Read-only, userId-scoped, rate-limited.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Generous per-relation caps: an export is a snapshot a human downloads, not a
// firehose. A tenant past these caps is a signal to offer a streamed export,
// not a reason to silently truncate - so the payload states what it included.
const CAP = 5000;

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`export-account:${user.id}`, 3, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const [
      contacts,
      entities,
      pipelines,
      segments,
      fieldDefinitions,
      fieldValues,
      recordFacts,
      emailThreads,
      emailMessages,
      calendarEvents,
      socialProfiles,
      socialPosts,
      activities,
      suppressedContacts,
      suppressedDomains,
      connectedAccounts,
    ] = await Promise.all([
      prisma.contact.findMany({ where: { userId: user.id }, take: CAP, orderBy: { createdAt: "asc" } }),
      prisma.entity.findMany({ where: { userId: user.id }, take: CAP, orderBy: { createdAt: "asc" } }),
      prisma.pipeline.findMany({ where: { userId: user.id }, include: { entries: true }, take: CAP }),
      prisma.segment.findMany({ where: { userId: user.id }, take: CAP }),
      prisma.fieldDefinition.findMany({ where: { userId: user.id }, include: { options: true }, take: CAP }),
      prisma.fieldValue.findMany({ where: { userId: user.id }, take: CAP }),
      prisma.recordFact.findMany({ where: { userId: user.id }, take: CAP, orderBy: { observedAt: "desc" } }),
      prisma.emailThread.findMany({ where: { userId: user.id }, take: CAP }),
      prisma.emailMessage.findMany({ where: { userId: user.id }, take: CAP, orderBy: { sentAt: "desc" } }),
      prisma.calendarEvent.findMany({ where: { userId: user.id }, include: { attendees: true }, take: CAP }),
      prisma.socialProfile.findMany({ where: { userId: user.id }, take: CAP }),
      prisma.socialPost.findMany({ where: { userId: user.id }, take: CAP }),
      prisma.activity.findMany({ where: { userId: user.id }, take: CAP, orderBy: { createdAt: "desc" } }),
      prisma.suppressedContact.findMany({ where: { userId: user.id }, take: CAP }),
      prisma.suppressedDomain.findMany({ where: { userId: user.id }, take: CAP }),
      // Connections: metadata only. No OAuth token is ever stored by us or
      // exported - Composio holds those - so this is safe to include verbatim.
      prisma.connectedAccount.findMany({
        where: { userId: user.id },
        select: { provider: true, status: true, accountEmail: true, scopes: true, connectedAt: true },
        take: CAP,
      }),
    ]);

    const archive = {
      exportedAt: new Date().toISOString(),
      account: { email: user.email, plan: user.plan, reportingCurrency: user.reportingCurrency },
      note: `Your data, owned by you and never resold. Each collection is capped at ${CAP} rows; contact support for a full streamed export if you are past that.`,
      contacts,
      entities,
      pipelines,
      segments,
      customFields: { definitions: fieldDefinitions, values: fieldValues },
      facts: recordFacts,
      email: { threads: emailThreads, messages: emailMessages },
      calendar: calendarEvents,
      social: { profiles: socialProfiles, posts: socialPosts },
      activities,
      suppressions: { contacts: suppressedContacts, domains: suppressedDomains },
      connectedAccounts,
    };

    const filename = `scalar-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(archive, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("[export/account]", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
