// The guarded wrapper supplies the owned disposable fixture. The production
// migration keeps execution revoked; only this fixture grants it for tests.
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { staffAuditSearchSchema, verifyStaffAuditPage, type StaffAuditSearchInput } from "@/lib/staff-audit";
import { assignPlatformRole, setPermissionOverride, changeIdentityStatus } from "@/server/commands/security";
import { apiCommandMetadata, createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims,
  type SecurityCommandApiFixtures, type SecurityApiPrincipal } from "@/server/auth/security-command-api-fixtures";

let fixtures: SecurityCommandApiFixtures | undefined;
let startup: Promise<SecurityCommandApiFixtures> | undefined;
let staff: SecurityApiPrincipal;
const action = `test.audit.${randomUUID()}`, reference = `synthetic-worker-${randomUUID()}`;
const entityType = "synthetic_audit_reader", entityId = randomUUID();
const globalIds: string[] = [], actorIds: Record<string, string> = {};
const assignments = new Map<string, { entityId: string; receiptId: string }>();
function current() { if (!fixtures) throw new Error("Audit fixture prerequisite is unavailable"); return fixtures; }
async function makeStaff() {
  const f = current(), principal = await f.createSyntheticPrincipal({ mfa: true });
  const assignment = await assignPlatformRole({ ...apiCommandMetadata(), targetIdentityId: principal.identityId, roleKey: "staff" }, { supabase: elevatedClient(f.pair[0]) });
  assignments.set(principal.identityId, assignment);
  await setPermissionOverride({ ...apiCommandMetadata(), targetIdentityId: principal.identityId, permissionKey: "audit.view",
    organizationId: null, effect: "allow", expiresAt: null, sourceDelegationId: null }, { supabase: elevatedClient(f.pair[0]) });
  const ready = await elevatedClient(principal).rpc("mmhr_authorize", { permission_key: "audit.view", organization_id: null });
  if (ready.error || !Array.isArray(ready.data) || ready.data.length !== 1) throw new Error("Audit staff prerequisite did not obtain current authority");
  return principal;
}
async function direct(input: StaffAuditSearchInput, principal = staff) {
  return elevatedClient(principal).rpc("mmhr_search_staff_audit_events_v1", { payload: staffAuditSearchSchema.parse(input) });
}
async function page(input: StaffAuditSearchInput) {
  const response = await direct(input); expect(response.error).toBeNull();
  return verifyStaffAuditPage(response.data, staffAuditSearchSchema.parse(input));
}
async function snapshot() {
  const rows = await current().owner`SELECT to_jsonb(e) AS row FROM public.audit_events e ORDER BY e.id`;
  return createHash("sha256").update(JSON.stringify([...rows])).digest("hex");
}
async function denied(principal: SecurityApiPrincipal, organizationId: string | null = null) {
  const before = await snapshot();
  const response = await direct({ organizationId, action }, principal);
  expect(response.error?.code).toBe("42501"); expect(response.data).toBeNull();
  expect(await snapshot()).toBe(before);
}
describe("staff audit viewer with genuine disposable Auth", () => {
  beforeAll(async () => {
    const fragment = await readFile(new URL("../../../drizzle/0167_staff_audit_search.sql", import.meta.url), "utf8");
    if (createHash("sha256").update(fragment).digest("hex") !== "14fde2872b62e5c92d469342c3d4b35e11cc588edf79363d649723bfd6bf6341") {
      throw new Error("Audit SQL prerequisite bytes changed");
    }
    startup = createSecurityCommandApiFixtures(); fixtures = await startup;
    const f = current();
    if (process.env.NODE_ENV !== "test" || process.env.R1_MIGRATION_REHEARSAL !== "1"
      || !/^mmhr-r1-commandapi-[0-9a-f]{8}$/.test(f.projectId) || !f.isolation.apiLoopbackOnly) {
      throw new Error("Audit fixture ownership prerequisite failed");
    }
    await f.owner.begin(async sql => {
      const [definition] = await sql`SELECT p.prosecdef, p.prorettype='jsonb'::regtype AS returns_json
        FROM pg_proc p WHERE p.oid=to_regprocedure('public.mmhr_search_staff_audit_events_v1(jsonb)')`;
      if (!definition?.prosecdef || !definition.returns_json) throw new Error("Audit migration prerequisite is unavailable");
      const deniedRoles = await sql`SELECT rolname, has_function_privilege(oid,
        'public.mmhr_search_staff_audit_events_v1(jsonb)','EXECUTE') AS allowed FROM pg_roles
        WHERE rolname=ANY(ARRAY['anon','authenticated','service_role','mmhr_worker','mmhr_document_worker']) ORDER BY rolname`;
      if (deniedRoles.length !== 5 || deniedRoles.some(role => role.allowed)) {
        throw new Error("Audit migration execution must remain revoked before local admission");
      }
      // createSecurityCommandApiFixtures already applied the reviewed migration.
      // This grant exists only in its verified, nonce-owned disposable database.
      await sql`GRANT EXECUTE ON FUNCTION public.mmhr_search_staff_audit_events_v1(jsonb) TO authenticated`;
    });
    await f.owner`NOTIFY pgrst, 'reload schema'`;
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      const response = await f.anonymous.rpc("mmhr_search_staff_audit_events_v1", { payload: { organizationId: null } });
      if (response.error?.code === "42501") { ready = true; break; }
      if (response.error?.code !== "PGRST202") throw new Error("Audit schema prerequisite failed");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error("Audit schema prerequisite did not become ready");
    staff = await makeStaff();
    await f.owner.begin(async sql => {
      for (const principal of [f.pair[0], staff]) await sql`INSERT INTO public.org_members
        (id,org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${randomUUID()}::uuid,${f.organizationId}::uuid,${principal.identityId}::uuid,
          ${principal.subjectId}::uuid,'viewer','viewer',false)`;
      // Existing owner-fixture pattern: seed only the issuer's local scope.
      // The resulting seed is not evidence of a protected grant command.
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,
        effect,issued_by_identity_id,issue_reason)
        VALUES(${f.pair[0].identityId}::uuid,'workspace.access','organization',${f.organizationId}::uuid,
          ${`organization:${f.organizationId}`},'allow',${f.pair[1].identityId}::uuid,'Synthetic local audit issuer scope')`;
    });
    for (const permissionKey of ["workspace.access","audit.view"] as const) await setPermissionOverride({ ...apiCommandMetadata(),
      targetIdentityId: staff.identityId, permissionKey, organizationId: f.organizationId, effect: "allow", expiresAt: null,
      sourceDelegationId: null }, { supabase: elevatedClient(f.pair[0]) });
    const scoped = await elevatedClient(staff).rpc("mmhr_authorize", { permission_key: "audit.view", organization_id: f.organizationId });
    if (scoped.error || !Array.isArray(scoped.data) || scoped.data.length !== 1) throw new Error("Audit scoped authority prerequisite failed");
    // Owner-seeded read fixtures are synthetic events, never proof of a real
    // protected business command, historic approval, or human action.
    for (let i = 0; i < 108; i++) {
      const id = randomUUID(); globalIds.push(id);
      const microseconds = i < 3 ? 109 : 108 - i;
      await f.owner`INSERT INTO public.audit_events(id,actor_type,actor_identity_id,command,action,entity_type,entity_id,reason,correlation_id,occurred_at)
        VALUES(${id}::uuid,'user',${staff.identityId}::uuid,'test.audit.fixture',${action},${entityType},${entityId},
          'Synthetic audit reader fixture',${randomUUID()}::uuid,${`2026-10-04T12:00:00.${String(microseconds).padStart(6,"0")}Z`}::timestamptz)`;
    }
    for (const type of ["worker", "system", "migration"]) {
      const id = randomUUID(); actorIds[type] = id;
      await f.owner`INSERT INTO public.audit_events(id,actor_type,actor_identity_id,actor_reference,command,action,entity_type,entity_id,reason,correlation_id)
        VALUES(${id}::uuid,${type}::public.audit_actor_type,${type === "worker" ? staff.identityId : null}::uuid,
          ${reference},'test.audit.fixture',${action},${entityType},${entityId},'Synthetic actor reader fixture',${randomUUID()}::uuid)`;
    }
    await f.owner`INSERT INTO public.audit_events(actor_type,actor_identity_id,organization_id,command,action,entity_type,entity_id,reason,correlation_id)
      VALUES('user',${staff.identityId}::uuid,${f.organizationId}::uuid,'test.audit.fixture',${action},${entityType},${entityId},
        'Synthetic scoped reader fixture',${randomUUID()}::uuid)`;
  }, 300_000);
  afterAll(async () => { await (fixtures ?? await startup)?.close(); }, 180_000);
  test("returns exact metadata without changing any audit record", async () => {
    const before = await snapshot(), result = await page({ organizationId: null, action });
    expect(result.rows).toHaveLength(25); expect(result.nextCursor).not.toBeNull();
    for (const row of result.rows) expect(Object.keys(row).sort()).toEqual(["action","entityId","entityType","id","occurredAt"]);
    expect(JSON.stringify(result)).not.toContain(reference);
    const assignment = assignments.get(staff.identityId);
    if (!assignment) throw new Error("Protected command fixture evidence missing");
    const recorded = await page({ organizationId: null, action: "platform_role.assign", entityType: "platform_role_assignment", entityId: assignment.entityId });
    const [receipt] = await current().owner`SELECT audit_event_id FROM public.security_command_receipts WHERE id=${assignment.receiptId}::uuid`;
    expect(recorded.rows.map(row => row.id)).toEqual([receipt?.audit_event_id]);
    expect(await snapshot()).toBe(before);
  });
  test("traverses more than 100 events without duplicates and with exact microsecond tie ordering", async () => {
    const ids: string[] = []; let input = staffAuditSearchSchema.parse({ organizationId: null, action, actor: { type: "user", identityId: staff.identityId }, limit: 25 });
    let lastTime = "9999-12-31T23:59:59.999999Z", lastId = "";
    for (let n = 0; n < 5; n++) {
      const result = await page(input);
      for (const row of result.rows) {
        expect(row.occurredAt < lastTime || row.occurredAt === lastTime && row.id > lastId).toBe(true);
        lastTime = row.occurredAt; lastId = row.id; ids.push(row.id);
      }
      if (!result.nextCursor) break; input = { ...input, after: result.nextCursor };
    }
    expect(ids).toHaveLength(108); expect(new Set(ids).size).toBe(108); expect([...ids].sort()).toEqual([...globalIds].sort());
  });
  test("user actor search excludes workers with the same initiating identity", async () => {
    const result = await page({ organizationId: null, action, actor: { type: "user", identityId: staff.identityId }, limit: 100 });
    expect(result.rows.every(row => globalIds.includes(row.id))).toBe(true); expect(result.rows).toHaveLength(100);
  });
  test.each(["worker", "system", "migration"])("searches a known %s actor without returning its reference", async type => {
    const result = await page(staffAuditSearchSchema.parse({ organizationId: null, action, actor: { type, reference } }));
    expect(result.rows.map(row => row.id)).toEqual([actorIds[type]]); expect(JSON.stringify(result)).not.toContain(reference);
  });
  test("applies entity and action filters before paging", async () => {
    const result = await page({ organizationId: null, action, entityType, entityId, limit: 100 });
    expect(result.rows).toHaveLength(100);
    expect((await page({ organizationId: null, action, entityType, entityId: randomUUID() })).rows).toEqual([]);
  });
  test("includes both exact microsecond date boundaries", async () => {
    const result = await page({ organizationId: null, action, occurredFrom: "2026-10-04T12:00:00.000005Z", occurredTo: "2026-10-04T12:00:00.000006Z" });
    expect(result.rows.map(row => row.occurredAt)).toEqual(["2026-10-04T12:00:00.000006Z","2026-10-04T12:00:00.000005Z"]);
  });
  test("keeps platform scope separate from the organization event", async () => {
    const result = await page({ organizationId: null, action, limit: 100 });
    expect(result.rows.every(row => globalIds.includes(row.id) || Object.values(actorIds).includes(row.id))).toBe(true);
  });
  test("authorized organization search excludes every global event", async () => {
    const result = await page({ organizationId: current().organizationId, action });
    expect(result.rows).toHaveLength(1); expect(result.nextCursor).toBeNull();
    expect(globalIds).not.toContain(result.rows[0]?.id); expect(Object.values(actorIds)).not.toContain(result.rows[0]?.id);
  });
  test("denies an organization administrator without platform staff authority", async () => {
    const f = current();
    const authority = await elevatedClient(f.organizationAdmin).rpc("mmhr_authorize", { permission_key: "audit.view", organization_id: f.organizationId });
    expect(authority.error).toBeNull(); expect(authority.data).toHaveLength(1);
    await denied(f.organizationAdmin, f.organizationId);
  });
  test("denies a genuine vendor organization administrator without staff authority", async () => {
    const f = current(), vendor = await f.createSyntheticPrincipal({ mfa: true }), organizationId = randomUUID();
    await f.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
      VALUES(${organizationId}::uuid,'Synthetic audit vendor','vendor','active',clock_timestamp(),false)`;
    await f.owner`INSERT INTO public.org_members(id,org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${randomUUID()}::uuid,${organizationId}::uuid,${vendor.identityId}::uuid,${vendor.subjectId}::uuid,'admin','organization_admin',false)`;
    const authority = await elevatedClient(vendor).rpc("mmhr_authorize", { permission_key: "audit.view", organization_id: organizationId });
    expect(authority.error).toBeNull(); expect(authority.data).toHaveLength(1); await denied(vendor, organizationId);
  });
  test("denies an ungranted organization and an unknown organization", async () => {
    const unscoped = await makeStaff(); await denied(unscoped, current().organizationId); await denied(staff, randomUUID());
  });
  test("denies AAL1 before returning audit data", async () => {
    const response = await staff.aal1.rpc("mmhr_search_staff_audit_events_v1", { payload: { organizationId: null, action } });
    expect(response.error?.code).toBe("42501"); expect(response.data).toBeNull();
  });
  test("denies anonymous and unrelated genuine Auth callers", async () => {
    const response = await current().anonymous.rpc("mmhr_search_staff_audit_events_v1", { payload: { organizationId: null } });
    expect(response.error?.code).toBe("42501"); expect(response.data).toBeNull();
    const stranger = await current().createSyntheticPrincipal({ mfa: true }); await denied(stranger);
  });
  test("rechecks permission revocation before a retained next-page request", async () => {
    const principal = await makeStaff(), client = elevatedClient(principal);
    const first = await client.rpc("mmhr_search_staff_audit_events_v1", { payload: { organizationId: null, action, limit: 1 } });
    expect(first.error).toBeNull(); const parsed = verifyStaffAuditPage(first.data, staffAuditSearchSchema.parse({ organizationId: null, action, limit: 1 }));
    expect(parsed.nextCursor).not.toBeNull();
    await setPermissionOverride({ ...apiCommandMetadata(), targetIdentityId: principal.identityId, permissionKey: "audit.view",
      organizationId: null, effect: "deny", expiresAt: null, sourceDelegationId: null }, { supabase: elevatedClient(current().pair[0]) });
    const before = await snapshot();
    const response = await client.rpc("mmhr_search_staff_audit_events_v1", { payload: { organizationId: null, action, limit: 1, after: parsed.nextCursor } });
    expect(response.error?.code).toBe("42501"); expect(response.data).toBeNull(); expect(await snapshot()).toBe(before);
  });
  test("denies suspended staff through the actual status command", async () => {
    const principal = await makeStaff();
    await changeIdentityStatus({ ...apiCommandMetadata(), targetIdentityId: principal.identityId, status: "suspended" }, { supabase: elevatedClient(current().pair[0]) });
    await denied(principal);
  });
  test("denies a revoked genuine session while its MFA factor remains stored", async () => {
    const principal = await makeStaff(), claims = await verifiedApiClaims(elevatedClient(principal), "aal2"), f = current();
    const [before] = await f.owner`SELECT count(*)::integer AS count FROM auth.mfa_factors WHERE user_id=${principal.subjectId}::uuid AND status='verified'`;
    expect(before?.count).toBeGreaterThan(0);
    const deleted = await f.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${principal.subjectId}::uuid RETURNING id`;
    expect([...deleted]).toEqual([{ id: claims.sessionId }]);
    const [after] = await f.owner`SELECT count(*)::integer AS count FROM auth.mfa_factors WHERE user_id=${principal.subjectId}::uuid AND status='verified'`;
    expect(after?.count).toBe(before?.count); await denied(principal);
  });
  test.each([
    { organizationId: null, actor: {} }, { organizationId: null, limit: 101 }, { organizationId: null, limit: 1.5 },
    { organizationId: null, actor: { type: "user", identityId: randomUUID(), reference } },
    { organizationId: null, actor: { type: "worker", identityId: randomUUID() } },
    { organizationId: null, occurredFrom: "2026-02-30T00:00:00.000000Z" },
    { organizationId: null, after: { id: randomUUID() } }, { organizationId: null, privateSummary: true },
  ])("direct RPC rejects malformed payload %# without writes", async payload => {
    const before = await snapshot();
    const response = await elevatedClient(staff).rpc("mmhr_search_staff_audit_events_v1", { payload });
    expect(["22023","22007","22008"]).toContain(response.error?.code); expect(response.data).toBeNull(); expect(await snapshot()).toBe(before);
  });
  test("raw audit tables remain unavailable to authenticated callers", async () => {
    const client = elevatedClient(staff);
    for (const table of ["audit_events", "audit_log"]) {
      const read = await client.from(table).select("*"); expect(read.error?.code).toBe("42501"); expect(read.data).toBeNull();
    }
    const before = await snapshot();
    const update = await client.from("audit_events").update({ reason: "Attempted synthetic mutation" }).eq("id", globalIds[0]!);
    const remove = await client.from("audit_events").delete().eq("id", globalIds[0]!);
    expect(update.error?.code).toBe("42501"); expect(remove.error?.code).toBe("42501"); expect(await snapshot()).toBe(before);
  });
  test("append-only triggers deny owner update, delete, and truncate", async () => {
    const f = current(), before = await snapshot();
    await expect(f.owner`UPDATE public.audit_events SET reason='Attempted synthetic mutation' WHERE id=${globalIds[0]!}::uuid`).rejects.toMatchObject({ code: "P0001", message: "audit_events is append-only" });
    await expect(f.owner`DELETE FROM public.audit_events WHERE id=${globalIds[0]!}::uuid`).rejects.toMatchObject({ code: "P0001", message: "audit_events is append-only" });
    await expect(f.owner.begin(async sql => {
      await sql`TRUNCATE public.audit_events CASCADE`;
      throw new Error("Synthetic audit truncate unexpectedly succeeded");
    })).rejects.toMatchObject({ code: "P0001", message: "audit_events is append-only" }); expect(await snapshot()).toBe(before);
  });
  test("preserves the old fixed read and its five-column contract", async () => {
    const response = await elevatedClient(current().pair[0]).rpc("mmhr_get_audit_events", { organization_id: null });
    expect(response.error).toBeNull(); expect(response.data.length).toBeLessThanOrEqual(100);
    for (const row of response.data) expect(Object.keys(row).sort()).toEqual(["action","entity_id","entity_type","id","occurred_at"]);
  });
  test("a newer append does not repeat earlier rows during keyset traversal", async () => {
    const input = staffAuditSearchSchema.parse({ organizationId: null, action, actor: { type: "user", identityId: staff.identityId }, limit: 25 });
    const first = await page(input); expect(first.nextCursor).not.toBeNull();
    const id = randomUUID();
    await current().owner`INSERT INTO public.audit_events(id,actor_type,actor_identity_id,command,action,entity_type,entity_id,reason,correlation_id,occurred_at)
      VALUES(${id}::uuid,'user',${staff.identityId}::uuid,'test.audit.fixture',${action},${entityType},${entityId},
        'Synthetic newer append fixture',${randomUUID()}::uuid,'2026-10-04T12:00:00.000110Z'::timestamptz)`;
    if (!first.nextCursor) throw new Error("Audit paging prerequisite failed");
    const next = await page({ ...input, after: first.nextCursor });
    const firstIds = first.rows.map(row => row.id);
    expect(next.rows.some(row => firstIds.includes(row.id) || row.id === id)).toBe(false);
    expect((await page(input)).rows[0]?.id).toBe(id);
  });
  test("current workspace denial blocks an otherwise authorized scoped read", async () => {
    const f = current(); expect((await page({ organizationId: f.organizationId, action })).rows).toHaveLength(1);
    await setPermissionOverride({ ...apiCommandMetadata(), targetIdentityId: staff.identityId, permissionKey: "workspace.access",
      organizationId: f.organizationId, effect: "deny", expiresAt: null, sourceDelegationId: null }, { supabase: elevatedClient(f.pair[0]) });
    await denied(staff, f.organizationId);
  });
  test("current platform admin denial blocks an otherwise authorized audit reader", async () => {
    const f = current(), principal = await makeStaff();
    const before = await direct({ organizationId: null, action }, principal); expect(before.error).toBeNull();
    await setPermissionOverride({ ...apiCommandMetadata(), targetIdentityId: principal.identityId, permissionKey: "admin.access",
      organizationId: null, effect: "deny", expiresAt: null, sourceDelegationId: null }, { supabase: elevatedClient(f.pair[0]) });
    await denied(principal);
  });
});
