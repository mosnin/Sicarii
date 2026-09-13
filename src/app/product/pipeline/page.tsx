import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Keep research connected to the next conversation.",
  description:
    "Organize contacts, companies, activity and deal stages in the same CRM.",
  alternates: { canonical: "/product/pipeline" },
};
export default function Page() {
  return <WebsiteStory slug="product/pipeline" />;
}
