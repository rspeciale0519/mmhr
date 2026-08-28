export type EntryPointKind =
  | "page"
  | "layout"
  | "boundary"
  | "middleware"
  | "route-handler"
  | "server-action"
  | "trpc-procedure"
  | "background-task"
  | "framework-hook";

export type EntryPointAccess =
  | "public"
  | "identity-only"
  | "temporary-deny"
  | "session-only"
  | "caller-only"
  | "system-only"
  | "framework";

export type EntryPointInventoryRecord = {
  key: string;
  surface: string;
  kind: EntryPointKind;
  access: EntryPointAccess;
  permission: string;
  scope: string;
  dataPath: string;
  denialEvidence: string;
};

const publicContentPages = [
  ["/", "src/app/(marketing)/(site)/page.tsx"],
  ["/about", "src/app/(marketing)/(site)/about/page.tsx"],
  ["/blog", "src/app/(marketing)/(site)/blog/page.tsx"],
  ["/blog/[slug]", "src/app/(marketing)/(site)/blog/[slug]/page.tsx"],
  ["/broker-model", "src/app/(marketing)/(site)/broker-model/page.tsx"],
  ["/case-studies", "src/app/(marketing)/(site)/case-studies/page.tsx"],
  [
    "/case-studies/[slug]",
    "src/app/(marketing)/(site)/case-studies/[slug]/page.tsx",
  ],
  ["/contact", "src/app/(marketing)/(site)/contact/page.tsx"],
  ["/faq", "src/app/(marketing)/(site)/faq/page.tsx"],
  [
    "/partners/brokers-consultants",
    "src/app/(marketing)/(site)/partners/brokers-consultants/page.tsx",
  ],
  [
    "/partners/pe-vc",
    "src/app/(marketing)/(site)/partners/pe-vc/page.tsx",
  ],
  [
    "/partners/software-vendors",
    "src/app/(marketing)/(site)/partners/software-vendors/page.tsx",
  ],
  ["/platform", "src/app/(marketing)/(site)/platform/page.tsx"],
  ["/privacy", "src/app/(marketing)/(site)/privacy/page.tsx"],
  ["/resources", "src/app/(marketing)/(site)/resources/page.tsx"],
  [
    "/resources/hris-landscape-report",
    "src/app/(marketing)/(site)/resources/hris-landscape-report/page.tsx",
  ],
  [
    "/resources/partner-finder",
    "src/app/(marketing)/(site)/resources/partner-finder/page.tsx",
  ],
  [
    "/resources/requirements-builder",
    "src/app/(marketing)/(site)/resources/requirements-builder/page.tsx",
  ],
  ["/services", "src/app/(marketing)/(site)/services/page.tsx"],
  ["/terms", "src/app/(marketing)/(site)/terms/page.tsx"],
  ["/transparency", "src/app/(marketing)/(site)/transparency/page.tsx"],
  ["/designs", "src/app/(marketing)/designs/page.tsx"],
  ["/designs/[slug]", "src/app/(marketing)/designs/[slug]/page.tsx"],
] as const;

const checkedInContentPages: EntryPointInventoryRecord[] =
  publicContentPages.map(([surface, source]) => ({
    key: `${source}#default`,
    surface,
    kind: "page",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath:
      surface === "/contact"
        ? "disabled form; no submission handler"
        : "checked-in public content",
    denialEvidence: "R0 release gate; no R1 permission gate",
  }));

