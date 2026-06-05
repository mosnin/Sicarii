import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isSynthozConfigured,
  enrichCompany,
  convertCompanyNames,
  extractEmailsFromUrls,
  findEmailsFirstLast,
  SynthozQueuedError,
} from "@/lib/synthoz";

// POST /api/discover — run a discovery tool via Synthoz and return the raw result.
// The client renders the result and lets the user save records into the CRM via
// the existing /api/entities and /api/contacts endpoints.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = checkRateLimit(`discover:${user.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests — slow down a moment." }, { status: 429 });
    }

    if (!isSynthozConfigured()) {
      return NextResponse.json(
        { error: "Discovery isn't configured yet — add SYNTHOZ_API_KEY on the deployment." },
        { status: 501 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      tool?: string;
      domain?: string;
      companyName?: string;
      url?: string;
      firstName?: string;
      lastName?: string;
    } | null;

    if (!body?.tool) {
      return NextResponse.json({ error: "Missing tool." }, { status: 400 });
    }

    const ctx = { userId: user.id };
    let result: unknown;
    switch (body.tool) {
      case "enrich-domain": {
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await enrichCompany(domain, ctx);
        break;
      }
      case "company-leads": {
        const companyName = body.companyName?.trim();
        if (!companyName) return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
        result = await convertCompanyNames(companyName, ctx);
        break;
      }
      case "extract-urls": {
        const url = body.url?.trim();
        if (!url) return NextResponse.json({ error: "Enter a website URL." }, { status: 400 });
        result = await extractEmailsFromUrls(url, ctx);
        break;
      }
      case "find-email": {
        const firstName = body.firstName?.trim();
        const lastName = body.lastName?.trim();
        const domain = body.domain?.trim();
        if (!firstName || !lastName || !domain) {
          return NextResponse.json(
            { error: "Enter first name, last name, and company domain." },
            { status: 400 }
          );
        }
        result = await findEmailsFirstLast(firstName, lastName, domain, ctx);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown tool: ${body.tool}` }, { status: 400 });
    }

    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    // Async tool — Synthoz queued the request; result arrives via outgoing webhook.
    if (e instanceof SynthozQueuedError) {
      return NextResponse.json({ queued: true });
    }
    console.error("POST /api/discover", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
