import type { Metadata } from "next";
import { LegalDoc, L } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Privacy Policy | Scalar",
  description: "How Scalar collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="June 9, 2026"
      intro={
        <>
          This Privacy Policy explains what data Scalar collects, how we use it,
          and the choices you have. Scalar is the CRM your agents run, and the
          principle behind this policy is the same one behind the product: your
          data is a single source of truth you control. Enrichment flows in;
          your data does not leak out. We do not sell it, and we do not use it
          to train models for anyone else.
        </>
      }
      sections={[
        {
          heading: "Who we are",
          body: [
            "Scalar provides the CRM and intelligence service described at tryscalar.xyz. For personal data you store about your own contacts and companies, you are the data controller and we act as your processor; the terms of that relationship are set out in our Data Processing Addendum. For account and billing data we collect about you directly, we are the controller.",
          ],
        },
        {
          heading: "Data we collect",
          bullets: [
            "Account data: your name, email, and authentication identifiers, handled by Clerk.",
            "Billing data: your plan, credit usage, and payment records, handled by our payment processor, Stripe. We do not store full card numbers.",
            "Customer Data: the companies, contacts, deals, emails, notes, and agent memory you create or enrich inside Scalar.",
            "Usage data: logs, device and browser information, and product analytics used to keep the service reliable and secure.",
            "Cookies: a small set of cookies needed to sign you in and run the app, described in our Cookie Policy.",
          ],
        },
        {
          heading: "How we use your data",
          bullets: [
            "To provide the service: store your CRM, run discovery and enrichment, operate the agent and MCP surface, and sync email.",
            "To bill you: meter credit usage and process payments through Stripe.",
            "To secure the service: detect abuse, enforce rate limits, and protect accounts.",
            "To support you: respond to requests and send essential service notices.",
            "To improve Scalar: understand aggregate usage. We do not use your Customer Data to train models for other customers.",
          ],
        },
        {
          heading: "Enrichment and accuracy",
          body: [
            "When you run discovery or enrichment, Scalar queries third-party providers and writes verified results into your CRM. We apply a strict accuracy rule: data is saved only when it matches the correct person or company by name and company or domain. If we cannot verify a match, we return nothing rather than a wrong value, and you are not charged. This protects the people in your database as much as it protects your data quality.",
          ],
        },
        {
          heading: "How we share data",
          body: [
            "We share data only with the subprocessors that run Scalar (hosting, authentication, payments, email, background jobs, and the data providers that power enrichment), each listed on our Subprocessors page and bound to protect it. We may disclose data if required by law or to protect rights and safety. We do not sell personal data, and we do not share it for cross-context behavioral advertising.",
          ],
        },
        {
          heading: "Where data is stored",
          body: [
            "Your CRM is stored in our Postgres database on Supabase, with vector memory in pgvector, and the application runs on Vercel. File uploads are handled by Uploadthing. Data may be processed in the regions those providers operate. We rely on appropriate safeguards for any cross-border transfers.",
          ],
        },
        {
          heading: "Retention",
          body: [
            "We keep Customer Data for as long as your account is active. When you delete a record it is removed from your CRM; when you delete your account, we delete or anonymize your Customer Data within a reasonable period, except where we must retain limited records (for example, billing history) to meet legal obligations.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "Depending on where you live, you may have the right to access, correct, export, or delete your personal data, and to object to or restrict certain processing. You can export your CRM at any time from the app, and you can reach us to exercise any of these rights. We will not discriminate against you for exercising them.",
          ],
        },
        {
          heading: "Security",
          body: [
            "We protect data with encryption in transit, scoped per-user access so one account can never read another's records, ownership checks on every operation (UI, API, and agent), per-user API keys, and rate limiting. No system is perfectly secure, but security is built into how the service is constructed, not bolted on. More detail lives on our Security page.",
          ],
        },
        {
          heading: "Children",
          body: [
            "Scalar is not directed to children and is intended for users 18 and older. We do not knowingly collect personal data from children.",
          ],
        },
        {
          heading: "Changes and contact",
          body: [
            <>
              We will update this policy as the service and the law evolve, and
              we will change the date above when we do. For any privacy request
              or question, email{" "}
              <L href="mailto:hello@tryscalar.xyz">hello@tryscalar.xyz</L>.
            </>,
          ],
        },
      ]}
      related={[
        { label: "Cookie Policy", href: "/cookies" },
        { label: "Subprocessors", href: "/subprocessors" },
        { label: "Data Processing Addendum", href: "/dpa" },
        { label: "Security", href: "/security" },
      ]}
    />
  );
}
