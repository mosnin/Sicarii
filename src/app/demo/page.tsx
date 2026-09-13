import { FeaturePage } from "@/components/marketing/feature-page";
import Link from "next/link";
export const metadata = {
  title: "Request a demo",
  description:
    "Discuss your research workflow, credit budget and review process.",
  alternates: { canonical: "/demo" },
};
export default function Page() {
  return (
    <FeaturePage
      eyebrow="Demo"
      title="Walk through your next"
      accent="research task."
      subtitle="Describe your product, the accounts you want to understand and the evidence you need before follow-up. A request does not book a calendar slot."
      blocks={[
        {
          title: "A useful brief",
          body: "Include the workflow, approximate research volume and the setup question you want answered. Do not include credentials or private prospect records.",
        },
        {
          title: "What to review",
          body: "Discovery, identity checks, enrichment, credit budgeting and the human decision before outreach.",
        },
      ]}
      extra={
        <div className="mx-auto max-w-3xl px-6 py-8 text-center">
          <Link
            href="/contact"
            className="rounded-full bg-primary px-7 py-3 font-medium text-[#132b3a]"
          >
            Request a walkthrough
          </Link>
        </div>
      }
      ctaTitle="Try a bounded task while you plan."
    />
  );
}
