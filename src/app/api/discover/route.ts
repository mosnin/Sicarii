import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { tavilySearch, tavilyExtract, tavilyCrawl, isTavilyConfigured } from "@/lib/tavily";
import { googleSerp, scrapeUrl, isBrightDataConfigured } from "@/lib/brightdata";
import {
  searchCompanies,
  getCompanyProfile,
  getCompanyFunding,
  getCompanyTechStack,
  getCompanyLookalikes,
  getCompanyTraffic,
  getPeopleAtCompany,
  isExploriumConfigured,
} from "@/lib/explorium";
import {
  findWorkEmail,
  findMobile,
  getCompanyNews,
  getCompanyOverview,
  getCompanyFundingPipe0,
  isPipe0Configured,
} from "@/lib/pipe0";
import { exaIntentSearch, exaDeepSearch, isExaConfigured } from "@/lib/exa";
import { linkupSearch, linkupDeepResearch, isLinkupConfigured } from "@/lib/linkup";

function notConfigured(provider: string) {
  return NextResponse.json(
    { error: `${provider} is not configured on this deployment.` },
    { status: 501 }
  );
}

// POST /api/discover — run a discovery tool and return raw results.
// The client normalizes and lets the user save records into the CRM.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = checkRateLimit(`discover:${user.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests — slow down a moment." }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as {
      tool?: string;
      // web
      query?: string;
      country?: string;
      url?: string;
      urls?: string[];
      // company
      domain?: string;
      companyName?: string;
      industry?: string;
      size?: string;
      // people
      firstName?: string;
      lastName?: string;
      jobTitle?: string;
      department?: string;
      level?: string;
      limit?: number;
      // intent / research
      category?: string;
      numResults?: number;
      deep?: boolean;
    } | null;

    if (!body?.tool) {
      return NextResponse.json({ error: "Missing tool." }, { status: 400 });
    }

    let result: unknown;

    switch (body.tool) {
      // ── WEB INTELLIGENCE ──────────────────────────────────────────────────

      case "web-search": {
        if (!isTavilyConfigured()) return notConfigured("Tavily");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter a search query." }, { status: 400 });
        result = await tavilySearch(q, { maxResults: body.numResults ?? 10 });
        break;
      }

      case "google-serp": {
        if (!isBrightDataConfigured()) return notConfigured("Bright Data");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter a search query." }, { status: 400 });
        result = await googleSerp(q, body.country ?? "us");
        break;
      }

      case "scrape-url": {
        if (!isBrightDataConfigured()) return notConfigured("Bright Data");
        const url = body.url?.trim();
        if (!url) return NextResponse.json({ error: "Enter a URL to scrape." }, { status: 400 });
        result = { markdown: await scrapeUrl(url) };
        break;
      }

      case "crawl-site": {
        if (!isTavilyConfigured()) return notConfigured("Tavily");
        const url = body.url?.trim();
        if (!url) return NextResponse.json({ error: "Enter a URL to crawl." }, { status: 400 });
        result = await tavilyCrawl(url);
        break;
      }

      case "extract-url": {
        if (!isTavilyConfigured()) return notConfigured("Tavily");
        const url = body.url?.trim();
        if (!url) return NextResponse.json({ error: "Enter a URL to extract." }, { status: 400 });
        result = await tavilyExtract([url]);
        break;
      }

      // ── COMPANY INTELLIGENCE ──────────────────────────────────────────────

      case "search-companies": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        result = await searchCompanies({
          country: body.country,
          industry: body.industry,
          size: body.size,
          limit: Math.min(body.limit ?? 20, 50),
        });
        break;
      }

      case "enrich-domain": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await getCompanyProfile(domain);
        break;
      }

      case "company-overview": {
        if (!isPipe0Configured()) return notConfigured("Pipe0");
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await getCompanyOverview(domain);
        break;
      }

      case "company-funding": {
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        if (isExploriumConfigured()) {
          result = await getCompanyFunding(domain);
        } else if (isPipe0Configured()) {
          result = await getCompanyFundingPipe0(domain);
        } else {
          return notConfigured("Explorium or Pipe0");
        }
        break;
      }

      case "tech-stack": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await getCompanyTechStack(domain);
        break;
      }

      case "company-news": {
        if (!isPipe0Configured()) return notConfigured("Pipe0");
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await getCompanyNews(domain, body.companyName?.trim());
        break;
      }

      case "company-lookalikes": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await getCompanyLookalikes(domain);
        break;
      }

      case "website-traffic": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await getCompanyTraffic(domain);
        break;
      }

      // ── PEOPLE & CONTACTS ─────────────────────────────────────────────────

      case "find-people": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = await getPeopleAtCompany(domain, {
          jobTitle: body.jobTitle?.trim(),
          department: body.department?.trim(),
          level: body.level?.trim(),
          hasEmail: true,
          limit: Math.min(body.limit ?? 20, 50),
        });
        break;
      }

      case "find-email": {
        if (!isPipe0Configured()) return notConfigured("Pipe0");
        const firstName = body.firstName?.trim();
        const lastName = body.lastName?.trim();
        const domain = body.domain?.trim();
        if (!firstName || !lastName || !domain) {
          return NextResponse.json({ error: "Enter first name, last name, and company domain." }, { status: 400 });
        }
        result = await findWorkEmail(firstName, lastName, domain, body.companyName?.trim());
        break;
      }

      case "find-mobile": {
        if (!isPipe0Configured()) return notConfigured("Pipe0");
        const firstName = body.firstName?.trim();
        const lastName = body.lastName?.trim();
        const domain = body.domain?.trim();
        if (!firstName || !lastName || !domain) {
          return NextResponse.json({ error: "Enter first name, last name, and company domain." }, { status: 400 });
        }
        result = await findMobile(firstName, lastName, domain, body.companyName?.trim());
        break;
      }

      // ── INTENT INTELLIGENCE ───────────────────────────────────────────────

      case "intent-scan": {
        if (!isExaConfigured()) return notConfigured("Exa");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Describe the product or service you offer." }, { status: 400 });
        const deep = body.deep ?? false;
        result = deep
          ? await exaDeepSearch(q, body.numResults ?? 8)
          : await exaIntentSearch(q, {
              numResults: body.numResults ?? 10,
              category: body.category as import("@/lib/exa").ExaCategory | undefined,
              includeHighlights: true,
              includeSummary: true,
            });
        break;
      }

      // ── DEEP RESEARCH ─────────────────────────────────────────────────────

      case "deep-research": {
        if (!isLinkupConfigured()) return notConfigured("Linkup");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter a research query." }, { status: 400 });
        result = await linkupDeepResearch(q);
        break;
      }

      case "quick-research": {
        if (!isLinkupConfigured()) return notConfigured("Linkup");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter a research query." }, { status: 400 });
        result = await linkupSearch(q);
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown tool: ${body.tool}` }, { status: 400 });
    }

    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/discover", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
