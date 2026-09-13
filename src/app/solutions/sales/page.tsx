import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Put the account research beside the next follow-up.",
  description:
    "Give sellers and their agents a CRM record they can inspect, update and use when preparing the next conversation.",
  alternates: { canonical: "/solutions/sales" },
};
export default function Page() {
  return <WebsiteStory slug="solutions/sales" />;
}
