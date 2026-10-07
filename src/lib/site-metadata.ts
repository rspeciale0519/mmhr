import type { Metadata } from "next";

import { brand } from "@/lib/brand";
import { canonicalOrigin } from "@/server/identity/validation";

export function getSiteSocialMetadata(
  name: string,
  description: string,
  siteName = name,
) {
  return {
    openGraph: {
      type: "website" as const,
      title: name,
      description,
      siteName,
    },
    twitter: {
      card: "summary" as const,
      title: name,
      description,
    },
  };
}

export function getMarketingPageMetadata(
  pathname: string,
  title: string,
  description: string,
): Metadata {
  const social = getSiteSocialMetadata(title, description, brand.name);

  return {
    title,
    description,
    alternates: { canonical: pathname },
    openGraph: {
      ...social.openGraph,
      url: pathname,
    },
    twitter: social.twitter,
  };
}

/**
 * Returns the configured site origin only when it passes the same validation
 * used for redirects and invitation links.
 */
export function getSiteMetadataBase(
  environment?: { NEXT_PUBLIC_APP_URL?: string },
): URL | undefined {
  const origin = canonicalOrigin(
    environment === undefined ? process.env.NEXT_PUBLIC_APP_URL : environment.NEXT_PUBLIC_APP_URL,
  );
  return origin ? new URL(origin) : undefined;
}
