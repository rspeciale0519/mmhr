import { canonicalOrigin } from "@/server/identity/validation";

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
