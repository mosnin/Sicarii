// AI refinement layer. Raw web/SERP results are noisy - full of directories,
// listicles, and review aggregators (Yelp, US News, Clutch, …). We pass them
// through a small fast model to extract the real, individual companies that
// match the search intent, deduplicated and CRM-ready.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const REFINER_MODEL = process.env.OPENAI_REFINER_MODEL ?? "gpt-5-mini";

export function isRefinerConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// OpenAI strict structured outputs reject optional() - use nullable().
const refinedCompany = z.object({
  name: z.string().describe("Official company name"),
  website: z.string().nullable().describe("The company's own official website URL"),
  domain: z.string().nullable().describe("Bare domain, e.g. acme.com"),
  industry: z.string().nullable(),
  location: z.string().nullable().describe("City, state, or full address if known"),
  phone: z.string().nullable(),
  description: z.string().nullable().describe("One sentence on what they do"),
});

const refinedSchema = z.object({
  companies: z.array(refinedCompany),
});

export type RefinedCompany = z.infer<typeof refinedCompany>;

export async function refineToCompanies(
  query: string,
  raw: unknown,
  limit = 25
): Promise<RefinedCompany[]> {
  const { object } = await generateObject({
    model: openai(REFINER_MODEL),
    schema: refinedSchema,
    prompt: `A user is prospecting for leads in their CRM. Their search was:
"${query}"

Below are raw web search results as JSON. Extract ONLY real, individual companies or businesses that genuinely match the search intent.

Rules:
- EXCLUDE directories, aggregators, listicles, marketplaces, review sites, job boards, news articles, and encyclopedic pages (e.g. Yelp, Yellow Pages, US News, Clutch, G2, Capterra, Crunchbase list pages, Wikipedia, Reddit, LinkedIn search pages, "top 10 …" articles).
- Each entry must be a single distinct company. DEDUPLICATE companies that appear more than once (same company, different URL).
- Use the company's own official website for website/domain - never the aggregator's.
- Fill industry, location, phone, and a one-line description only when supported by the text; otherwise leave blank.
- Return at most ${limit} companies. If nothing qualifies, return an empty list.

Raw results JSON:
${JSON.stringify(raw).slice(0, 14000)}`,
  });

  return object.companies.slice(0, limit);
}
