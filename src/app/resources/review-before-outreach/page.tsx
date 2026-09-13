import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Review the person, the evidence and the message.",
  description:
    "Use research to prepare a relevant follow-up without treating an AI draft as permission to send.",
  alternates: { canonical: "/resources/review-before-outreach" },
};
export default function Page() {
  return <WebsiteStory slug="resources/review-before-outreach" />;
}
