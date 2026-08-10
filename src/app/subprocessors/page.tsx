import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Subprocessors | Scalar",
  description: "The third-party services Scalar uses to run the product.",
};

export default function SubprocessorsPage() {
  return (
    <LegalDoc
      title="Subprocessors"
      updated="June 9, 2026"
      intro={
        <>
          To run Scalar we rely on a focused set of trusted providers. Each
          processes data only to deliver part of the service and is bound to
          protect it. We list them here in the open so you always know who
          touches your data. This page is referenced by our Data Processing
          Addendum.
        </>
      }
      sections={[
        {
          heading: "Infrastructure",
          bullets: [
            "Vercel: application hosting and serverless compute.",
            "Supabase: managed Postgres database and vector memory (pgvector) where your CRM is stored.",
            "Upstash: rate limiting and ephemeral queues.",
            "Inngest: scheduled and background jobs (intent monitors and research runs).",
            "Uploadthing: file uploads.",
          ],
        },
        {
          heading: "Identity and payments",
          bullets: [
            "Clerk: authentication and account management.",
            "Stripe: subscription billing and payment processing.",
          ],
        },
        {
          heading: "Communication, sync, and voice",
          body: [
            "These carry your own conversations, so they process the most sensitive data we touch. They run only for the accounts that connect them, and only on your own mailbox, calendar, and calls.",
          ],
          bullets: [
            "Composio: connects your Gmail and Google Calendar and delivers new messages and events to Scalar, and sends the emails you or your agent send. It processes the contents of the mailbox and calendar you connect.",
            "AgentMail: legacy per-user email threading (being replaced by the Composio path above).",
            "LiveKit: in-house voice calling. When you buy a number and place or receive calls, LiveKit carries the call audio and produces the recording and transcript. Active only if you enable voice.",
            "Telnyx / Twilio: telephone carriers for the phone numbers you buy, when a carrier number is used instead of a LiveKit-native one. They connect the call over the public phone network.",
          ],
        },
        {
          heading: "Intelligence and data providers",
          body: [
            "These power discovery, enrichment, and research. Scalar orchestrates them, applies its accuracy rule, and writes only verified results into your CRM. We orchestrate providers; we do not sell data. Each runs only when a matching key is configured.",
          ],
          bullets: [
            "Exa: prospecting and intent discovery.",
            "Explorium: company firmographics and people data.",
            "Pipe0: contact enrichment (work email and phone).",
            "Bright Data: web search and structured extraction.",
            "Tavily: web search and crawl.",
            "Linkup: sourced deep research.",
            "Firecrawl: deep company-site crawling for contacts.",
            "Apify: Google Maps and Google search results for local prospecting.",
            "Anymailfinder and Findymail: resale-safe work-email finding.",
            "Bouncer: email deliverability verification.",
            "SocQ: deep social-media context and community monitoring. Built but dormant; active only if enabled.",
            "Public registries (Companies House, GLEIF, SEC EDGAR): authoritative company lookups from public filings.",
            "OpenAI: the model behind the built-in agent and the small model that refines noisy results.",
          ],
        },
        {
          heading: "Changes to this list",
          body: [
            "We update this page when we add or remove a subprocessor. If you have a data processing agreement with us that requires advance notice of changes, we will provide it as agreed.",
          ],
        },
      ]}
      related={[
        { label: "Data Processing Addendum", href: "/dpa" },
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Security", href: "/security" },
      ]}
    />
  );
}
