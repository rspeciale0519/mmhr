import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Server Components cannot write cookies, so `setAll` may throw there; the
 * middleware refreshes the session instead, which makes that throw safe to
 * swallow (see src/middleware.ts).
 * Auth actions require cookie writes and must opt into strict failure reporting.
 */
export async function createClient({ requireCookieWrites = false }: { requireCookieWrites?: boolean } = {}) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch (error) {
            if (requireCookieWrites) throw error;
            // Called from a Server Component. The middleware owns session
            // refresh, so nothing is lost.
          }
        },
      },
    },
  );
}
