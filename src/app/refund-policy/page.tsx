import type { Metadata } from "next";
import { LegalDoc, L } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Refund Policy | Scalar",
  description: "Refunds, cancellation, and how credits are billed.",
};

export default function RefundPolicyPage() {
  return (
    <LegalDoc
      title="Refund Policy"
      updated="June 9, 2026"
      intro={
        <>
          We want pricing to feel as honest as the product. This policy explains
          how subscriptions, credits, and refunds work. It is part of our Terms
          of Service, and payments are handled by our processor, Stripe.
        </>
      }
      sections={[
        {
          heading: "Subscriptions and renewal",
          body: [
            "Paid plans are billed in advance for each billing period and renew automatically until you cancel. Each renewal resets your plan's monthly credit allowance.",
          ],
        },
        {
          heading: "Cancelling",
          body: [
            "You can cancel anytime from billing settings. Cancellation stops the next renewal; your plan stays active until the end of the period you already paid for, and you keep access to remaining credits until then. We do not charge a cancellation fee.",
          ],
        },
        {
          heading: "Refunds",
          bullets: [
            "Subscription fees are generally non-refundable once a billing period has started, because the plan and its credits are made available immediately.",
            "If you were charged in error, or the service was materially unavailable due to our fault, contact us and we will make it right, including a prorated or full refund where appropriate.",
            "We honor refund rights required by the consumer-protection laws that apply to you; this policy does not limit those rights.",
          ],
        },
        {
          heading: "Credits and the no-charge-for-misses rule",
          body: [
            "Credits are a prepaid entitlement to run paid operations. They have no cash value and are not redeemable for money. You are only charged credits when a lookup returns verified data: if Scalar cannot confirm a match, it returns nothing and no credits are spent. Unused monthly credits expire at the end of the period unless your plan states otherwise; separately purchased top-up credits follow the terms shown at purchase.",
          ],
        },
        {
          heading: "How to request a refund",
          body: [
            <>
              Email <L href="mailto:hello@tryscalar.xyz">hello@tryscalar.xyz</L>{" "}
              from the address on your account with your workspace and the
              charge in question. We aim to respond within a few business days.
            </>,
          ],
        },
      ]}
      related={[
        { label: "Terms of Service", href: "/terms" },
        { label: "Pricing", href: "/pricing" },
      ]}
    />
  );
}
