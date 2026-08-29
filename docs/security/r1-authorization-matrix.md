# R1 Authorization Matrix

## Control Record

| Field | Value |
|---|---|
| Status | R1.3 grants, RLS, and request-scoped access implemented on `feature/r1-request-scoped-rls` |
| Date | 2026-08-28 |
| Source registry | `src/server/auth/entry-point-inventory.ts` |
| Completeness test | `src/server/auth/entry-point-inventory.test.ts` |
| Identity guard | `src/server/auth/verified-identity.ts` |
| Recovery | Keep protected routes denied. Add a deny-all change before any rollback. |

This matrix records each application entry point that can expose, change, or process application data.

It also records the current framework monitoring hooks.

The R0 public-release gate remains separate from authorization.

Middleware refreshes sessions. It does not grant route access.

## Response Contract

| Condition | Response |
|---|---|
| Missing, invalid, or expired identity | Redirect to `/sign-in` before protected content renders |
| Verified identity at `/home` | Show pending access only |
| Verified identity at `/admin` | Return the generic 403 response |
| Inaccessible future resource identifier | Return the generic not-found response |
| Public content | Apply R0 release control, but no R1 permission gate |

`getClaims()` supplies the verified subject.

Claims do not prove identity state, organization membership, permission, or authentication assurance.

R1.3 adds stored-state checks before protected data access opens. R1.4 still owns route permissions.

## Validation Evidence

The unit suite covers identity parsing, direct guards, tRPC denial, entry discovery, and exact-origin Server Actions.

The local integration suite rejects malformed and tampered expired tokens against the MMHR Supabase stack.

Local HTTP checks redirected malformed and expired cookie requests for `/home` and `/admin` to `/sign-in`.

Browser checks proved sign-up, pending access, sign-out, sign-in, and the authenticated 403 response.

The browser extension produced unrelated message-channel errors during one sign-up check.

## Entry Point Inventory

