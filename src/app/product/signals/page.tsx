import type { Metadata } from "next";
import { FeaturePage } from "@/components/marketing/feature-page";

export const metadata: Metadata = {
  title: "Intent signals | Scalar",
  description:
    "Scheduled monitors watch the web for buying signals and surface in-market companies before anyone else reaches out.",
};

export default function SignalsPage() {
  return (
    <FeaturePage
      eyebrow="Intent signals"
      title="See who's"
      accent="in-market"
      titleTail="first"
      subtitle="Scheduled monitors watch the web for the signals that mean a company is ready to buy, and surface them before your competitors notice."
      blocks={[
        {
          title: "Always-on monitors",
          body: "Set a watch once and Scalar checks on a schedule, adding new in-market companies to your CRM as it finds them. No tab to keep open, no search to re-run.",
        },
        {
          title: "The pulse",
          body: "Come back to a quiet summary of what changed while you were away, 'your agent added 14 companies, enriched 9, flagged 2 in-market', so you never miss a moment.",
        },
        {
          title: "Straight into the pipeline",
          body: "Signals become real, deduped records, ready to enrich and work, not a separate alert inbox you have to triage and copy from.",
        },
        {
          title: "Tuned to your market",
          body: "Monitors are scoped to the segment you care about, so what surfaces is relevant demand, not noise.",
        },
      ]}
      ctaTitle="Catch demand as it forms."
    />
  );
}
