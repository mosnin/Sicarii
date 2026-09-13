import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Run one research task you can check.",
  description:
    "Start with a known company and a small question before asking an agent to build a large list.",
  alternates: { canonical: "/resources/first-research" },
};
export default function Page() {
  return <WebsiteStory slug="resources/first-research" />;
}