export const entryPointInventory: readonly EntryPointInventoryRecord[] = [
  ...checkedInContentPages,
  {
    key: "src/app/(auth)/sign-in/page.tsx#default",
    surface: "/sign-in",
    kind: "page",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath: "Supabase Auth sign-in form",
    denialEvidence: "public by R1 contract",
  },
  {
    key: "src/app/(auth)/sign-up/page.tsx#default",
    surface: "/sign-up",
    kind: "page",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath: "Supabase Auth sign-up form",
    denialEvidence: "public identity creation; protected access stays denied",
  },
  {
    key: "src/app/(app)/home/page.tsx#default",
    surface: "/home",
    kind: "page",
    access: "identity-only",
    permission: "R1.4 permission checks pending",
    scope: "verified identity",
    dataPath: "pending-access response only",
    denialEvidence: "page guard and home page tests",
  },
  {
    key: "src/app/(admin)/admin/page.tsx#default",
    surface: "/admin",
    kind: "page",
    access: "temporary-deny",
    permission: "R1.4 admin.access check pending",
    scope: "platform",
    dataPath: "none",
    denialEvidence: "page guard, forbidden response, and admin page tests",
  },
  {
    key: "src/app/layout.tsx#default",
    surface: "root layout",
    kind: "layout",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath: "shared presentation providers",
    denialEvidence: "authorization remains at each protected entry point",
  },
  {
    key: "src/app/(marketing)/(site)/layout.tsx#default",
    surface: "marketing layout",
    kind: "layout",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath: "public site chrome",
    denialEvidence: "R0 release gate",
  },
  {
    key: "src/app/global-error.tsx#default",
    surface: "global error",
    kind: "boundary",
    access: "framework",
    permission: "none",
    scope: "none",
    dataPath: "redacted error response and Sentry event",
    denialEvidence: "does not return protected records",
  },
  {
    key: "src/app/forbidden.tsx#default",
    surface: "403 boundary",
    kind: "boundary",
    access: "framework",
    permission: "none",
    scope: "none",
    dataPath: "generic forbidden response",
    denialEvidence: "Next.js forbidden response",
  },
  {
    key: "src/app/not-found.tsx#default",
    surface: "404 boundary",
    kind: "boundary",
    access: "framework",
    permission: "none",
    scope: "none",
    dataPath: "generic not-found response",
    denialEvidence: "does not reveal resource existence",
  },
  {
    key: "src/middleware.ts#middleware",
    surface: "all matched requests",
    kind: "middleware",
    access: "framework",
    permission: "none",
    scope: "none",
    dataPath:
      "R0 release gate, GALLERY_ONLY routing, Server Action validation, session refresh",
    denialEvidence: "middleware tests; never the authorization boundary",
  },
  {
    key: "src/app/api/trpc/[trpc]/route.ts#GET",
    surface: "GET /api/trpc/*",
    kind: "route-handler",
    access: "public",
    permission: "procedure-defined",
    scope: "procedure-defined",
    dataPath: "tRPC query transport",
    denialEvidence: "each procedure owns its identity or permission test",
  },
  {
    key: "src/app/api/trpc/[trpc]/route.ts#POST",
    surface: "POST /api/trpc/*",
    kind: "route-handler",
    access: "public",
    permission: "procedure-defined",
    scope: "procedure-defined",
    dataPath: "tRPC query transport; zero mutations in R1.1",
    denialEvidence: "inventory test blocks unrecorded procedures and mutations",
  },
  {
    key: "src/app/(auth)/actions.ts#signUp",
    surface: "signUp",
    kind: "server-action",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath: "Supabase Auth identity creation",
    denialEvidence: "exact-origin guard and direct-action tests",
  },
  {
    key: "src/app/(auth)/actions.ts#signIn",
    surface: "signIn",
    kind: "server-action",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath: "Supabase Auth session creation",
    denialEvidence: "exact-origin guard and direct-action tests",
  },
  {
    key: "src/app/(auth)/actions.ts#signOut",
    surface: "signOut",
    kind: "server-action",
    access: "caller-only",
    permission: "none",
    scope: "caller session",
    dataPath: "Supabase Auth session cleanup",
    denialEvidence: "exact-origin guard and direct-action tests",
  },
  {
    key: "src/server/trpc/routers/health.ts#ping",
    surface: "health.ping",
    kind: "trpc-procedure",
    access: "public",
    permission: "none",
    scope: "none",
    dataPath: "liveness constant",
    denialEvidence: "public by R1 contract",
  },
  {
    key: "src/server/trpc/routers/health.ts#whoami",
    surface: "health.whoami",
    kind: "trpc-procedure",
    access: "identity-only",
    permission: "none",
    scope: "verified identity",
    dataPath: "caller subject identifier only",
    denialEvidence: "identityProcedure and direct-call tests",
  },
  {
    key: "src/trigger/health.ts#health-check",
    surface: "health-check",
    kind: "background-task",
    access: "system-only",
    permission: "provider invocation control",
    scope: "Trigger.dev project",
    dataPath: "liveness log and constant response",
    denialEvidence: "no application data access",
  },
  {
    key: "src/instrumentation.ts#register",
    surface: "server instrumentation registration",
    kind: "framework-hook",
    access: "framework",
    permission: "none",
    scope: "server runtime",
    dataPath: "loads the matching Sentry server configuration",
    denialEvidence: "no request identity or application data access",
  },
  {
    key: "src/instrumentation.ts#onRequestError",
    surface: "server request error capture",
    kind: "framework-hook",
    access: "framework",
    permission: "none",
    scope: "server runtime",
    dataPath: "Sentry error event when monitoring is configured",
    denialEvidence: "generic error boundary and disabled replay",
  },
  {
    key: "src/instrumentation-client.ts#module",
    surface: "client instrumentation initialization",
    kind: "framework-hook",
    access: "framework",
    permission: "none",
    scope: "browser runtime",
    dataPath: "Sentry client setup when a public DSN exists",
    denialEvidence: "disabled without a DSN; session replay remains off",
  },
  {
    key: "src/instrumentation-client.ts#onRouterTransitionStart",
    surface: "client route-transition capture",
    kind: "framework-hook",
    access: "framework",
    permission: "none",
    scope: "browser runtime",
    dataPath: "Sentry route-transition event when monitoring is configured",
    denialEvidence: "disabled without a DSN; session replay remains off",
  },
];

function escapeMarkdownCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderEntryPointInventoryTable(): string {
  const header = [
    "| Key | Surface | Kind | Access | Permission | Scope | Data path | Denial evidence |",
    "|---|---|---|---|---|---|---|---|",
  ];
  const rows = entryPointInventory.map(
    (entry) =>
      `| \`${entry.key}\` | ${escapeMarkdownCell(entry.surface)} | ${entry.kind} | ${entry.access} | ${escapeMarkdownCell(entry.permission)} | ${escapeMarkdownCell(entry.scope)} | ${escapeMarkdownCell(entry.dataPath)} | ${escapeMarkdownCell(entry.denialEvidence)} |`,
  );

  return [...header, ...rows].join("\n");
}
