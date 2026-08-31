import type { MetadataRoute } from "next";

import {
  getPublicReleaseRobotsMetadata,
  isPublicReleaseBlocked,
} from "@/lib/public-release";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const blocked = isPublicReleaseBlocked();
  const metadata = getPublicReleaseRobotsMetadata(blocked);

  return {
    rules: {
      userAgent: "*",
      ...(metadata.index ? { allow: "/" } : { disallow: "/" }),
    },
  };
}
