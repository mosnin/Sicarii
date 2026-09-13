import type { Metadata } from "next";
import { FeaturePage } from "@/components/marketing/feature-page";

export const metadata: Metadata = {
  title: "The agent | Scalar",
  description:
    "A built-in agent that discovers, enriches, tracks deals, and writes to the same CRM you see, or bring your own over MCP.",
};

export default function AgentPage() {
  return (
    <FeaturePage
      eyebrow="The agent"
      title="A teammate that"
      accent="operates your CRM"
      subtitle="Scalar has a built-in agent that discovers, enriches, tracks deals, and writes to the same records you see, in plain conversation. Or bring your own."
      blocks={[
        {
          title: "One surface, two operators",
          body: "The agent works over the exact CRM you see, so there is never a hidden copy or a sync to reconcile. What it writes, you read, on the same interface.",
        },
        {
          title: "It remembers",
          body: "Long-term memory means each conversation builds on the last instead of starting from zero, so the second move is sharper than the first.",
        },
        {
          title: "Bring your own agent",
          body: "Prefer Claude, OpenClaw, Hermes, or something you built yourself? Connect it over MCP and give it the same structured database and the same tools the built-in agent uses.",
        },
        {
          title: "It can pay its own way",
          body: "Supported payment tools can buy credits or plan access. Authorize the purchase explicitly and inspect the price and account before executing it.",
        },
      ]}
      ctaTitle="Put an agent on it."
    />
  );
}
