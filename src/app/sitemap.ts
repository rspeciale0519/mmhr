import type { MetadataRoute } from "next";

import { isPublicIndexingBlocked } from "@/lib/public-release";
import { getSiteMetadataBase } from "@/lib/site-metadata";

// Keep this list limited to the public pages in the launch scope
// (docs/LAUNCH.md). Authenticated, internal, API, design-review, and
// launch-hidden routes must not enter the public sitemap.
export const PUBLIC_SITEMAP_PATHS = [
  "/",
  // The four menu pages (owner decision, 2026-11-25). `/blog` joins later.
  "/how-it-works",
  "/why-its-free",
  "/for-providers",
  "/resources",
  "/contact",
  "/privacy",
  "/terms",
] as const;

export function getPublicSitemapPaths(): string[] {
  return [...PUBLIC_SITEMAP_PATHS];
}

export default function sitemap(): MetadataRoute.Sitemap {
  // A locked production release, or an opened preview, must not advertise routes to crawlers.
  if (isPublicIndexingBlocked()) return [];

  const base = getSiteMetadataBase();
  if (!base) return [];

  return getPublicSitemapPaths().map((pathname) => ({
    url: new URL(pathname, base).toString(),
  }));
}
