import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  createPublicReleaseBlockResponse,
  isGalleryPreviewRequest,
  isPublicReleaseBlocked,
} from "@/lib/public-release";
import { isPathInLaunch } from "@/lib/launch-surface";
import { shouldRejectServerActionRequest } from "@/server/auth/server-action-request";

/**
 * Enforces the temporary public-release quarantine and the launch surface
 * allowlist. Then it refreshes the Supabase session and writes rotated
 * cookies onto the response.
 *
 * Route protection is deliberately NOT enforced here yet. Customer, vendor,
 * and admin protection belongs with the canonical IAM and RLS implementation.
 */
export async function proxy(request: NextRequest) {
  if (isPublicReleaseBlocked()) {
    // The design gallery is static sample content; it needs no session work.
    if (isGalleryPreviewRequest(request.nextUrl.pathname, request.method)) {
      const response = NextResponse.next();
      response.headers.set("x-robots-tag", "noindex, nofollow, noarchive, nosnippet");
      return response;
    }
    return createPublicReleaseBlockResponse(
      request.nextUrl.pathname,
      undefined,
      request.method,
    );
  }

  if (shouldRejectServerActionRequest(request)) {
    return new NextResponse(null, {
      status: 403,
      headers: {
        "cache-control": "private, no-store",
      },
    });
  }

  // Owner decision D2: hidden launch areas look absent, and no session work runs.
  if (!isPathInLaunch(request.nextUrl.pathname)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "not_found" }, {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      });
    }
    return NextResponse.rewrite(new URL("/__not-in-launch", request.url));
  }

  // GALLERY_ONLY builds (the public design-review deployment) serve nothing but
  // /designs. The app and admin routes never render, and sign-up is unreachable
  // — so a public URL can't be used to create accounts against a real Supabase
  // project. Auth is skipped entirely here: there is nothing to authenticate.
  if (process.env.GALLERY_ONLY === "1") {
    const { pathname } = request.nextUrl;
    if (pathname === "/robots.txt") {
      return createPublicReleaseBlockResponse(
        pathname,
        undefined,
        request.method,
      );
    }
    if (pathname === "/designs" || pathname.startsWith("/designs/")) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/designs";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
    },
  );

  // Validates the JWT and rotates the token when it is near expiry. Do not
  // replace with getSession(): that reads storage without verifying.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Match application, API, and robots paths without prefix-based bypasses.
    "/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$).*)",
  ],
};
