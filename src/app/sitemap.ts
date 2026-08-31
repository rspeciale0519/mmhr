import type { MetadataRoute } from "next";

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

export default function sitemap(): MetadataRoute.Sitemap {
  // A blocked production release must not advertise routes to crawlers.
  if (isPublicReleaseBlocked()) return [];

  const base = getSiteMetadataBase();
  if (!base) return [];

  return PUBLIC_SITEMAP_PATHS.map((pathname) => ({
    url: new URL(pathname, base).toString(),
  }));
}
