export type SecurityHeader = {
  key: string;
  value: string;
};

/**
 * Headers applied to every matched application response.
 *
 * The CSP is deliberately additive (no script-src rewrite) so Next.js, Sentry,
 * and PostHog keep working. It still blocks framing, base-tag hijacks, and
 * plugin content.
 */
export const APPLICATION_SECURITY_HEADERS: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

export function applicationHeaderMap(
  headers: SecurityHeader[] = APPLICATION_SECURITY_HEADERS,
): Record<string, string> {
  return Object.fromEntries(headers.map(({ key, value }) => [key, value]));
}
