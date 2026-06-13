import type { Metadata } from "next";
import { FeaturePage } from "@/components/marketing/feature-page";

export const metadata: Metadata = {
  title: "Discover | Scalar",
  description:
    "Find the right companies and people from a name, a domain, or a plain-English prompt, written straight into your CRM, deduped.",
};

export default function DiscoverPage() {
  return (
    <FeaturePage
      eyebrow="Discover"
      title="Find the right companies,"
      accent="from a prompt"
      subtitle="Point your agent at a name, a domain, or a plain-English description of your market. Scalar finds real companies and the people inside them and writes them into your CRM, deduped."
      blocks={[
        {
          title: "Real companies, not articles",
          body: "Discovery returns actual company homepages, never blog posts, listicles, or directories. Known aggregators are filtered out, so a 'top startups' article never lands in your CRM as a record.",
        },
        {
          title: "Local lead gen",
          body: "For businesses with an address, restaurants, dentists, law firms, Scalar pulls them from Google Maps with phone and address attached, ready to work the moment they land.",
        },
        {
          title: "Deduped by default",
          body: "Every new record is checked against your CRM by domain, then name, so the same company is never added twice, no matter how many times you run discovery.",
        },
        {
          title: "People, not just logos",
          body: "Discovery surfaces the decision makers inside each company, so you start a relationship with a named contact instead of a blank account.",
        },
      ]}
      ctaTitle="Let your agent build the list."
    />
  );
}
