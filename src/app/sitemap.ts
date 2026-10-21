import type { MetadataRoute } from "next";

import { CASE_STUDIES, POSTS } from "@/app/(marketing)/_site/data";
import { isPublicReleaseBlocked } from "@/lib/public-release";
import { getSiteMetadataBase } from "@/lib/site-metadata";

// Keep this list limited to stable marketing routes. Authenticated, internal,
// API, and design-review routes must not enter the public sitemap.
export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/about",
  "/blog",
  "/broker-model",
  "/case-studies",
  "/contact",
  "/faq",
  "/partners/brokers-consultants",
  "/partners/pe-vc",
  "/partners/software-vendors",
  "/platform",
  "/privacy",
  "/resources",
  "/resources/hris-landscape-report",
  "/resources/partner-finder",
  "/resources/requirements-builder",
  "/services",
  "/terms",
  "/transparency",
] as const;

export function getPublicSitemapPaths(): string[] {
  return [
    ...PUBLIC_SITEMAP_PATHS,
    ...POSTS.map((post) => `/blog/${post.slug}`),
    ...CASE_STUDIES.map((study) => `/case-studies/${study.slug}`),
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  // A blocked production release must not advertise routes to crawlers.
  if (isPublicReleaseBlocked()) return [];

  const base = getSiteMetadataBase();
  if (!base) return [];

  return getPublicSitemapPaths().map((pathname) => ({
    url: new URL(pathname, base).toString(),
  }));
}
