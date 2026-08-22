import type { Metadata } from "next";
import { FeaturePage } from "@/components/marketing/feature-page";

export const metadata: Metadata = {
  title: "Why Scalar | Scalar",
  description:
    "Structure, a real UI, and built-in intelligence as one system your agents operate, versus dumping everything into messy markdown files.",
};

export default function WhyScalarPage() {
  return (
    <FeaturePage
      eyebrow="Why Scalar"
      title="Structure your agents"
      accent="can't outgrow"
      subtitle="Agent frameworks dump everything into messy markdown files. Scalar gives your agents a structured system: typed records, a real UI, and built-in intelligence, in one place."
      blocks={[
        {
          title: "Structure, not scattered files",
          body: "Every record is typed, deduped, and queryable, so your data compounds instead of rotting in a folder of notes no human would tolerate and no system can trust.",
        },
        {
          title: "A UI a human can see",
          body: "The same database your agent writes to, you can read, sort, and trust, on a real interface, not a wall of text you have to parse by hand.",
        },
        {
          title: "Data you own",
          body: "A single source of truth you control: exportable any time, never resold, and never used to train someone else's model. Enrichment flows in; your data stays yours.",
        },
        {
          title: "Intelligence built in",
          body: "Discovery, enrichment, and intent signals are part of the system, not a pile of integrations you wire together and babysit.",
        },
      ]}
      ctaTitle="Give agent work a home it never forgets."
    />
  );
}
