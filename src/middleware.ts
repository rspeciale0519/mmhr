import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  createPublicReleaseBlockResponse,
  isPublicReleaseBlocked,
} from "@/lib/public-release";

/**
 * Enforces the temporary public-release quarantine. Then it refreshes the
 * Supabase session and writes rotated cookies onto the response.
 *
 * Route protection is deliberately NOT enforced here yet. Customer, vendor,
 * and admin protection belongs with the canonical IAM and RLS implementation.
 */
export async function middleware(request: NextRequest) {
  if (isPublicReleaseBlocked()) {
    return createPublicReleaseBlockResponse(request.nextUrl.pathname);
  }

  // GALLERY_ONLY builds (the public design-review deployment) serve nothing but
  // /designs. The app and admin routes never render, and sign-up is unreachable
  // — so a public URL can't be used to create accounts against a real Supabase
  // project. Auth is skipped entirely here: there is nothing to authenticate.
  if (process.env.GALLERY_ONLY === "1") {
    const { pathname } = request.nextUrl;
    if (pathname === "/designs" || pathname.startsWith("/designs/")) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/designs";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
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
    // Everything except Next's generated assets and the exact favicon path.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
