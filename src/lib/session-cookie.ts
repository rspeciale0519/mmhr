type CookieOptionInput = {
  path?: string;
  httpOnly?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
  maxAge?: number;
  domain?: string;
  expires?: Date;
  priority?: "low" | "medium" | "high";
};

export function shouldUseSecureCookies(
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
): boolean {
  return typeof appUrl === "string" && appUrl.startsWith("https://");
}

/**
 * Session cookies must not ride on cross-site POSTs, and on an HTTPS origin
 * they must never travel in clear text. Secure follows the configured app
 * origin so local HTTP keeps working.
 *
 * HttpOnly is deliberately left to the provider. The browser Supabase client
 * (src/lib/supabase/client.ts) reads the auth cookie from document.cookie for
 * MFA enrollment and verification, so an HttpOnly session cookie would sign
 * the browser out of MFA. @supabase/ssr defaults to httpOnly: false for the
 * same reason.
 */
export function hardenSessionCookieOptions<T extends CookieOptionInput>(
  options: T,
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
): T & { sameSite: "lax"; secure: boolean; path: string } {
  return {
    ...options,
    sameSite: "lax",
    secure: shouldUseSecureCookies(appUrl),
    path: options.path ?? "/",
  };
}
