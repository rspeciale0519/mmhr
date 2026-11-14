import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  createPublicReleaseBlockResponse,
  isPublicReleaseBlocked,
} from "@/lib/public-release";
import { isPathInLaunch } from "@/lib/launch-surface";
import { APPLICATION_SECURITY_HEADERS } from "@/lib/security-headers";
import { hardenSessionCookieOptions } from "@/lib/session-cookie";
import { shouldRejectServerActionRequest } from "@/server/auth/server-action-request";

/**
 * Baseline browser protections for every response the proxy returns. Next's
 * `headers()` config never sees the responses created here (release gate,
 * 403, 404, redirects, rewrites), so they are applied in both places. A header
 * the handler already set, such as the stricter release-gate CSP and referrer
 * policy, stays as it is.
 */
function withApplicationSecurityHeaders<T extends Response>(response: T): T {
  for (const { key, value } of APPLICATION_SECURITY_HEADERS) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

/**
 * Enforces the temporary public-release quarantine and the launch surface
 * allowlist. Then it refreshes the Supabase session and writes rotated
 * cookies onto the response.
 *
 * Route protection is deliberately NOT enforced here yet. Customer, vendor,
 * and admin protection belongs with the canonical IAM and RLS implementation.
 */
export async function proxy(request: NextRequest) {
  return withApplicationSecurityHeaders(await handleRequest(request));
}

async function handleRequest(request: NextRequest): Promise<Response> {
  if (isPublicReleaseBlocked()) {
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
            response.cookies.set(
              name,
              value,
              hardenSessionCookieOptions(options ?? {}, request.nextUrl.origin),
            );
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
