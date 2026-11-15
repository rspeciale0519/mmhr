import type { MetadataRoute } from "next";

import {
  getPublicReleaseRobotsMetadata,
  isPublicIndexingBlocked,
} from "@/lib/public-release";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const metadata = getPublicReleaseRobotsMetadata(isPublicIndexingBlocked());

  return {
    rules: {
      userAgent: "*",
      ...(metadata.index ? { allow: "/" } : { disallow: "/" }),
    },
  };
}
