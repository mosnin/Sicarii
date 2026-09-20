import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | Scalar",
  description: "The rules for using Scalar responsibly.",
};

export default function AcceptableUsePage() {
  return (
    <LegalDoc
      title="Acceptable Use Policy"
      updated="June 9, 2026"
      intro={
        <>
          Scalar gives you and your agents real power over data about real
          people and companies. This policy sets the boundaries that keep that
          power responsible. It is part of our Terms of Service, and it applies
          to everything you and the agents you connect do on the platform.
        </>
      }
      sections={[
        {
          heading: "Use the platform lawfully",
          body: [
            "You must comply with all laws that apply to you, including privacy, data protection, anti-spam, and marketing laws (for example GDPR, CCPA, and CAN-SPAM where relevant). You are responsible for having a lawful basis to store and contact the people in your CRM.",
          ],
        },
        {
          heading: "Do not misuse data",
          bullets: [
            "Do not upload or enrich data you have no right to use.",
            "Do not store special-category personal data (such as health, biometric, or government-ID data) in Scalar.",
            "Do not use enriched contact data to harass, defraud, discriminate against, or endanger anyone.",
            "Honor opt-outs and deletion requests from the people in your database.",
          ],
        },
        {
          heading: "No spam or abusive outreach",
          body: [
            "Scalar is for relationship intelligence and tracking, not bulk unsolicited email. Do not use the platform or its email features to send spam, chain messages, or deceptive outreach. Sending must comply with applicable anti-spam law and the policies of the underlying email provider.",
          ],
        },
        {
          heading: "Protect the service",
          bullets: [
            "Do not probe, scan, or test the vulnerability of the service without our written permission.",
            "Do not attempt to access another account's data or bypass ownership and authentication controls.",
            "Do not overload, rate-limit-evade, scrape, or reverse-engineer the service or its APIs.",
            "Do not share or resell your API keys, or use Scalar to build a competing data-resale product.",
          ],
        },
        {
          heading: "Agent behavior is your responsibility",
          body: [
            "When you connect an agent over MCP or run the built-in one, the actions it takes are attributed to your account. You are responsible for configuring and supervising it so it stays within this policy. Scalar applies guardrails (ownership scoping, validation, rate limits, and confirmation on high-stakes actions like sending email), but you remain accountable for the outcome.",
          ],
        },
        {
          heading: "Enforcement",
          body: [
            "If you violate this policy, we may limit, suspend, or terminate your access, with or without notice depending on the severity, and we may remove offending data. Where there is a risk of harm or legal exposure, we will act quickly to protect the people affected and the platform.",
          ],
        },
      ]}
      related={[
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Security", href: "/security" },
      ]}
    />
  );
}
