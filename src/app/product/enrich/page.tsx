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
          body: "Scalar never attaches data for the wrong person or company. It verifies the name and the company or domain before saving, and prefers an honest blank over a confident guess about a same-name stranger.",
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
          body: "Enrichment spends credits only when it actually returns data. A miss costs nothing, so coverage gaps never cost you.",
        },
      ]}
      ctaTitle="Make every record complete."
    />
  );
}
