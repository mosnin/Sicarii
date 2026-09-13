import { FeaturePage } from "@/components/marketing/feature-page";
import stories from "@/lib/website/stories.json";
export function WebsiteStory({ slug }: { slug: keyof typeof stories }) {
  const s = stories[slug];
  return (
    <FeaturePage
      eyebrow={
        slug.startsWith("solutions")
          ? "Solutions"
          : slug.startsWith("resources")
            ? "Guides"
            : "Product"
      }
      title={s.title}
      accent=""
      subtitle={s.sub}
      blocks={[
        { title: "The problem to solve", body: s.problem },
        ...s.benefits,
        { title: "Before you begin", body: s.limits },
      ]}
      steps={s.steps}
      ctaTitle="Start with one research task you can check."
    />
  );
}
