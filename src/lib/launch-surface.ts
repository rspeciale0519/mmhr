/**
 * Launch surface allowlist (owner decision D2; see
 * .codex/plans/build-mvp-p0-baseline-2026-10-07.md, Section 5).
 *
 * Finance records and private document storage stay hidden in every launch
 * candidate. Demos, proposals, and contracts appear only in Candidate B.
 * The code and data behind hidden areas stay in place. This file has no
 * framework imports so the proxy, route handlers, and pages can share it.
 */
export type LaunchCandidate = "A" | "B";
export type LaunchArea = "core" | "candidate-b" | "finance" | "documents" | "unapproved-marketing";

/**
 * Public marketing pages whose claims the owner has not approved (docs/LAUNCH.md,
 * trim task 6). Only `/`, `/contact`, `/privacy`, and `/terms` stay public.
 */
const unapprovedMarketingPrefixes = [
  "/about",
  "/blog",
  "/broker-model",
  "/case-studies",
  "/faq",
  "/partners",
  "/platform",
  "/resources",
  "/services",
  "/transparency",
] as const;

const areaPrefixes: ReadonlyArray<readonly [string, LaunchArea]> = [
  ["/admin/finance", "finance"],
  ["/api/finance", "finance"],
  ["/documents", "documents"],
  ["/api/documents", "documents"],
  ["/customer/demos", "candidate-b"],
  ["/vendor/demos", "candidate-b"],
  ["/admin/demos", "candidate-b"],
  ["/customer/proposals", "candidate-b"],
  ["/vendor/proposals", "candidate-b"],
  ["/admin/proposals", "candidate-b"],
  ["/customer/contracts", "candidate-b"],
  ["/vendor/contracts", "candidate-b"],
  ["/admin/contracts", "candidate-b"],
  ...unapprovedMarketingPrefixes.map((prefix) => [prefix, "unapproved-marketing"] as const),
];

const trpcRouterAreas: Readonly<Record<string, LaunchArea>> = {
  documents: "documents",
  financeDocuments: "finance",
  managedFinance: "finance",
  managedInvoices: "finance",
  demos: "candidate-b",
  proposals: "candidate-b",
  contracts: "candidate-b",
};

const trpcPrefix = "/api/trpc/";

/** An unset value means Candidate A. Any other unknown value is a configuration error. */
export function launchCandidate(value = process.env.MMHR_LAUNCH_CANDIDATE): LaunchCandidate {
  if (value === undefined || value === "" || value === "A") return "A";
  if (value === "B") return "B";
  throw new Error("MMHR_LAUNCH_CANDIDATE must be A or B");
}

export function isLaunchAreaEnabled(area: LaunchArea, candidate: LaunchCandidate = launchCandidate()): boolean {
  if (area === "core") return true;
  if (area === "candidate-b") return candidate === "B";
  return false;
}

export function launchAreaForPath(pathname: string): LaunchArea {
  for (const [prefix, area] of areaPrefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return area;
  }
  return "core";
}

/**
 * Keeps only the navigation links whose area the launch candidate enables, so
 * menus never offer a page that the proxy answers with 404.
 */
export function launchVisibleLinks<T extends { readonly href: string }>(
  links: readonly T[],
  candidate: LaunchCandidate = launchCandidate(),
): T[] {
  return links.filter(({ href }) =>
    isLaunchAreaEnabled(launchAreaForPath(new URL(href, "http://launch.invalid").pathname), candidate));
}

/** Returns the requested tRPC procedure names that the launch candidate hides. */
export function hiddenTrpcProcedures(pathname: string, candidate: LaunchCandidate = launchCandidate()): string[] {
  if (!pathname.startsWith(trpcPrefix)) return [];
  let names: string[];
  try {
    names = decodeURIComponent(pathname.slice(trpcPrefix.length)).split(",");
  } catch {
    return [pathname];
  }
  return names.filter((name) => {
    const area = trpcRouterAreas[name.split(".")[0] ?? ""];
    return area !== undefined && !isLaunchAreaEnabled(area, candidate);
  });
}

export function isPathInLaunch(pathname: string, candidate: LaunchCandidate = launchCandidate()): boolean {
  return isLaunchAreaEnabled(launchAreaForPath(pathname), candidate)
    && hiddenTrpcProcedures(pathname, candidate).length === 0;
}
