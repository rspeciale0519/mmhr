export type EntryPointKind =
  | "page"
  | "layout"
  | "boundary"
  | "middleware"
  | "route-handler"
  | "server-action"
  | "trpc-procedure"
  | "background-task"
  | "command"
  | "command-support"
  | "framework-hook";

export type EntryPointAccess =
  | "public"
  | "identity-only"
  | "temporary-deny"
  | "session-only"
  | "caller-only"
  | "privileged"
  | "internal-only"
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
        ? "public lead form; fixed DTO to exact-origin lead route; redacted status"
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
    access: "privileged",
    permission: "workspace.access or admin.access",
    scope: "selected organization or platform",
    dataPath: "authorized workspace shell",
    denialEvidence: "page guard and home page permission tests",
  },
  {
    key: "src/app/(app)/customer/layout.tsx#default",
    surface: "customer portal layout",
    kind: "layout",
    access: "privileged",
    permission: "portal.customer.access",
    scope: "selected organization",
    dataPath: "customer portal children after organization authorization",
    denialEvidence: "customer layout guard tests",
  },
  {
    key: "src/app/(app)/customer/page.tsx#default",
    surface: "/customer",
    kind: "page",
    access: "privileged",
    permission: "portal.customer.access",
    scope: "selected organization",
    dataPath: "customer portal shell",
    denialEvidence: "customer page and layout guard tests",
  },
  {
    key: "src/app/(app)/vendor/layout.tsx#default",
    surface: "vendor portal layout",
    kind: "layout",
    access: "privileged",
    permission: "portal.vendor.access",
    scope: "selected organization",
    dataPath: "vendor portal children after organization authorization",
    denialEvidence: "vendor layout guard tests",
  },
  {
    key: "src/app/(app)/vendor/page.tsx#default",
    surface: "/vendor",
    kind: "page",
    access: "privileged",
    permission: "portal.vendor.access",
    scope: "selected organization",
    dataPath: "vendor portal shell",
    denialEvidence: "vendor page and layout guard tests",
  },
  {
    key: "src/app/(admin)/admin/page.tsx#default",
    surface: "/admin",
    kind: "page",
    access: "privileged",
    permission: "admin.access",
    scope: "platform",
    dataPath: "authorized administration shell",
    denialEvidence: "page guard, forbidden response, and admin page permission tests",
  },
  {
    key: "src/app/(auth)/mfa/page.tsx#default",
    surface: "/mfa",
    kind: "page",
    access: "identity-only",
    permission: "none; Auth MFA enrollment",
    scope: "verified identity",
    dataPath: "Supabase Auth TOTP enrollment and challenge",
    denialEvidence: "MFA page guard and component tests",
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
    dataPath: "tRPC transport; no routed mutations; shared POST and exact-Origin mutation guard",
    denialEvidence: "inventory and transport tests; all exported mutation builders require POST and exact Origin",
  },
  {
    key: "src/app/api/leads/route.ts#POST",
    surface: "POST /api/leads",
    kind: "route-handler",
    access: "public",
    permission: "none; database command boundary",
    scope: "unassigned public lead",
    dataPath: "exact-origin POST; fixed lead DTO; redacted response",
    denialEvidence: "lead route boundary tests; SQL idempotency and audit contract",
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
    key: "scripts/r1-with-local-worker.mjs#command",
    surface: "R1 worker wrapper",
    kind: "command",
    access: "system-only",
    permission: "local migration owner role",
    scope: "loopback MMHR database",
    dataPath: "temporary worker login lifecycle; no application records",
    denialEvidence: "exact child-command, URL, role, expiry, and cleanup checks",
  },
  {
    key: "scripts/check-r1-integration-matrix.mjs#command",
    surface: "R1 integration matrix checker",
    kind: "command",
    access: "system-only",
    permission: "local repository read",
    scope: "checked-in integration test inventory",
    dataPath: "test file names only",
    denialEvidence: "deterministic allowlist comparison and command test",
  },
  {
    key: "scripts/r1-bootstrap-super-admin.mjs#command",
    surface: "local Super Admin bootstrap",
    kind: "command",
    access: "system-only",
    permission: "local loopback environment and two current AAL2 identities",
    scope: "local MMHR database only",
    dataPath: "bootstrap state and redacted completion status",
    denialEvidence: "local-only endpoint, input, claim, and single-use checks",
  },
  {
    key: "src/server/commands/security.ts#command",
    surface: "security command clients",
    kind: "command",
    access: "privileged",
    permission: "fixed command permission; current AAL2",
    scope: "platform or validated organization",
    dataPath: "caller JWT RPC; atomic mutation, audit, and receipt",
    denialEvidence: "security.test.ts; SQL command integration suites",
  },
  {
    key: "src/server/commands/security-inputs.ts#command",
    surface: "security input schemas",
    kind: "command-support",
    access: "internal-only",
    permission: "none; validation only",
    scope: "server command inputs",
    dataPath: "strict schemas; no database access",
    denialEvidence: "security-inputs.test.ts; no authority or RPC input",
  },
  {
    key: "src/server/commands/permission-administration.ts#command",
    surface: "permission administration read",
    kind: "command",
    access: "privileged",
    permission: "permissions.view and independent can_view ceiling; AAL2",
    scope: "exact permission key and record scope",
    dataPath: "caller JWT RPC; filtered administration metadata",
    denialEvidence: "permission-administration.test.ts; SQL read and ceiling tests",
  },
  {
    key: "src/server/commands/recovery.ts#command",
    surface: "recovery command clients",
    kind: "command",
    access: "caller-only",
    permission: "fixed recovery policy; AAL2 for approval and ending",
    scope: "verified caller and bound recovery reference",
    dataPath: "caller JWT RPC; server-memory reference; atomic audit and receipt",
    denialEvidence: "recovery.test.ts; recovery-presence.test.ts; SQL recovery tests",
  },
  {
    key: "src/server/commands/recovery-inputs.ts#command",
    surface: "recovery input schemas",
    kind: "command-support",
    access: "internal-only",
    permission: "none; validation only",
    scope: "server recovery inputs",
    dataPath: "strict schemas; no database access",
    denialEvidence: "recovery-inputs.test.ts; no caller identity or phone content input",
  },
  {
    key: "src/server/commands/recovery-receipt.ts#command",
    surface: "recovery receipt parser",
    kind: "command-support",
    access: "internal-only",
    permission: "none; validation only",
    scope: "fixed recovery command receipts",
    dataPath: "strict action and identifier allowlist; no database access",
    denialEvidence: "recovery.test.ts; rejects malformed and unexpected receipts",
  },
  {
    key: "src/server/commands/recovery-mfa.ts#command",
    surface: "recovery MFA command clients",
    kind: "command",
    access: "caller-only",
    permission: "fixed recovery context; fresh AAL2 for reactivation",
    scope: "verified caller and bound recovery session",
    dataPath: "caller JWT RPC; factor proof; atomic audit and receipt",
    denialEvidence: "recovery-mfa.test.ts; SQL recovery MFA tests",
  },
  {
    key: "src/server/commands/recovery-mfa-contract.ts#command",
    surface: "recovery MFA schemas and receipts",
    kind: "command-support",
    access: "internal-only",
    permission: "none; validation only",
    scope: "fixed recovery MFA inputs and responses",
    dataPath: "strict schemas and action allowlist; no database access",
    denialEvidence: "recovery-mfa-contract.test.ts; rejects extra authority inputs",
  },
  {
    key: "src/server/commands/lead-create.ts#command",
    surface: "lead create command",
    kind: "command",
    access: "public",
    permission: "none; fixed public capture contract",
    scope: "unassigned lead",
    dataPath: "strict DTO to mmhr_create_lead; idempotent result contract",
    denialEvidence: "lead-create.test.ts; database function validates, audits, and isolates records",
  },
  {
    key: "src/server/commands/invitation-administration.ts#command",
    surface: "invitation administration contract",
    kind: "command-support",
    access: "internal-only",
    permission: "organization invitation administration; current AAL2 required at the database command",
    scope: "one organization and invitation record",
    dataPath: "token-free invitation lifecycle plan; durable identity delivery intent",
    denialEvidence: "invitation-administration.test.ts; no direct database or provider access",
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
    key: "src/trigger/identity-admin-intents.ts#identity-admin-intents",
    surface: "identity-admin-intents",
    kind: "background-task",
    access: "system-only",
    permission: "restricted worker command allowlist",
    scope: "identity intent ledger",
    dataPath: "leased intent dispatch and redacted outcome counts",
    denialEvidence: "worker integration, Trigger configuration, and import-boundary tests",
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
