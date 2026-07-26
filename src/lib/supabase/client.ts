import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser/Client Components.
 *
 * Uses the public anon key, which is safe to ship to the browser: it carries no
 * privileges of its own and every request it makes is subject to RLS. The
 * service-role key must never reach this file.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
