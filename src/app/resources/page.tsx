import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
export const metadata = {
  title: "Resources",
  description: "Practical product guides and setup help.",
  alternates: { canonical: "/resources" },
};
export default function Page() {
  return (
    <>
      <Header />
      <h1 className="font-brand px-6 pt-36 text-center text-4xl">
        Plan, research and review with Scalar.
      </h1>
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid gap-10 md:grid-cols-2">
          <Link
            className="block rounded-xl border border-current/15 p-6"
            href="/resources/first-research"
          >
            <h2 className="text-2xl">Run one research task you can check.</h2>
            <p className="mt-4 opacity-75">
              Start with a known company and a small question before asking an
              agent to build a large list.
            </p>
          </Link>
          <Link
            className="block rounded-xl border border-current/15 p-6"
            href="/resources/credit-guide"
          >
            <h2 className="text-2xl">
              Budget the research steps, not just the final list.
            </h2>
            <p className="mt-4 opacity-75">
              Credits measure priced actions. A single prospect can require
              several searches and enrichment steps.
            </p>
          </Link>
          <Link
            className="block rounded-xl border border-current/15 p-6"
            href="/resources/review-before-outreach"
          >
            <h2 className="text-2xl">
              Review the person, the evidence and the message.
            </h2>
            <p className="mt-4 opacity-75">
              Use research to prepare a relevant follow-up without treating an
              AI draft as permission to send.
            </p>
          </Link>
        </div>
      </section>
      <Footer />
    </>
  );
}
