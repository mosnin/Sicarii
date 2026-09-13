import type { Metadata } from "next";
import { FeaturePage } from "@/components/marketing/feature-page";

export const metadata: Metadata = {
  title: "Enrich | Scalar",
  description:
    "Turn a name and a domain into a complete record: firmographics, verified email, direct phone, LinkedIn, with provenance on every field.",
};

export default function EnrichPage() {
  return (
    <FeaturePage
      eyebrow="Enrich"
      title="Fill every gap,"
      accent="accurately"
      subtitle="Turn a name and a domain into a complete record: firmographics, a verified work email, a direct phone, the LinkedIn profile, with provenance on every field."
      blocks={[
        {
          title: "Accuracy over coverage",
          body: "Scalar checks the person and company before accepting a match. Inspect the result before relying on it; an uncertain identity should remain unfilled.",
        },
        {
          title: "Provenance on every field",
          body: "Every enriched value shows where it came from and when, for example 'via Explorium, 3 days ago', and can be re-verified in a click. You always know how much to trust a field.",
        },
        {
          title: "Verified contact details",
          body: "Work emails and direct phones are checked, not guessed, so your outreach reaches a real inbox instead of bouncing.",
        },
        {
          title: "Only pay for hits",
          body: "Individual enrichment lookups debit on success. A multi-step research task may still consume credits for completed steps even when other details are missing.",
        },
      ]}
      ctaTitle="Make every record complete."
    />
  );
}
