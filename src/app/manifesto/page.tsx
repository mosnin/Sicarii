import type { Metadata } from "next";
import { Italiana, Manrope, Marck_Script } from "next/font/google";
import { ManifestoContent } from "./manifesto-content";

// Self-hosted via next/font so the strict CSP (style-src/font-src 'self') serves
// them. The variable names match the @theme tokens in globals.css, so the
// font-manrope / font-marck utilities resolve to these on this page.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-manrope",
  display: "swap",
});
const italiana = Italiana({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-italiana",
  display: "swap",
});
const marck = Marck_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-marck",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manifesto",
  description: "Why we built Scalar: eliminate operational chaos, restore balance.",
};

export default function ManifestoPage() {
  return (
    <ManifestoContent
      fontClassName={`${manrope.variable} ${italiana.variable} ${marck.variable}`}
    />
  );
}