| Key | Surface | Kind | Access | Permission | Scope | Data path | Denial evidence |
|---|---|---|---|---|---|---|---|
| `src/app/(marketing)/(site)/page.tsx#default` | / | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/about/page.tsx#default` | /about | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/blog/page.tsx#default` | /blog | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/blog/[slug]/page.tsx#default` | /blog/[slug] | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/broker-model/page.tsx#default` | /broker-model | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/case-studies/page.tsx#default` | /case-studies | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/case-studies/[slug]/page.tsx#default` | /case-studies/[slug] | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/contact/page.tsx#default` | /contact | page | public | none | none | disabled form; no submission handler | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/faq/page.tsx#default` | /faq | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/partners/brokers-consultants/page.tsx#default` | /partners/brokers-consultants | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/partners/pe-vc/page.tsx#default` | /partners/pe-vc | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/partners/software-vendors/page.tsx#default` | /partners/software-vendors | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/platform/page.tsx#default` | /platform | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/privacy/page.tsx#default` | /privacy | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/page.tsx#default` | /resources | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/hris-landscape-report/page.tsx#default` | /resources/hris-landscape-report | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/partner-finder/page.tsx#default` | /resources/partner-finder | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/requirements-builder/page.tsx#default` | /resources/requirements-builder | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/services/page.tsx#default` | /services | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/terms/page.tsx#default` | /terms | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/transparency/page.tsx#default` | /transparency | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/designs/page.tsx#default` | /designs | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/designs/[slug]/page.tsx#default` | /designs/[slug] | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(auth)/sign-in/page.tsx#default` | /sign-in | page | public | none | none | Supabase Auth sign-in form | public by R1 contract |
| `src/app/(auth)/sign-up/page.tsx#default` | /sign-up | page | public | none | none | Supabase Auth sign-up form | public identity creation; protected access stays denied |
| `src/app/(app)/home/page.tsx#default` | /home | page | identity-only | R1.4 permission checks pending | verified identity | pending-access response only | page guard and home page tests |
| `src/app/(admin)/admin/page.tsx#default` | /admin | page | temporary-deny | R1.4 admin.access check pending | platform | none | page guard, forbidden response, and admin page tests |
| `src/app/layout.tsx#default` | root layout | layout | public | none | none | shared presentation providers | authorization remains at each protected entry point |
| `src/app/(marketing)/(site)/layout.tsx#default` | marketing layout | layout | public | none | none | public site chrome | R0 release gate |
| `src/app/global-error.tsx#default` | global error | boundary | framework | none | none | redacted error response and Sentry event | does not return protected records |
| `src/app/forbidden.tsx#default` | 403 boundary | boundary | framework | none | none | generic forbidden response | Next.js forbidden response |
| `src/app/not-found.tsx#default` | 404 boundary | boundary | framework | none | none | generic not-found response | does not reveal resource existence |
| `src/middleware.ts#middleware` | all matched requests | middleware | framework | none | none | R0 release gate, GALLERY_ONLY routing, Server Action validation, session refresh | middleware tests; never the authorization boundary |
| `src/app/api/trpc/[trpc]/route.ts#GET` | GET /api/trpc/* | route-handler | public | procedure-defined | procedure-defined | tRPC query transport | each procedure owns its identity or permission test |
| `src/app/api/trpc/[trpc]/route.ts#POST` | POST /api/trpc/* | route-handler | public | procedure-defined | procedure-defined | tRPC query transport; zero mutations in R1.1 | inventory test blocks unrecorded procedures and mutations |
| `src/app/(auth)/actions.ts#signUp` | signUp | server-action | public | none | none | Supabase Auth identity creation | exact-origin guard and direct-action tests |
| `src/app/(auth)/actions.ts#signIn` | signIn | server-action | public | none | none | Supabase Auth session creation | exact-origin guard and direct-action tests |
| `src/app/(auth)/actions.ts#signOut` | signOut | server-action | caller-only | none | caller session | Supabase Auth session cleanup | exact-origin guard and direct-action tests |
| `src/server/trpc/routers/health.ts#ping` | health.ping | trpc-procedure | public | none | none | liveness constant | public by R1 contract |
| `src/server/trpc/routers/health.ts#whoami` | health.whoami | trpc-procedure | identity-only | none | verified identity | caller subject identifier only | identityProcedure and direct-call tests |
| `scripts/r1-with-local-worker.mjs#command` | R1 worker wrapper | command | system-only | local migration owner role | loopback MMHR database | temporary worker login lifecycle; no application records | exact child-command, URL, role, expiry, and cleanup checks |
| `src/trigger/health.ts#health-check` | health-check | background-task | system-only | provider invocation control | Trigger.dev project | liveness log and constant response | no application data access |
| `src/instrumentation.ts#register` | server instrumentation registration | framework-hook | framework | none | server runtime | loads the matching Sentry server configuration | no request identity or application data access |
| `src/instrumentation.ts#onRequestError` | server request error capture | framework-hook | framework | none | server runtime | Sentry error event when monitoring is configured | generic error boundary and disabled replay |
| `src/instrumentation-client.ts#module` | client instrumentation initialization | framework-hook | framework | none | browser runtime | Sentry client setup when a public DSN exists | disabled without a DSN; session replay remains off |
| `src/instrumentation-client.ts#onRouterTransitionStart` | client route-transition capture | framework-hook | framework | none | browser runtime | Sentry route-transition event when monitoring is configured | disabled without a DSN; session replay remains off |

## Empty Entry Classes

The current source contains no tRPC mutation, webhook, export handler, download handler, provider callback, cron route, domain command, or bootstrap command.

The current application request path does not import the direct Drizzle pool.

Request-scoped data access uses `src/server/auth/request-scoped.ts` and fixed
Supabase functions. It validates the token, active identity, and selected
active organization before returning a client.

These empty classes do not authorize future entries.

The completeness test must change with the implementation that adds an entry.

## Origin and Method Controls

Middleware rejects a `Next-Action` request unless it uses `POST` and the exact configured origin.

Each current Server Action repeats the exact-origin check before it reads input or changes a cookie.

Tests reject unsafe methods, missing origins, foreign origins, and direct action execution.

`next.config.ts` adds no `serverActions.allowedOrigins` value.

The current tRPC routers contain zero mutations.

The tRPC Route Handler exports only `GET` and `POST`.

R1.4 must apply an exact-origin guard before it adds a cookie-authenticated tRPC mutation or Route Handler command.

The local canonical origin and Auth site URL use `http://localhost:3000`.

`http://127.0.0.1:3000` remains an Auth redirect for command-line checks.

It is not a trusted Server Action origin.

## Impersonation and Unsafe Identity Sources

A manual review found no current impersonation entry point or actor-override input.

The source contract scans application code, executable configuration, workflows, and command directories for prohibited inputs.

This targeted scan is a regression control. It does not replace review of each new entry point.

The same test rejects authorization through `supabase.auth.getSession()`.

FR-IAM-08 remains Deferred.

## Current Risks and Recovery

All current application tables have explicit deny policies for `anon` and `authenticated`.

The direct Drizzle pool can bypass RLS.

No current application request imports that pool.

The 403 boundary uses the experimental Next.js `authInterrupts` setting.

Each target environment must set `NEXT_PUBLIC_APP_URL` to its one canonical origin before sign-in opens.

Keep `/home` pending and `/admin` denied until stored permission checks and RLS evidence pass.

If this control fails, add a deny-all route change before a rollback.

Do not bypass the guard.

No schema or data recovery is required for R1.1.
