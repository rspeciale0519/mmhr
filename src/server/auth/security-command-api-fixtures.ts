import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext,
} from "@/server/db/r1-migration-rehearsal";
import { enrollTestTotp } from "./permission-test-fixtures";

export type SecurityApiPrincipal = {
  subjectId: string;
  identityId: string;
  aal1: SupabaseClient;
  aal2: SupabaseClient | null;
};

const claimsSchema = z.object({
  sub: z.uuid(), session_id: z.uuid(), exp: z.number().int().positive(),
  aal: z.enum(["aal1", "aal2"]), role: z.literal("authenticated"),
});

export function apiCommandMetadata() {
  return { reason: "Disposable security command verification", idempotencyKey: randomUUID() };
}

export function elevatedClient(principal: SecurityApiPrincipal): SupabaseClient {
  if (!principal.aal2) throw new Error("The disposable principal has no AAL2 session");
  return principal.aal2;
}

export async function verifiedApiClaims(client: SupabaseClient, assurance: "aal1" | "aal2") {
  const response = await client.auth.getClaims();
  const parsed = claimsSchema.safeParse(response.data?.claims);
  if (response.error || !parsed.success || parsed.data.aal !== assurance || parsed.data.exp <= Date.now() / 1_000) {
    throw new Error("The disposable Auth session did not produce the required verified claims");
  }
  return { subjectId: parsed.data.sub, sessionId: parsed.data.session_id, expiresAt: new Date(parsed.data.exp * 1_000).toISOString() };
}

function requireScratchApi(context: RehearsalContext) {
  if (process.env.NODE_ENV !== "test" || process.env.R1_MIGRATION_REHEARSAL !== "1" || !context.api || !context.apiLoopbackOnly ||
    !/^mmhr-r1-commandapi-[0-9a-f]{8}$/.test(context.projectId)) {
    throw new Error("Security API fixtures require their isolated scratch project");
  }
  const api = new URL(context.api.url);
  const database = new URL(context.databaseUrl);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) ||
    api.port !== String(context.ports.api) || api.port === "56321" || api.username || api.password ||
    api.search || api.hash || api.pathname !== "/" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    database.port !== String(context.ports.database) || database.port === "56322") {
    throw new Error("Security API fixtures refused a non-scratch endpoint");
  }
  return context.api;
}

async function waitForCommandSchema(client: SupabaseClient) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await client.rpc("mmhr_change_identity_status", {
      target_identity_id: randomUUID(), status: "suspended", reason: "Check scratch schema availability",
      correlation_id: randomUUID(), idempotency_key: randomUUID(),
    });
    // This anonymous probe cannot write. A permission denial proves that the
    // schema cache recognizes the exact command after the migration reload.
    if (response.error?.code === "42501") return;
    if (response.error?.code !== "PGRST202") throw new Error("Scratch command schema readiness failed");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Scratch command schema did not become ready");
}

