import { brand } from "@/lib/brand";

export const PUBLIC_RELEASE_ROBOTS_TAG = "noindex, nofollow, noarchive, nosnippet";
const ROBOTS_DISALLOW_BODY = "User-agent: *\nDisallow: /\n";
const ROBOTS_ALLOW_BODY = "User-agent: *\nAllow: /\n";

// A future approved release must replace null with a versioned approval ID.
// The production environment must contain the same ID before routes can open.
const CHECKED_IN_PUBLIC_RELEASE_ID: string | null = null;

type PublicReleaseEnvironment = {
  NODE_ENV?: string;
  PUBLIC_RELEASE_APPROVAL_ID?: string;
  PUBLIC_RELEASE_ENABLED?: string;
  VERCEL_ENV?: string;
  MMHR_PREVIEW_RELEASE_ENABLED?: string;
};

export type PublicReleaseRobotsMetadata = {
  index: boolean;
  follow: boolean;
  noarchive?: boolean;
  nosnippet?: boolean;
};

/**
 * True while crawlers must not index the site: every production build until
 * the checked-in release ID and the environment approval match. An opened
 * preview stays in this state, so robots.txt, the sitemap, page metadata, and
 * X-Robots-Tag keep their blocked form there.
 */
export function isPublicIndexingBlocked(
  environment: PublicReleaseEnvironment = process.env,
  checkedInReleaseId: string | null = CHECKED_IN_PUBLIC_RELEASE_ID,
) {
  if (environment.NODE_ENV !== "production") {
    return false;
  }

  return !(
    checkedInReleaseId !== null &&
    environment.PUBLIC_RELEASE_ENABLED === "1" &&
    environment.PUBLIC_RELEASE_APPROVAL_ID === checkedInReleaseId
  );
}

/**
 * True while the proxy must answer every request with the holding response.
 * The only exception to the indexing lock is a Vercel Preview deployment with
 * MMHR_PREVIEW_RELEASE_ENABLED set to exactly "1". VERCEL_ENV is set by Vercel,
 * so the flag can never open a Production deployment.
 */
export function isPublicReleaseBlocked(
  environment: PublicReleaseEnvironment = process.env,
  checkedInReleaseId: string | null = CHECKED_IN_PUBLIC_RELEASE_ID,
) {
  if (!isPublicIndexingBlocked(environment, checkedInReleaseId)) {
    return false;
  }

  return !(
    environment.VERCEL_ENV === "preview" &&
    environment.MMHR_PREVIEW_RELEASE_ENABLED === "1"
  );
}

/**
 * Keeps generated page metadata aligned with the indexing lock.
 * The checked-in release ID remains the source of truth for opening production.
 */
export function getPublicReleaseRobotsMetadata(
  blocked = isPublicIndexingBlocked(),
): PublicReleaseRobotsMetadata {
  return blocked
    ? { index: false, follow: false, noarchive: true, nosnippet: true }
    : { index: true, follow: true };
}

const commonHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": PUBLIC_RELEASE_ROBOTS_TAG,
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

export function createPublicReleaseBlockResponse(
  pathname: string,
  brandName: string = brand.name,
  method = "GET",
) {
  if (
    pathname === "/robots.txt" &&
    (method === "GET" || method === "HEAD")
  ) {
    return new Response(ROBOTS_DISALLOW_BODY, {
      headers: {
        ...commonHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return Response.json(
      { error: "service_unavailable" },
      {
        status: 503,
        headers: {
          ...commonHeaders,
          "Retry-After": "3600",
        },
      },
    );
  }

  const safeBrandName = escapeHtml(brandName);

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>${safeBrandName}</title></head><body><main><h1>This site is not available yet.</h1><p>${safeBrandName} is preparing a new release.</p></main></body></html>`,
    {
      status: 503,
      headers: {
        ...commonHeaders,
        "Content-Security-Policy":
          "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "3600",
      },
    },
  );
}

/**
 * Returns crawler rules for the locked or unlocked production state.
 * This is separate from the release block response because an unlocked site
 * must expose allow rules without the block-only response status and headers.
 */
export function createPublicReleaseRobotsResponse(blocked: boolean) {
  if (blocked) {
    return createPublicReleaseBlockResponse("/robots.txt");
  }

  return new Response(ROBOTS_ALLOW_BODY, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
