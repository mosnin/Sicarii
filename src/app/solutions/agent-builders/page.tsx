import type { Metadata } from "next";
import { WebsiteStory } from "@/components/marketing/website-story";
export const metadata: Metadata = {
  title: "Give your agent a CRM it can read and update.",
  description:
    "Connect through MCP to supported research and CRM actions, with a visible credit balance for metered work.",
  alternates: { canonical: "/solutions/agent-builders" },
};
export default function Page() {
  return <WebsiteStory slug="solutions/agent-builders" />;
}
