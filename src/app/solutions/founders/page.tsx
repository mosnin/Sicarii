import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Research a focused prospect list before writing the pitch.",
  description:
    "Use Scalar to organize companies, inspect contact details and prepare follow-up while you learn who fits your product.",
  alternates: { canonical: "/solutions/founders" },
};
export default function Page() {
  return <WebsiteStory slug="solutions/founders" />;
}
