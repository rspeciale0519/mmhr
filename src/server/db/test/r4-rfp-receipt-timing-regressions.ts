import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { elevatedClient, verifiedApiClaims,
  type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { rfpReceiptPageSchema, type RfpReceiptCommand } from "@/lib/rfp-receipt";
import { readReceiptTimingPolicy, receiptTimingHttp, receiptTimingQuery,
  waitForReceiptTiming, withReceiptTimingRestoration } from "./r4-rfp-receipt-timing-controls";

type Surface = "fresh confirmation" | "exact replay" | "vendor status" | "staff status" | "customer status";
type Target = { recipientId: string; rfpVersionId: string };
type Dependencies = {
  fixture(): SecurityCommandApiFixtures;
  vendorOrganizationId(): string;
  intakeId(): string;
  freshRequest(): Promise<Target>;
  input(target: Target): RfpReceiptCommand;
  snapshot(): Promise<unknown>;
};
const surfaces = ["fresh confirmation", "exact replay", "vendor status", "staff status", "customer status"] as const;

// These owner-created rows are isolated fixture prerequisites. Real Auth RPCs authorize every tested request.
export function registerReceiptTimingRegressions(d: Dependencies) {
  async function caller(surface: Surface) {
    const fixture = d.fixture(), actor = await fixture.createSyntheticPrincipal({ mfa: true });
    const view = surface === "staff status" ? "staff" : surface === "customer status" ? "customer" : "vendor";
    const organizationId = view === "vendor" ? d.vendorOrganizationId() : fixture.organizationId;
    const client = view === "staff" ? elevatedClient(actor) : actor.aal1;
    const assurance = view === "staff" ? "aal2" : "aal1";
    const claims = await verifiedApiClaims(client, assurance);
    await receiptTimingQuery(fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${organizationId}::uuid,${actor.identityId}::uuid,${actor.subjectId}::uuid,'contributor','contributor',false)`, "caller membership");
    const [assignment] = await receiptTimingQuery(fixture.owner<{ id: string }[]>`INSERT INTO public.platform_role_assignments
      (identity_id,role_key,assigned_at,assignment_reason)
      VALUES(${actor.identityId}::uuid,'staff',clock_timestamp(),'Synthetic receipt timing prerequisite') RETURNING id`, "caller staff assignment");
    await receiptTimingQuery(fixture.owner`INSERT INTO public.role_authority_records
      (record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
      SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
      FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
      WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`, "caller assignment authority");
    const [override] = await receiptTimingQuery(fixture.owner<{ id: string }[]>`INSERT INTO public.user_permission_overrides
      (identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${actor.identityId}::uuid,'workspace.access','organization',${organizationId}::uuid,
        ${"organization:" + organizationId},'allow',${fixture.pair[0].identityId}::uuid,'Synthetic sole workspace timing prerequisite')
      RETURNING id`, "caller workspace prerequisite");
    // The active staff role has admin.access, but rfp.distribute belongs to the reviewed super_admin role.
    if (view === "staff") await receiptTimingQuery(fixture.owner`INSERT INTO public.user_permission_overrides
      (identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${actor.identityId}::uuid,'rfp.distribute','organization',${organizationId}::uuid,
        ${"organization:" + organizationId},'allow',${fixture.pair[0].identityId}::uuid,'Synthetic receipt read permission prerequisite')`, "staff receipt permission prerequisite");
    return { actor, view, organizationId, client, assurance, claims, overrideId: override!.id };
  }
  function operation(surface: Surface, value: Awaited<ReturnType<typeof caller>>, request: RfpReceiptCommand) {
    const correlationId = randomUUID();
    const payload = { organizationId: value.organizationId, view: value.view,
      ...(value.view === "vendor" ? {} : { intakeId: d.intakeId() }) };
    const command = surface === "fresh confirmation" || surface === "exact replay";
    const rpc = command ? "mmhr_confirm_rfp_receipt" : "mmhr_get_rfp_receipt_status";
    return { rpc, invoke: (signal: AbortSignal) => value.client.rpc(rpc, command
      ? { payload: request, correlation_id: request.correlationId, idempotency_key: request.idempotencyKey }
      : { payload, correlation_id: correlationId }).abortSignal(signal) };
  }
  async function workspace(value: Awaited<ReturnType<typeof caller>>) {
    const [row] = await receiptTimingQuery(d.fixture().owner<{ allowed: boolean }[]>`SELECT mmhr_private.r1_evaluate_permission(
      ${value.actor.identityId}::uuid,'workspace.access',${value.organizationId}::uuid,
      ${value.assurance},clock_timestamp(),false) allowed`, "current workspace proof");
    return row!.allowed;
  }
  async function ready(surface: Surface) {
    const value = await caller(surface), target = await d.freshRequest(), request = d.input(target);
    const policy = await readReceiptTimingPolicy(d.fixture(), value.client);
    // Validate the same current permission through the real protected API before injecting a fault.
    const permission = value.view === "staff" ? "rfp.distribute" : "portal." + value.view + ".access";
    const authorized = await receiptTimingHttp(signal => value.client.rpc("mmhr_authorize",
      { permission_key: permission, organization_id: value.organizationId }).abortSignal(signal), policy.requestMs);
    expect(authorized.error).toBeNull();
    expect(authorized.data).toEqual([expect.objectContaining({ identity_id: value.actor.identityId,
      authorized_organization_id: value.organizationId, assurance: value.assurance })]);
    expect(await workspace(value)).toBe(true);
    if (surface === "exact replay") {
      const recorded = await receiptTimingHttp(signal => operation(surface, value, request).invoke(signal), policy.requestMs);
      expect(recorded.error).toBeNull();
      expect(recorded.data).toMatchObject({ confirmationId: request.confirmationId, recipientId: target.recipientId,
        rfpVersionId: target.rfpVersionId, state: "acknowledged" });
    } else {
      let cursor: string | null = null, found = false;
      const allIds = new Set<string>();
      for (let index = 0; index < 100; index++) {
        const correlationId = randomUUID();
        const result = await receiptTimingHttp(signal => value.client.rpc("mmhr_get_rfp_receipt_status", {
          payload: { organizationId: value.organizationId, view: value.view,
            ...(value.view === "vendor" ? {} : { intakeId: d.intakeId() }), ...(cursor ? { afterId: cursor } : {}) },
          correlation_id: correlationId }).abortSignal(signal), policy.requestMs);
        expect(result.error).toBeNull();
        const page = rfpReceiptPageSchema.parse(result.data);
        expect(page.items.every((row, position) => (position === 0 || row.recipientId > page.items[position - 1]!.recipientId)
          && (!cursor || row.recipientId > cursor))).toBe(true);
        for (const row of page.items) {
          expect(allIds.has(row.recipientId)).toBe(false); allIds.add(row.recipientId);
          if (row.recipientId === target.recipientId) {
            found = true; if (value.view === "vendor") expect(row.canConfirm).toBe(true);
          }
        }
        if (!page.nextCursor) break;
        expect(page.items.length).toBeGreaterThan(0); expect(page.nextCursor).toBe(page.items.at(-1)!.recipientId);
        if (cursor) expect(page.nextCursor > cursor).toBe(true);
        cursor = page.nextCursor;
        if (index === 99) throw new Error("Receipt timing prerequisite exceeded 100 pages");
      }
      expect(found).toBe(true);
    }
    return { value, request, policy, before: await d.snapshot() };
  }
  async function denial(response: { data: unknown; error: { code?: string } | null }, before: unknown) {
    expect(response.error?.code).toBe("42501"); expect(response.data).toBeNull();
    expect(await d.snapshot()).toEqual(before);
  }
  test.each(surfaces)("denies %s when sole workspace authority expires during an observed security lock wait", async surface => {
    const { value, request, policy, before } = await ready(surface);
    await withReceiptTimingRestoration(async () => {
      const [expiry] = await receiptTimingQuery(d.fixture().owner<{ at: string }[]>`UPDATE public.user_permission_overrides
        SET expires_at=clock_timestamp()+${policy.expiryMs}*interval '1 millisecond'
        WHERE id=${value.overrideId}::uuid RETURNING expires_at::text at`, "workspace expiry setup");
      const result = await waitForReceiptTiming(d.fixture(), operation(surface, value, request), expiry!.at, policy);
      await denial(result, before); expect(await workspace(value)).toBe(false);
    }, async () => {
      const rows = await receiptTimingQuery(d.fixture().owner<{ restored: boolean }[]>`UPDATE public.user_permission_overrides
        SET expires_at=NULL WHERE id=${value.overrideId}::uuid RETURNING expires_at IS NULL restored`, "workspace restoration");
      expect(rows).toEqual([{ restored: true }]); expect(await workspace(value)).toBe(true);
    });
  }, 120000);
  test.each(surfaces)("denies %s when the genuine session expires during an observed security lock wait", async surface => {
    const { value, request, policy, before } = await ready(surface);
    const [prior] = await receiptTimingQuery(d.fixture().owner<{ at: string | null }[]>`SELECT not_after::text at
      FROM auth.sessions WHERE id=${value.claims.sessionId}::uuid AND user_id=${value.actor.subjectId}::uuid`, "original session deadline");
    expect(prior).toBeDefined();
    await withReceiptTimingRestoration(async () => {
      const [expiry] = await receiptTimingQuery(d.fixture().owner<{ at: string }[]>`UPDATE auth.sessions
        SET not_after=clock_timestamp()+${policy.expiryMs}*interval '1 millisecond'
        WHERE id=${value.claims.sessionId}::uuid AND user_id=${value.actor.subjectId}::uuid RETURNING not_after::text at`, "session expiry setup");
      const result = await waitForReceiptTiming(d.fixture(), operation(surface, value, request), expiry!.at, policy);
      await denial(result, before);
    }, async () => {
      const rows = await receiptTimingQuery(d.fixture().owner<{ restored: boolean }[]>`UPDATE auth.sessions
        SET not_after=${prior!.at}::timestamptz WHERE id=${value.claims.sessionId}::uuid AND user_id=${value.actor.subjectId}::uuid
        RETURNING not_after IS NOT DISTINCT FROM ${prior!.at}::timestamptz restored`, "session restoration");
      expect(rows).toEqual([{ restored: true }]);
    });
  }, 120000);
  test.each(surfaces)("denies %s when membership is suspended after observed API admission", async surface => {
    const { value, request, policy, before } = await ready(surface);
    const [expiry] = await receiptTimingQuery(d.fixture().owner<{ at: string }[]>`SELECT
      (clock_timestamp()+${policy.expiryMs}*interval '1 millisecond')::text at`, "revocation observation boundary");
    // Owner fault injection models a concurrent authority change. It grants no application capability.
    await withReceiptTimingRestoration(async () => {
      const result = await waitForReceiptTiming(d.fixture(), operation(surface, value, request), expiry!.at, policy, async () => {
        const rows = await receiptTimingQuery(d.fixture().owner<{ status: string }[]>`UPDATE public.org_members SET status='suspended',suspended_at=clock_timestamp()
          WHERE org_id=${value.organizationId}::uuid AND identity_id=${value.actor.identityId}::uuid RETURNING status::text`, "membership loss", 1000);
        expect(rows).toEqual([{ status: "suspended" }]);
      });
      await denial(result, before); expect(await workspace(value)).toBe(false);
    }, async () => {
      const rows = await receiptTimingQuery(d.fixture().owner<{ status: string }[]>`UPDATE public.org_members SET status='active',suspended_at=NULL
        WHERE org_id=${value.organizationId}::uuid AND identity_id=${value.actor.identityId}::uuid RETURNING status::text`, "membership restoration");
      expect(rows).toEqual([{ status: "active" }]); expect(await workspace(value)).toBe(true);
    });
  }, 120000);
  test.each(["fresh confirmation", "exact replay"] as const)("denies %s when workspace authority expires at the later recipient row lock", async surface => {
    const { value, request, policy, before } = await ready(surface);
    await withReceiptTimingRestoration(async () => {
      const [expiry] = await receiptTimingQuery(d.fixture().owner<{ at: string }[]>`UPDATE public.user_permission_overrides
        SET expires_at=clock_timestamp()+${policy.expiryMs}*interval '1 millisecond'
        WHERE id=${value.overrideId}::uuid RETURNING expires_at::text at`, "later recipient workspace expiry");
      const result = await waitForReceiptTiming(d.fixture(), operation(surface, value, request), expiry!.at, policy,
        undefined, request.recipientId);
      await denial(result, before); expect(await workspace(value)).toBe(false);
    }, async () => {
      const rows = await receiptTimingQuery(d.fixture().owner<{ restored: boolean }[]>`UPDATE public.user_permission_overrides
        SET expires_at=NULL WHERE id=${value.overrideId}::uuid RETURNING expires_at IS NULL restored`, "later recipient workspace restoration");
      expect(rows).toEqual([{ restored: true }]); expect(await workspace(value)).toBe(true);
    });
  }, 120000);
  test.each(["fresh confirmation", "exact replay"] as const)("denies %s when the genuine session expires at the later recipient row lock", async surface => {
    const { value, request, policy, before } = await ready(surface);
    const [prior] = await receiptTimingQuery(d.fixture().owner<{ at: string | null }[]>`SELECT not_after::text at
      FROM auth.sessions WHERE id=${value.claims.sessionId}::uuid AND user_id=${value.actor.subjectId}::uuid`, "later recipient original session");
    expect(prior).toBeDefined();
    await withReceiptTimingRestoration(async () => {
      const [expiry] = await receiptTimingQuery(d.fixture().owner<{ at: string }[]>`UPDATE auth.sessions
        SET not_after=clock_timestamp()+${policy.expiryMs}*interval '1 millisecond'
        WHERE id=${value.claims.sessionId}::uuid AND user_id=${value.actor.subjectId}::uuid RETURNING not_after::text at`, "later recipient session expiry");
      const result = await waitForReceiptTiming(d.fixture(), operation(surface, value, request), expiry!.at, policy,
        undefined, request.recipientId);
      await denial(result, before);
    }, async () => {
      const rows = await receiptTimingQuery(d.fixture().owner<{ restored: boolean }[]>`UPDATE auth.sessions
        SET not_after=${prior!.at}::timestamptz WHERE id=${value.claims.sessionId}::uuid AND user_id=${value.actor.subjectId}::uuid
        RETURNING not_after IS NOT DISTINCT FROM ${prior!.at}::timestamptz restored`, "later recipient session restoration");
      expect(rows).toEqual([{ restored: true }]);
    });
  }, 120000);
  // These calls use genuine verified claims and the authenticated database role.
  // They prove the SQL isolation boundary; they do not represent PostgREST dispatch.
  test.each(surfaces.flatMap(surface => ["repeatable read", "serializable"].map(isolation => ({ surface, isolation }))))(
    "denies $surface under $isolation isolation with exact rollback", async ({ surface, isolation }) => {
      const { value, request, policy, before } = await ready(surface);
      const claims = await value.client.auth.getClaims();
      expect(claims.error).toBeNull(); expect(claims.data?.claims).toBeDefined();
      let cancelCurrent: () => void = () => {};
      const transaction = d.fixture().owner.begin(async sql => {
        const boundary = isolation === "repeatable read" ? sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`
          : sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;
        cancelCurrent = () => boundary.cancel(); await receiptTimingQuery(boundary, "isolation boundary");
        const context = sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims.data!.claims)},true)`;
        cancelCurrent = () => context.cancel(); await receiptTimingQuery(context, "genuine isolation claims");
        const role = sql`SET LOCAL ROLE authenticated`;
        cancelCurrent = () => role.cancel(); await receiptTimingQuery(role, "isolated authenticated role");
        const protectedCall = surface === "fresh confirmation" || surface === "exact replay"
          ? sql`SELECT public.mmhr_confirm_rfp_receipt(${JSON.stringify(request)}::jsonb,${request.correlationId}::uuid,${request.idempotencyKey}::uuid)`
          : sql`SELECT public.mmhr_get_rfp_receipt_status(${JSON.stringify({ organizationId: value.organizationId, view: value.view,
            ...(value.view === "vendor" ? {} : { intakeId: d.intakeId() }) })}::jsonb,${randomUUID()}::uuid)`;
        cancelCurrent = () => protectedCall.cancel(); await receiptTimingQuery(protectedCall, "unsupported isolation protected call");
        // An unexpected success must roll back before it fails the denial assertion.
        throw new Error("Unsupported receipt isolation unexpectedly succeeded");
      });
      await expect(receiptTimingQuery(Object.assign(transaction, { cancel: () => cancelCurrent() }),
        "unsupported isolation transaction", policy.requestMs)).rejects.toMatchObject({ code: "42501",
        message: surface === "fresh confirmation" || surface === "exact replay" ? "RFP receipt access denied" : "RFP receipt read denied" });
      expect(await d.snapshot()).toEqual(before); expect(await workspace(value)).toBe(true);
    }, 120000,
  );
  test("keeps the new receipt context helper private with exact catalog properties", async () => {
    const fixture = d.fixture(), signature = "mmhr_private.r4_receipt_context_at(uuid,text,timestamptz)";
    const rows = await receiptTimingQuery(fixture.owner<{ identity: string; volatile: string; definer: boolean; config: string[]; role: string; allowed: boolean }[]>`SELECT
      p.oid::regprocedure::text identity,p.provolatile::text volatile,p.prosecdef definer,p.proconfig config,r.rolname role,
      has_function_privilege(r.rolname,p.oid,'EXECUTE') allowed FROM pg_proc p CROSS JOIN pg_roles r
      WHERE p.oid=to_regprocedure(${signature}) AND r.rolname IN ('anon','authenticated','service_role','mmhr_worker','mmhr_document_worker')
      ORDER BY r.rolname`, "new helper ACL inventory");
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.identity).toBe(signature.replace("timestamptz", "timestamp with time zone"));
      expect(row.volatile).toBe("v"); expect(row.definer).toBe(true);
      expect(row.config).toContain('search_path=""'); expect(row.allowed).toBe(false);
    }
    const [acl] = await receiptTimingQuery(fixture.owner<{ roles: string[] }[]>`SELECT ARRAY(
      SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee
      WHERE a.grantee<>p.proowner AND a.privilege_type='EXECUTE' ORDER BY a.grantee) roles
      FROM pg_proc p WHERE p.oid=to_regprocedure(${signature})`, "new helper exact external ACL");
    expect(acl).toBeDefined(); expect(acl!.roles).toEqual([]);
  }, 120000);
}
