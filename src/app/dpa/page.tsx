import type { Metadata } from "next";
import { LegalDoc, L } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Data Processing Addendum | Scalar",
  description: "How Scalar processes personal data on your behalf.",
};

export default function DpaPage() {
  return (
    <LegalDoc
      title="Data Processing Addendum"
      updated="June 9, 2026"
      intro={
        <>
          This Data Processing Addendum (the &ldquo;DPA&rdquo;) describes how
          Scalar processes personal data on your behalf and forms part of our
          Terms of Service. When you store data about your contacts and
          companies in Scalar, you are the controller of that personal data and
          Scalar is your processor. If you need a countersigned copy for your
          compliance records, email us.
        </>
      }
      sections={[
        {
          heading: "Roles",
          body: [
            "You determine the purposes and means of processing the personal data you put into Scalar (the “Customer Data”), so you are the controller. Scalar processes that data only to provide the service and on your instructions, so we are the processor. For account and billing data we collect about you directly, we act as controller, as described in the Privacy Policy.",
          ],
        },
        {
          heading: "Scope and purpose",
          body: [
            "We process Customer Data to store your CRM, run discovery and enrichment, operate the agent and MCP surface, sync email, and provide support and security. We do not process it for our own independent purposes, and we never sell it or use it to train models for other customers.",
          ],
        },
        {
          heading: "Our commitments as processor",
          bullets: [
            "Process Customer Data only on your documented instructions, including the instructions inherent in your use of the product.",
            "Ensure people authorized to process the data are bound by confidentiality.",
            "Apply appropriate technical and organizational security measures (see the Security page).",
            "Use subprocessors only under written terms that protect the data, and keep the list current on the Subprocessors page.",
            "Assist you, taking into account the nature of processing, in responding to data-subject requests and in meeting your security and breach-notification duties.",
            "Notify you without undue delay after becoming aware of a personal-data breach affecting your data.",
          ],
        },
        {
          heading: "Subprocessors",
          body: [
            <>
              You authorize Scalar to use the subprocessors listed on our{" "}
              <L href="/subprocessors">Subprocessors page</L>. We remain
              responsible for their performance of data-protection obligations.
              We will update that page when the list changes.
            </>,
          ],
        },
        {
          heading: "International transfers",
          body: [
            "Where Customer Data is transferred across borders by us or our subprocessors, we rely on appropriate safeguards such as standard contractual clauses or an equivalent lawful transfer mechanism.",
          ],
        },
        {
          heading: "Data-subject requests and deletion",
          body: [
            "You can access, correct, export, and delete Customer Data directly in the product, which is how we help you respond to the people whose data you hold. On termination, you may export your data, after which we delete or anonymize it within a reasonable period, except for limited records we must keep by law.",
          ],
        },
        {
          heading: "Audits",
          body: [
            "On reasonable request and subject to confidentiality, we will provide information necessary to demonstrate compliance with this DPA, including relevant details about our security practices and subprocessors.",
          ],
        },
      ]}
      related={[
        { label: "Subprocessors", href: "/subprocessors" },
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Security", href: "/security" },
      ]}
    />
  );
}