export async function createSecurityCommandApiFixtures() {
  const context = await startRehearsal("commandapi", { api: true });
  try {
    const api = requireScratchApi(context);
    const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
    const admin = createClient(api.url, api.adminKey, authOptions);
    const anonymous = createClient(api.url, api.publicKey, authOptions);
    const owner = context.client;
    await applyAllMigrations(context);
    await owner`NOTIFY pgrst, 'reload schema'`;
    await waitForCommandSchema(anonymous);

    async function createPrincipal(options: { mfa?: boolean; pending?: boolean } = {}): Promise<SecurityApiPrincipal> {
      const email = `scratch-command-${randomUUID()}@example.invalid`;
      const password = `Disposable-command-${randomUUID()}`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user?.email_confirmed_at || created.data.user.email !== email) {
        throw new Error("The disposable Auth user was not created with verified email");
      }
      const subjectId = created.data.user.id;
      const identityId = randomUUID();
      if (subjectId === identityId) throw new Error("The fixture must use distinct stable and Auth identifiers");
      await owner`
        INSERT INTO public.identities (
          id, auth_user_id, normalized_email, email_verified_at, status,
          activated_at, synchronized_at, migration_review_required
        ) VALUES (
          ${identityId}::uuid, ${subjectId}::uuid, ${email}, ${created.data.user.email_confirmed_at}::timestamptz,
          ${options.pending ? "pending" : "active"}::public.identity_status,
          ${options.pending ? null : new Date().toISOString()}::timestamptz, now(), false
        )
      `;
      async function signIn() {
        const client = createClient(api.url, api.publicKey, authOptions);
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error || result.data.user?.id !== subjectId || !result.data.session) {
          throw new Error("The disposable Auth sign-in failed");
        }
        const claims = await verifiedApiClaims(client, "aal1");
        if (claims.subjectId !== subjectId) throw new Error("The disposable Auth subject did not match");
        return client;
      }
      const aal1 = await signIn();
      let aal2: SupabaseClient | null = null;
      if (options.mfa) {
        aal2 = await signIn();
        await enrollTestTotp(aal2);
        await verifiedApiClaims(aal2, "aal2");
      }
      return { subjectId, identityId, aal1, aal2 };
    }

    const pair = [
      await createPrincipal({ mfa: true, pending: true }),
      await createPrincipal({ mfa: true, pending: true }),
    ] as const;
    await owner`
      SELECT mmhr_private.r1_prepare_super_admin_bootstrap(
        ${pair[0].identityId}::uuid, ${pair[1].identityId}::uuid,
        ${`product:${randomUUID()}`}, ${`security:${randomUUID()}`}, ${randomUUID()}::uuid
      )
    `;
    // These facts come from getClaims on actual scratch Auth sessions. Do not
    // substitute SQL-built auth rows, decoded unsigned tokens, or user inputs.
    const first = await verifiedApiClaims(elevatedClient(pair[0]), "aal2");
    const second = await verifiedApiClaims(elevatedClient(pair[1]), "aal2");
    await owner`
      SELECT mmhr_private.r1_complete_super_admin_bootstrap(
        ${first.subjectId}::uuid, ${first.sessionId}::uuid, ${first.expiresAt}::timestamptz,
        ${second.subjectId}::uuid, ${second.sessionId}::uuid, ${second.expiresAt}::timestamptz,
        ${randomUUID()}::uuid
      )
    `;

    const organizationAdmin = await createPrincipal({ mfa: true });
    const identityTarget = await createPrincipal();
    const membershipTarget = await createPrincipal();
    const outsider = await createPrincipal();
    const organizationId = randomUUID();
    const adminMembershipId = randomUUID();
    const targetMembershipId = randomUUID();
    await owner.begin(async (sql) => {
      await sql`
        INSERT INTO public.orgs (id, name, type, status, activated_at, migration_review_required)
        VALUES (${organizationId}::uuid, 'Disposable command organization', 'customer', 'active', now(), false)
      `;
      await sql`
        INSERT INTO public.org_members (id, org_id, identity_id, user_id, role, role_key, migration_review_required)
        VALUES (${adminMembershipId}::uuid, ${organizationId}::uuid, ${organizationAdmin.identityId}::uuid,
          ${organizationAdmin.subjectId}::uuid, 'admin', 'organization_admin', false),
          (${targetMembershipId}::uuid, ${organizationId}::uuid, ${membershipTarget.identityId}::uuid,
          ${membershipTarget.subjectId}::uuid, 'viewer', 'viewer', false)
      `;
      await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    });

    return {
      owner, anonymous, pair, organizationAdmin, identityTarget, membershipTarget, outsider,
      organizationId, adminMembershipId, targetMembershipId,
      projectId: context.projectId,
      isolation: { apiLoopbackOnly: context.apiLoopbackOnly, apiPort: context.ports.api, databasePort: context.ports.database },
      async close() { await stopRehearsal(context); },
    };
  } catch (error) {
    try { await stopRehearsal(context); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Scratch API setup and cleanup failed"); }
    throw error;
  }
}

export type SecurityCommandApiFixtures = Awaited<ReturnType<typeof createSecurityCommandApiFixtures>>;
