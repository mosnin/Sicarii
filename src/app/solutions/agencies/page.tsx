import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Keep each client’s prospecting context distinct.",
  description:
    "Use workspace records, segments and explicit research criteria to organize client prospecting work.",
  alternates: { canonical: "/solutions/agencies" },
};
export default function Page() {
  return <WebsiteStory slug="solutions/agencies" />;
}
