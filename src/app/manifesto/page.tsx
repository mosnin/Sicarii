import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ManifestoContent } from "./manifesto-content";

export const metadata: Metadata = {
  title: "Manifesto",
  description:
    "Why we built Scalar: agents are brilliant at doing and hopeless at remembering. The work should remember itself.",
};

export default function ManifestoPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <ManifestoContent />
      </main>
      <Footer />
    </>
  );
}
