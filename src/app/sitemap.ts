import type { MetadataRoute } from "next";
import stories from "@/lib/website/stories.json";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "pricing",
    "about",
    "contact",
    "demo",
    "resources",
    "integrations",
    "faq",
    "security",
    "product/discover",
    "product/enrich",
    "product/signals",
    "product/agent",
    "product/how-it-works",
    "product/why",
    ...Object.keys(stories),
  ].map((path) => ({
    url: `https://www.tryscalar.xyz/${path}`,
    priority: path ? 0.6 : 1,
  }));
}
