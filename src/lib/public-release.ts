const ROBOTS_BLOCK = "noindex, nofollow, noarchive, nosnippet";

// A future approved release must replace null with a versioned approval ID.
// The production environment must contain the same ID before routes can open.
const CHECKED_IN_PUBLIC_RELEASE_ID: string | null = null;

type PublicReleaseEnvironment = {
  NODE_ENV?: string;
  PUBLIC_RELEASE_APPROVAL_ID?: string;
  PUBLIC_RELEASE_ENABLED?: string;
};

export function isPublicReleaseBlocked(
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

const commonHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": ROBOTS_BLOCK,
};

export function createPublicReleaseBlockResponse(pathname: string) {
  if (pathname === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", {
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

  return new Response(
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex,nofollow,noarchive,nosnippet\"><title>MatchMaker HR</title></head><body><main><h1>This site is not available yet.</h1><p>MatchMaker HR is preparing a new release.</p></main></body></html>",
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
