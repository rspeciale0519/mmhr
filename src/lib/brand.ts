/**
 * Single source of truth for brand identity (decision D8).
 *
 * "MatchMaker HR" is a working name; the final name is not settled. Every
 * user-facing surface reads from here so a rename stays a config change rather
 * than a refactor.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "MatchMaker HR",
} as const;
