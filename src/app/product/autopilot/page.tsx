import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Turn a research goal into a bounded plan.",
  description:
    "Prepare a budgeted autopilot plan, inspect its steps and approve it before execution.",
  alternates: { canonical: "/product/autopilot" },
};
export default function Page() {
  return <WebsiteStory slug="product/autopilot" />;
}
