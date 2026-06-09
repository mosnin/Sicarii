import type { Metadata } from "next";
import { LegalDoc, L } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Terms of Service | Scalar",
  description: "The agreement that governs your use of Scalar.",
};

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="June 9, 2026"
      intro={
        <>
          These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to
          and use of Scalar, the CRM your agents run: structured storage, a real
          UI, and built-in intelligence operated by you and the AI agents you
          connect. By creating an account or using the service, you agree to
          these Terms. If you are using Scalar on behalf of an organization, you
          agree on its behalf and confirm you have authority to do so.
        </>
      }
      sections={[
        {
          heading: "The service",
          body: [
            "Scalar is a software-as-a-service customer relationship management platform. It stores companies, contacts, deals, emails, and agent memory in a structured database, presents them in a web interface, and exposes them to AI agents over a secure MCP (Model Context Protocol) surface and per-user API keys. You can use the built-in agent or connect your own.",
            "We may add, change, or remove features over time. We will not make a material reduction to the core service for an active paid plan without notice.",
          ],
        },
        {
          heading: "Accounts",
          body: [
            "You need an account to use Scalar. Authentication is handled by Clerk. You are responsible for keeping your credentials and API keys secure and for all activity under your account, including actions taken by agents you connect. You must provide accurate information and be at least 18 years old (or the age of majority where you live).",
            "Notify us promptly at hello@tryscalar.xyz if you believe your account or an API key has been compromised.",
          ],
        },
        {
          heading: "Plans, credits, and billing",
          body: [
            "Scalar is priced as a seat plus usage credits, where one credit equals one cent (USD 0.01). Reading and writing your own CRM is free; credits are consumed only when an agent pulls real data from outside providers, such as discovery, enrichment, deep research, or scheduled monitors. Each operation's credit cost is shown in the product.",
            "Paid plans renew automatically and reset their credit allowance each billing period. Payments are processed by our payment provider, Creem.io; we do not store full card details. You authorize us and Creem.io to charge your payment method for the plan you select and any top-ups you purchase. You can cancel anytime from billing settings, and cancellation takes effect at the end of the current period.",
          ],
          bullets: [
            "A miss is never charged. If a lookup cannot verify a match, it returns nothing and costs no credits.",
            "Credits are a prepaid service entitlement, have no cash value, and do not roll over unless stated for your plan.",
            "Refunds and cancellation are covered in our Refund Policy.",
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            "You agree to use Scalar lawfully and in line with our Acceptable Use Policy, which is incorporated into these Terms. In short: no illegal data, no spam or unsolicited bulk email, no scraping or harassment, no attempts to break, overload, or reverse-engineer the service, and no use that violates the rights of the people whose data you store.",
          ],
        },
        {
          heading: "Your data and ours",
          body: [
            "You own the data you put into Scalar and the records produced for your account (your “Customer Data”). You grant us a limited license to host, process, and transmit Customer Data solely to operate the service for you. We do not sell your Customer Data and do not use it to train models for other customers. Our handling of personal data is described in the Privacy Policy and Data Processing Addendum.",
            "Scalar, its software, design, and brand remain our property. These Terms grant you a right to use the service, not ownership of it. Feedback you send us may be used to improve Scalar without obligation to you.",
          ],
        },
        {
          heading: "Third-party providers",
          body: [
            "Scalar orchestrates third-party data and infrastructure providers (listed on our Subprocessors page) to deliver discovery, enrichment, email, and hosting. Your use of data returned by those providers is subject to applicable law and the providers' terms. We are not responsible for the accuracy of third-party data beyond our own verification rules, though we apply strict accuracy gates before saving anything.",
          ],
        },
        {
          heading: "Data accuracy and your responsibility",
          body: [
            "We hold enrichment to a hard rule: data must attach to the correct person or company, verified by name and company or domain, or it is not saved. Even so, no data provider is perfect. You are responsible for how you use the records in Scalar, including ensuring you have a lawful basis to contact people and complying with email, privacy, and marketing laws in your jurisdiction.",
          ],
        },
        {
          heading: "Service availability",
          body: [
            "We work to keep Scalar available and reliable, but the service is provided on an “as is” and “as available” basis. We may perform maintenance, and outages can happen, including those caused by third-party providers. We do not guarantee uninterrupted or error-free operation.",
          ],
        },
        {
          heading: "Disclaimers and limitation of liability",
          body: [
            "To the fullest extent permitted by law, Scalar disclaims all implied warranties, including merchantability, fitness for a particular purpose, and non-infringement. We are not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, or data.",
            "Our total liability for any claim arising out of or relating to the service is limited to the amount you paid us for the service in the three months before the event giving rise to the claim.",
          ],
        },
        {
          heading: "Suspension and termination",
          body: [
            "You may stop using Scalar and delete your account at any time. We may suspend or terminate access if you breach these Terms, fail to pay, or use the service in a way that risks harm to Scalar or others. On termination, your right to use the service ends; you can export your Customer Data before deletion as described in the Privacy Policy.",
          ],
        },
        {
          heading: "Changes to these Terms",
          body: [
            "We may update these Terms as the product and law evolve. If we make a material change, we will update the date above and, where appropriate, notify you in the product or by email. Continued use after changes take effect means you accept the updated Terms.",
          ],
        },
        {
          heading: "Governing law and contact",
          body: [
            <>
              These Terms are governed by the laws of the jurisdiction in which
              Scalar operates, without regard to conflict-of-laws rules.
              Questions go to <L href="mailto:hello@tryscalar.xyz">hello@tryscalar.xyz</L>.
            </>,
          ],
        },
      ]}
      related={[
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Acceptable Use", href: "/acceptable-use" },
        { label: "Refund Policy", href: "/refund-policy" },
        { label: "Subprocessors", href: "/subprocessors" },
      ]}
    />
  );
}
