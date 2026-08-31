import { canonicalOrigin } from "@/server/identity/validation";

export function getSiteSocialMetadata(name: string, description: string) {
  return {
    openGraph: {
      type: "website" as const,
      title: name,
      description,
      siteName: name,
    },
    twitter: {
      card: "summary" as const,
      title: name,
      description,
    },
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
    environment?.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  );
  return origin ? new URL(origin) : undefined;
}
