import type { Metadata } from "next";
import { FeaturePage } from "@/components/marketing/feature-page";

export const metadata: Metadata = {
  title: "How it works | Scalar",
  description:
    "Three steps from empty to a CRM that fills itself: connect your agent, let it work, and watch it compound on data you own.",
};

export default function HowItWorksPage() {
  return (
    <FeaturePage
      eyebrow="How it works"
      title="Connect your agent."
      accent="It just works."
      subtitle="Three steps from an empty database to a CRM that fills itself, on a single source of truth you own."
      blocks={[
        {
          title: "No migration, no setup call",
          body: "Start from empty and let the work build the database. There is nothing to import before you see value, and nothing to configure before your agent can write.",
        },
        {
          title: "Works with what you use",
          body: "Use the built-in agent, or connect Claude, OpenClaw, Hermes, Codex, or your own over MCP. Anything that speaks MCP gets the same database and tools.",
        },
      ]}
      steps={[
        {
          title: "Connect",
          body: "Sign in and connect your agent over MCP, or use the built-in one. Read and write access takes minutes, not a procurement cycle.",
        },
        {
          title: "Let it work",
          body: "Ask in plain language: find companies, enrich them, track the deal, watch the market. Your agent writes every result straight into the CRM, deduped.",
        },
        {
          title: "Watch it compound",
          body: "Every run sharpens the next on a single source of truth you own, with provenance on every field so you always know what to trust.",
        },
      ]}
      ctaTitle="Start in minutes."
    />
  );
}
