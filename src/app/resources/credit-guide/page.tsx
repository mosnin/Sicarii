import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Budget the research steps, not just the final list.",
  description:
    "Credits measure priced actions. A single prospect can require several searches and enrichment steps.",
  alternates: { canonical: "/resources/credit-guide" },
};
export default function Page() {
  return <WebsiteStory slug="resources/credit-guide" />;
}
