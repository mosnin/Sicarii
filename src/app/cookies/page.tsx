import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Cookie Policy | Scalar",
  description: "How and why Scalar uses cookies.",
};

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Cookie Policy"
      updated="June 9, 2026"
      intro={
        <>
          Scalar uses a small, deliberate set of cookies. We do not run
          advertising trackers or sell your browsing activity. This policy
          explains what we set and why, and complements our Privacy Policy.
        </>
      }
      sections={[
        {
          heading: "What cookies are",
          body: [
            "Cookies are small text files a website stores in your browser. They let the site remember things between requests, such as whether you are signed in. Some are essential for the app to work; others are optional.",
          ],
        },
        {
          heading: "Cookies we use",
          bullets: [
            "Essential: authentication and session cookies set by Clerk so you can sign in and stay signed in securely. The app does not work without these.",
            "Preferences: a cookie that remembers your light or dark theme choice.",
            "Analytics: privacy-respecting, aggregate usage measurement that helps us keep the product reliable. These do not identify you to advertisers.",
          ],
        },
        {
          heading: "What we do not do",
          body: [
            "We do not use third-party advertising cookies, cross-site behavioral tracking, or data brokers. We do not sell information gathered through cookies.",
          ],
        },
        {
          heading: "Managing cookies",
          body: [
            "You can clear or block cookies in your browser settings. Blocking essential cookies will sign you out and prevent the app from functioning. Where required by law, we ask for consent before setting non-essential cookies.",
          ],
        },
      ]}
      related={[
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" },
      ]}
    />
  );
}
