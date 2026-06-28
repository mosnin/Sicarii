export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  businessToCompany,
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
import {
  exaIntentSearch,
  exaDeepSearch,
  exaFindCompanies,
  isExaConfigured,
  type FoundCompany,
} from "@/lib/exa";
import { linkupSearch, linkupDeepResearch, isLinkupConfigured } from "@/lib/linkup";
import { googleMapsLeads, scrapeSiteContacts, apifyGoogleSearch, isApifyConfigured } from "@/lib/apify";
import { refineToCompanies, isRefinerConfigured } from "@/lib/result-refiner";
import { analyzeSite, isFirecrawlConfigured } from "@/lib/firecrawl";

function notConfigured(provider: string) {
  return NextResponse.json(
    { error: `${provider} is not configured on this deployment.` },
    { status: 501 }
  );
}

function host(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    return new URL(input.startsWith("http") ? input : `https://${input}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

type CompanyLike = Partial<FoundCompany> & { companyName: string };

// Turn a set of companies into an addable, deduplicated, CRM-aware list.
// Each item is marked __kind:"company" so the client renders the prospect grid.
async function companyListResult(userId: string, companies: CompanyLike[]) {
  const seen = new Set<string>();
  const deduped = companies.filter((c) => {
    const key = (c.domain ?? host(c.website) ?? c.companyName)?.toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const domains = deduped
    .map((c) => c.domain ?? host(c.website))
    .filter((d): d is string => Boolean(d));
  const existing = domains.length
    ? await prisma.entity.findMany({
        where: { userId, domain: { in: domains } },
        select: { id: true, domain: true },
      })
    : [];
  const byDomain = new Map(existing.map((e) => [e.domain, e.id]));

  return {
    companies: deduped.map((c) => {
      const domain = c.domain ?? host(c.website);
      return {
        __kind: "company" as const,
        companyName: c.companyName,
        domain,
        website: c.website,
        phone: c.phone,
        industry: c.industry,
        address: c.address,
        description: c.description,
        keyDecisionMakers: c.keyDecisionMakers,
        sourceUrl: c.sourceUrl,
        inCrm: domain ? byDomain.has(domain) : false,
        existingId: domain ? byDomain.get(domain) ?? null : null,
      };
    }),
  };
}

// True when a provider returned nothing usable.
function isEmptyData(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") {
    const inner = (data as { data?: unknown }).data;
    if (Array.isArray(inner)) return inner.length === 0;
    return Object.keys(data as object).length === 0;
  }
  return false;
}

// Refine noisy results into a company list via the model; on ANY failure
// (model unavailable, bad output) fall back to the raw results so the tool never
// hard-fails. Returns either a {companies} envelope or the raw payload.
async function refineOrRaw(userId: string, query: string, raw: unknown): Promise<unknown> {
  if (!isRefinerConfigured()) return raw;
  try {
    const refined = await refineToCompanies(query, raw);
    if (refined.length === 0) return raw;
    return companyListResult(
      userId,
      refined.map((c) => ({
        companyName: c.name,
        website: c.website ?? undefined,
        domain: c.domain ?? undefined,
        industry: c.industry ?? undefined,
        address: c.location ?? undefined,
        phone: c.phone ?? undefined,
        description: c.description ?? undefined,
      }))
    );
  } catch (e) {
    console.error("[discover] refiner failed, returning raw results", e);
    return raw;
  }
}

// Wrap an enrichment payload with the subject domain so the client can match it
// to an existing entity (or create one) and attach the data - instead of saving
// the raw blob as a junk record. Returns a 404 NextResponse when there's no data
// (so the UI never shows/saves "null").
function enrichmentResult(domain: string, label: string, data: unknown) {
  if (isEmptyData(data)) {
    throw NextResponse.json(
      { error: `No ${label.toLowerCase()} found for ${domain}.` },
      { status: 404 }
    );
  }
  return { __subject: { domain, label }, __data: data };
}

// POST /api/discover - run a discovery tool and return shaped results.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = await checkRateLimit(`discover:${user.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests - slow down a moment." }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as {
      tool?: string;
      query?: string;
      country?: string;
      location?: string;
      url?: string;
      urls?: string[];
      domain?: string;
      companyName?: string;
      industry?: string;
      size?: string;
      firstName?: string;
      lastName?: string;
      jobTitle?: string;
      department?: string;
      level?: string;
      limit?: number;
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
      // Raw web/SERP results are noisy; when the refiner is configured we pass
      // them through gpt-5-mini to extract real companies (dropping aggregators
      // like Yelp) and return an addable prospect list. Otherwise: raw links.

      case "web-search": {
        if (!isTavilyConfigured()) return notConfigured("Tavily");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter a search query." }, { status: 400 });
        const raw = await tavilySearch(q, { maxResults: body.numResults ?? 15 });
        result = await refineOrRaw(user.id, q, raw);
        break;
      }

      case "google-serp": {
        if (!isBrightDataConfigured()) return notConfigured("Bright Data");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter a search query." }, { status: 400 });
        const raw = await googleSerp(q, body.country ?? "us");
        result = await refineOrRaw(user.id, q, raw);
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

      case "analyze-site": {
        if (!isFirecrawlConfigured()) return notConfigured("Firecrawl");
        const url = body.url?.trim();
        if (!url) return NextResponse.json({ error: "Enter a company website URL." }, { status: 400 });
        const a = await analyzeSite(url);
        const site = url.startsWith("http") ? url : `https://${url}`;
        const company = host(site);
        // Return the people found as addable contacts.
        result = a.contacts
          .filter((c) => c.name && c.name.trim().length > 1)
          .map((c) => ({
            name: c.name,
            title: c.title,
            email: c.email,
            linkedin: c.linkedin,
            imageUrl: c.photo,
            company,
            website: site,
          }));
        break;
      }

      // ── APIFY ACTORS ──────────────────────────────────────────────────────
      // One token (APIFY_TOKEN) runs a curated set of trusted public Actors.

      case "maps-leads": {
        if (!isApifyConfigured()) return notConfigured("Apify");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter what to search for (e.g. dentists)." }, { status: 400 });
        const leads = await googleMapsLeads(q, {
          location: body.location?.trim(),
          limit: Math.min(body.limit ?? body.numResults ?? 12, 20),
        });
        result = await companyListResult(user.id, leads.map((l) => ({ ...l, companyName: l.companyName })));
        break;
      }

      case "contact-info": {
        if (!isApifyConfigured()) return notConfigured("Apify");
        const url = body.url?.trim();
        if (!url) return NextResponse.json({ error: "Enter a company website URL." }, { status: 400 });
        const contacts = await scrapeSiteContacts(url);
        if (contacts.length === 0) {
          return NextResponse.json({ error: `No contact details found on ${url}.` }, { status: 404 });
        }
        result = contacts;
        break;
      }

      case "apify-serp": {
        if (!isApifyConfigured()) return notConfigured("Apify");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Enter a search query." }, { status: 400 });
        const raw = await apifyGoogleSearch(q, body.numResults ?? 15);
        result = await refineOrRaw(user.id, q, raw);
        break;
      }

      // ── COMPANY INTELLIGENCE ──────────────────────────────────────────────

      case "search-companies": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const rows = await searchCompanies({
          country: body.country,
          industry: body.industry,
          size: body.size,
          limit: Math.min(body.limit ?? 20, 50),
        });
        result = await companyListResult(
          user.id,
          (rows as Record<string, unknown>[]).map(businessToCompany)
        );
        break;
      }

      // Enrichment tools - return a subject envelope so the client attaches the
      // data to a matching entity (match-or-create by domain) rather than
      // creating a junk record from the raw blob.
      case "enrich-domain": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = host(body.domain) ?? body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = enrichmentResult(domain, "Firmographics", await getCompanyProfile(domain));
        break;
      }

      case "company-overview": {
        if (!isPipe0Configured()) return notConfigured("Pipe0");
        const domain = host(body.domain) ?? body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = enrichmentResult(domain, "Overview", await getCompanyOverview(domain));
        break;
      }

      case "company-funding": {
        const domain = host(body.domain) ?? body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        let data: unknown;
        if (isExploriumConfigured()) data = await getCompanyFunding(domain);
        else if (isPipe0Configured()) data = await getCompanyFundingPipe0(domain);
        else return notConfigured("Explorium or Pipe0");
        result = enrichmentResult(domain, "Funding & acquisition", data);
        break;
      }

      case "tech-stack": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = host(body.domain) ?? body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = enrichmentResult(domain, "Tech stack", await getCompanyTechStack(domain));
        break;
      }

      case "website-traffic": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = host(body.domain) ?? body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = enrichmentResult(domain, "Website traffic", await getCompanyTraffic(domain));
        break;
      }

      case "company-news": {
        if (!isPipe0Configured()) return notConfigured("Pipe0");
        const domain = host(body.domain) ?? body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        result = enrichmentResult(domain, "Recent news", await getCompanyNews(domain, body.companyName?.trim()));
        break;
      }

      case "company-lookalikes": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = host(body.domain) ?? body.domain?.trim();
        if (!domain) return NextResponse.json({ error: "Enter a company domain." }, { status: 400 });
        const raw = await getCompanyLookalikes(domain);
        // Explorium wraps lookalikes in {data:[...]} (or nested) - surface the array.
        const rows = Array.isArray(raw)
          ? raw
          : ((raw as { data?: unknown[] } | null)?.data ?? []);
        result = await companyListResult(
          user.id,
          (rows as Record<string, unknown>[]).filter((r) => r && typeof r === "object").map(businessToCompany)
        );
        break;
      }

      // ── PEOPLE & CONTACTS ─────────────────────────────────────────────────

      case "find-people": {
        if (!isExploriumConfigured()) return notConfigured("Explorium");
        const domain = host(body.domain) ?? body.domain?.trim();
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
        const domain = host(body.domain) ?? body.domain?.trim();
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
        const domain = host(body.domain) ?? body.domain?.trim();
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
        const signals = deep
          ? await exaDeepSearch(q, body.numResults ?? 8)
          : await exaIntentSearch(q, {
              numResults: body.numResults ?? 10,
              category: body.category as import("@/lib/exa").ExaCategory | undefined,
              includeHighlights: true,
              includeSummary: true,
            });
        // Refine raw intent signals into addable companies; fall back to signals.
        result = await refineOrRaw(user.id, `Companies showing buying intent for: ${q}`, signals);
        break;
      }

      // ── ENTITY PROSPECTING ────────────────────────────────────────────────

      case "find-entities": {
        if (!isExaConfigured()) return notConfigured("Exa");
        const q = body.query?.trim();
        if (!q) return NextResponse.json({ error: "Describe the companies you want to find." }, { status: 400 });
        const count = Math.min(Math.max(Number(body.numResults ?? body.limit ?? 10) || 10, 1), 50);
        const companies = await exaFindCompanies(q, count);
        result = await companyListResult(user.id, companies);
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
