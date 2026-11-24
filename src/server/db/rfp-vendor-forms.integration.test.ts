import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { applyAllMigrations, type RehearsalContext, startRehearsal, stopRehearsal } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createCommandFixture, createSecurityPrincipal, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import { invoke, read, seedQuoteWorkflow } from "./test/r6-proposal-quote-fixtures";

/**
 * Database tests for migration 0180: the RFP web form a vendor fills in from
 * an emailed private link, and the staff tracking around it.
 *
 * Each test runs inside a transaction that is rolled back, so tests do not
 * see each other's rows.
 */

type Json = Record<string, unknown>;
const denied = { code: "42501" };
const invalid = { code: "22023" };

/** The database stores a SHA-256 hash of the link token, as 64 hex characters. */
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const future = (days = 7) => new Date(Date.now() + days * 86_400_000).toISOString();
const overview = { companyName: "Synthetic customer", employeeCount: "250" };
const pdfBase64 = Buffer.from("%PDF-1.7 synthetic").toString("base64");

/** Runs a query as a visitor who is not signed in, like a vendor with a link. */
async function asVisitor<T>(sql: SecurityTransaction, callback: (probe: SecurityTransaction) => Promise<T>): Promise<T> {
  const completed = await sql.savepoint(async (probe) => {
    await probe`SET LOCAL ROLE anon`;
    const value = await callback(probe);
    await probe`RESET ROLE`;
    return { value };
  });
  return completed.value;
}

/** Calls one vendor function by its fixed name. `args` are passed in order. */
function vendorCall(sql: SecurityTransaction, name: "read" | "save" | "submit" | "reopen" | "file_add" | "file_remove", args: (string | null)[]) {
  const casts = { read: ["text"], save: ["text", "text::jsonb"], submit: ["text", "text", "text"], reopen: ["text"],
    file_add: ["text", "text", "text", "text", "text"], file_remove: ["text", "uuid"] }[name];
  const list = casts.map((cast, index) => `$${index + 1}::${cast}`).join(", ");
  return asVisitor(sql, async (probe) => {
    const [row] = await probe.unsafe<{ result: Json | null }[]>(`SELECT public.mmhr_vendor_rfp_form_${name}(${list}) AS result`, args);
    return row!.result;
  });
}

/** A delivered RFP with two vendors, and a saved RFP contact for the first one. */
async function delivered(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const staff = fixture.pair[0];
  const workflow = await seedQuoteWorkflow(sql, fixture);
  const [first, second] = workflow.vendors;
  const [rfp] = await sql<{ rfp_id: string; version: number }[]>`SELECT r.rfp_id, r.version FROM public.rfp_recipients rr
    JOIN public.rfp_versions r ON r.id = rr.rfp_version_id WHERE rr.id = ${first!.recipientId}::uuid`;
  await invoke(sql, staff, "mmhr_set_vendor_rfp_contact", { vendorOrganizationId: first!.organizationId,
    contactName: "Pat Lee", contactEmail: "pat@vendor.example.test" });
  return { staff, customer: workflow.customer, first: first!, second: second!, rfpId: rfp!.rfp_id, version: rfp!.version };
}

/** Prepares a form for one vendor and marks its email as sent. Returns the form id and token hash. */
async function sentForm(sql: SecurityTransaction, fixture: SecurityCommandFixture, staff: SecurityPrincipal, recipientId: string) {
  const tokenHash = hashOf(`token-${recipientId}`);
  const prepared = await invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", { organizationId: fixture.organizationId, recipientId,
    tokenHash, libraryVersion: 1, tabKeys: ["core", "payroll"], clientOverview: overview, dueAt: future() });
  expect(prepared).toMatchObject({ outcomeCode: "prepared", state: "prepared" });
  const formId = String(prepared.formId);
  await expect(invoke(sql, staff, "mmhr_record_rfp_vendor_form_event", { formId, kind: "email_sent", providerMessageId: "email_1" }))
    .resolves.toMatchObject({ outcomeCode: "recorded", state: "sent" });
  return { formId, tokenHash };
}

describe("RFP vendor forms", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("rfp-vendor-forms");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("staff send a form, the vendor answers and submits by link, and staff read and reopen it", async () => {
    await rollbackCase(context, async (sql) => {
      const { staff, first, second, rfpId, version } = await delivered(sql, fixture);
      const scope = { organizationId: fixture.organizationId, rfpId, version };

      // Before sending: both vendors are listed, one has a contact, none has a form.
      const before = await read(sql, staff, "mmhr_get_rfp_send_out", scope);
      const recipients = before.recipients as { recipientId: string; contactEmail: string | null; form: Json | null }[];
      expect(recipients).toHaveLength(2);
      expect(recipients.find((item) => item.recipientId === first.recipientId)).toMatchObject({ contactEmail: "pat@vendor.example.test", form: null });
      expect(recipients.find((item) => item.recipientId === second.recipientId)).toMatchObject({ contactEmail: null, form: null });
      expect(before).toMatchObject({ lastClientOverview: null, lastTabKeys: null });

      // A prepared form does not open until its email has been sent.
      const tokenHash = hashOf(`token-${first.recipientId}`);
      const prepared = await invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", { organizationId: fixture.organizationId,
        recipientId: first.recipientId, tokenHash, libraryVersion: 1, tabKeys: ["core", "payroll"], clientOverview: overview, dueAt: future() });
      const formId = String(prepared.formId);
      expect(prepared).toMatchObject({ outcomeCode: "prepared", state: "prepared", contactEmail: "pat@vendor.example.test",
        rfpTitle: "Synthetic proposal request" });
      await expect(vendorCall(sql, "read", [tokenHash])).resolves.toBeNull();
      await invoke(sql, staff, "mmhr_record_rfp_vendor_form_event", { formId, kind: "email_sent", providerMessageId: "email_1" });

      // The vendor opens the link. The first open is logged once.
      const opened = await vendorCall(sql, "read", [tokenHash]);
      expect(opened).toMatchObject({ state: "sent", editable: true, rfpTitle: "Synthetic proposal request",
        rfpIntroduction: "Describe payroll support and quoted terms.", clientOverview: overview, tabKeys: ["core", "payroll"], answers: {}, files: [] });
      await vendorCall(sql, "read", [tokenHash]);
      const [opens] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM mmhr_private.rfp_vendor_form_events
        WHERE form_id = ${formId}::uuid AND kind = 'opened'`;
      expect(opens!.count).toBe(1);

      // Answers save in parts. A later save keeps earlier answers.
      await expect(vendorCall(sql, "save", [tokenHash, JSON.stringify({ core_01: { answer: "yes", comment: null } })]))
        .resolves.toMatchObject({ saved: true });
      await vendorCall(sql, "save", [tokenHash, JSON.stringify({ payroll_01: { answer: "no", comment: "Planned" }, core_02: { answer: null, comment: "Draft" } })]);
      await expect(vendorCall(sql, "save", [tokenHash, JSON.stringify({ core_01: { answer: "maybe", comment: null } })])).rejects.toMatchObject(invalid);

      // One document is uploaded, a second is uploaded and removed.
      const stored = await vendorCall(sql, "file_add", [tokenHash, "contract_sample", "contract.pdf", "application/pdf", pdfBase64]);
      expect(stored).toMatchObject({ stored: true });
      const extra = await vendorCall(sql, "file_add", [tokenHash, "other", "extra.pdf", "application/pdf", pdfBase64]);
      await expect(vendorCall(sql, "file_remove", [tokenHash, String(extra!.fileId)])).resolves.toMatchObject({ removed: true });
      await expect(vendorCall(sql, "file_add", [tokenHash, "other", "run.exe", "application/x-msdownload", pdfBase64])).rejects.toMatchObject(invalid);

      // Submitting locks the form: no more saves, uploads, or removals.
      await expect(vendorCall(sql, "submit", [tokenHash, " Pat Lee ", "Pat@Vendor.example.test"])).resolves.toMatchObject({ submitted: true });
      await expect(vendorCall(sql, "save", [tokenHash, JSON.stringify({ core_01: { answer: "no", comment: null } })]))
        .resolves.toMatchObject({ saved: false, state: "submitted" });
      await expect(vendorCall(sql, "file_add", [tokenHash, "other", "late.pdf", "application/pdf", pdfBase64])).resolves.toMatchObject({ stored: false });
      await expect(vendorCall(sql, "file_remove", [tokenHash, String(stored!.fileId)])).resolves.toMatchObject({ removed: false });
      await expect(vendorCall(sql, "submit", [tokenHash, "Pat Lee", "pat@vendor.example.test"])).resolves.toMatchObject({ submitted: false });
      await expect(vendorCall(sql, "read", [tokenHash])).resolves.toMatchObject({ state: "submitted", editable: false });

      // Staff read every answer, the respondent, the log, and the file.
      const detail = await read(sql, staff, "mmhr_get_rfp_vendor_form", { formId });
      expect(detail).toMatchObject({ state: "submitted", answeredCount: 2, respondentName: "Pat Lee", respondentEmail: "pat@vendor.example.test",
        answers: { core_01: { answer: "yes", comment: null }, payroll_01: { answer: "no", comment: "Planned" }, core_02: { answer: null, comment: "Draft" } } });
      // The whole test is one transaction, so every event has the same saved time.
      // Their order is therefore not fixed here; compare them as a sorted list.
      expect((detail.events as { kind: string }[]).map((event) => event.kind).sort()).toEqual(["email_sent", "opened", "submitted"]);
      expect(detail.files).toHaveLength(1);
      const file = await read(sql, staff, "mmhr_get_rfp_vendor_form_file", { fileId: stored!.fileId });
      expect(file).toMatchObject({ fileName: "contract.pdf", contentType: "application/pdf", contentBase64: pdfBase64 });

      // The vendor reopens their own submitted form by link. Answers, comments, and the file stay.
      await expect(vendorCall(sql, "reopen", [tokenHash])).resolves.toMatchObject({ reopened: true, state: "sent" });
      await expect(vendorCall(sql, "read", [tokenHash])).resolves.toMatchObject({ state: "sent", editable: true, submittedAt: null,
        answers: { core_01: { answer: "yes", comment: null }, payroll_01: { answer: "no", comment: "Planned" }, core_02: { answer: null, comment: "Draft" } },
        files: [{ fileName: "contract.pdf" }] });
      // An open form has nothing to reopen. The vendor then submits again.
      await expect(vendorCall(sql, "reopen", [tokenHash])).resolves.toMatchObject({ reopened: false, state: "sent" });
      await expect(vendorCall(sql, "submit", [tokenHash, "Pat Lee", "pat@vendor.example.test"])).resolves.toMatchObject({ submitted: true });
      // The log line for the vendor's reopen has no staff member on it.
      const reopenedLog = await read(sql, staff, "mmhr_get_rfp_vendor_form", { formId });
      expect((reopenedLog.events as { kind: string; byStaff: boolean }[]).filter((event) => event.kind === "reopened"))
        .toEqual([expect.objectContaining({ byStaff: false })]);

      // Staff cannot mark a submitted form as declined, but can reopen it. Answers stay.
      await expect(invoke(sql, staff, "mmhr_record_rfp_vendor_form_event", { formId, kind: "declined" })).resolves.toMatchObject({ outcomeCode: "conflict", state: "submitted" });
      await expect(invoke(sql, staff, "mmhr_record_rfp_vendor_form_event", { formId, kind: "reopened" })).resolves.toMatchObject({ outcomeCode: "recorded", state: "sent" });
      await expect(vendorCall(sql, "read", [tokenHash])).resolves.toMatchObject({ state: "sent", editable: true, submittedAt: null,
        answers: { core_01: { answer: "yes", comment: null } } });

      // The vendor workspace list and the next send-out pre-fill both see the form.
      const tracking = await read(sql, staff, "mmhr_get_vendor_rfp_tracking", { vendorOrganizationId: first.organizationId });
      expect(tracking).toMatchObject({ contact: { contactName: "Pat Lee" } });
      expect(tracking.items).toHaveLength(1);
      await expect(read(sql, staff, "mmhr_get_rfp_send_out", scope)).resolves.toMatchObject({ lastClientOverview: overview, lastTabKeys: ["core", "payroll"] });

      // Every staff change wrote one audit event.
      const audits = await sql<{ action: string }[]>`SELECT action FROM public.audit_events
        WHERE entity_id = ${formId} AND actor_identity_id = ${staff.identityId}::uuid ORDER BY occurred_at, action`;
      expect(audits.map((row) => row.action).sort()).toEqual(["r4.rfp.vendor_form.email_sent", "r4.rfp.vendor_form.reopened", "rfp.distribute"]);
    });
  }, 240_000);

  test("staff record follow-ups, replies, due dates, and closed states by the rules", async () => {
    await rollbackCase(context, async (sql) => {
      const { staff, first } = await delivered(sql, fixture);
      const { formId, tokenHash } = await sentForm(sql, fixture, staff, first.recipientId);
      const track = (payload: object, key = randomUUID()) =>
        invoke(sql, staff, "mmhr_record_rfp_vendor_form_event", { formId, ...payload }, "aal2", key);

      await expect(track({ kind: "follow_up_note" })).rejects.toMatchObject(invalid); // a note needs text
      await expect(track({ kind: "follow_up_note", note: "Called Pat; reply expected Friday." })).resolves.toMatchObject({ outcomeCode: "recorded", state: "sent" });
      await expect(track({ kind: "follow_up_email", providerMessageId: "email_2" })).resolves.toMatchObject({ state: "sent" });
      await expect(track({ kind: "due_changed" })).rejects.toMatchObject(invalid); // needs the new date
      await expect(track({ kind: "due_changed", dueAt: new Date(Date.now() - 60_000).toISOString() })).rejects.toMatchObject(invalid);
      await expect(track({ kind: "due_changed", dueAt: future(14) })).resolves.toMatchObject({ outcomeCode: "recorded", state: "sent" });

      // The same request sent twice is applied once.
      const key = randomUUID();
      await expect(track({ kind: "no_response", note: "No answer after two calls." }, key)).resolves.toMatchObject({ outcomeCode: "recorded", state: "no_response" });
      await expect(track({ kind: "no_response", note: "No answer after two calls." }, key)).resolves.toMatchObject({ outcomeCode: "replayed", state: "no_response" });
      await expect(track({ kind: "declined" }, key)).rejects.toMatchObject(invalid); // same key, different request

      // A closed form refuses the vendor and a new send until staff reopen it.
      await expect(vendorCall(sql, "save", [tokenHash, JSON.stringify({ core_01: { answer: "yes", comment: null } })])).resolves.toMatchObject({ saved: false });
      await expect(invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", { organizationId: fixture.organizationId, recipientId: first.recipientId,
        tokenHash, libraryVersion: 1, tabKeys: ["core"], clientOverview: overview, dueAt: future() })).resolves.toMatchObject({ outcomeCode: "closed" });
      // The vendor cannot reopen a form that staff closed.
      await expect(vendorCall(sql, "reopen", [tokenHash])).resolves.toMatchObject({ reopened: false, state: "no_response" });
      await expect(track({ kind: "reply_recorded", occurredAt: new Date(Date.now() - 86_400_000).toISOString(), note: "Reply by email." }))
        .resolves.toMatchObject({ state: "replied" });
      await expect(track({ kind: "reopened", dueAt: future(3) })).resolves.toMatchObject({ state: "sent" });

      // A form past its due date is read-only for the vendor and cannot be reopened without a new date.
      await sql`UPDATE mmhr_private.rfp_vendor_forms SET due_at = clock_timestamp() - interval '1 minute' WHERE id = ${formId}::uuid`;
      await expect(vendorCall(sql, "read", [tokenHash])).resolves.toMatchObject({ state: "sent", editable: false });
      await expect(vendorCall(sql, "save", [tokenHash, JSON.stringify({ core_01: { answer: "yes", comment: null } })])).resolves.toMatchObject({ saved: false });
      await expect(vendorCall(sql, "submit", [tokenHash, "Pat Lee", "pat@vendor.example.test"])).resolves.toMatchObject({ submitted: false });
      // A submitted form past its due date cannot be reopened by the vendor.
      await sql`UPDATE mmhr_private.rfp_vendor_forms SET state = 'submitted', submitted_at = clock_timestamp() WHERE id = ${formId}::uuid`;
      await expect(vendorCall(sql, "reopen", [tokenHash])).resolves.toMatchObject({ reopened: false, state: "submitted" });
      await sql`UPDATE mmhr_private.rfp_vendor_forms SET state = 'sent', submitted_at = NULL WHERE id = ${formId}::uuid`;
      await track({ kind: "declined" });
      await expect(track({ kind: "reopened" })).resolves.toMatchObject({ outcomeCode: "conflict" });
    });
  }, 240_000);

  test("a vendor with no contact gets no form, and bad send input is refused", async () => {
    await rollbackCase(context, async (sql) => {
      const { staff, first, second } = await delivered(sql, fixture);
      const base = { organizationId: fixture.organizationId, recipientId: second.recipientId, tokenHash: hashOf("second"),
        libraryVersion: 1, tabKeys: ["core"], clientOverview: overview, dueAt: future() };
      await expect(invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", base)).resolves.toMatchObject({ outcomeCode: "contact_missing" });
      const [forms] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM mmhr_private.rfp_vendor_forms`;
      expect(forms!.count).toBe(0);

      const good = { ...base, recipientId: first.recipientId };
      for (const bad of [{ ...good, tokenHash: "short" }, { ...good, tabKeys: [] }, { ...good, tabKeys: ["Not A Key"] },
        { ...good, clientOverview: { companyName: 5 } }, { ...good, dueAt: new Date(Date.now() - 60_000).toISOString() },
        { ...good, extra: true }]) {
        await expect(invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", bad)).rejects.toMatchObject(invalid);
      }
      await expect(invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", { ...good, recipientId: randomUUID() })).rejects.toMatchObject(denied);

      // Sending again before a reply keeps one form and updates its due date; the same key replays.
      const key = randomUUID();
      const prepared = await invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", good, "aal2", key);
      await expect(invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", good, "aal2", key)).resolves.toMatchObject({ outcomeCode: "replayed", formId: prepared.formId });
      await expect(invoke(sql, staff, "mmhr_prepare_rfp_vendor_form", { ...good, dueAt: future(20) })).resolves.toMatchObject({ outcomeCode: "prepared", formId: prepared.formId });
      await expect(invoke(sql, staff, "mmhr_set_vendor_rfp_contact", { vendorOrganizationId: first.organizationId,
        contactName: "Pat", contactEmail: "not-an-email" })).rejects.toMatchObject(invalid);
      await expect(invoke(sql, staff, "mmhr_set_vendor_rfp_contact", { vendorOrganizationId: fixture.organizationId,
        contactName: "Pat", contactEmail: "pat@vendor.example.test" })).rejects.toMatchObject(denied); // a customer organization
    });
  }, 240_000);

  test("only staff with two-step sign-in reach staff functions, and a link opens one form only", async () => {
    await rollbackCase(context, async (sql) => {
      const { staff, customer, first, second, rfpId, version } = await delivered(sql, fixture);
      await invoke(sql, staff, "mmhr_set_vendor_rfp_contact", { vendorOrganizationId: second.organizationId,
        contactName: "Sam Roe", contactEmail: "sam@other-vendor.example.test" });
      const one = await sentForm(sql, fixture, staff, first.recipientId);
      const two = await sentForm(sql, fixture, staff, second.recipientId);
      const outsider = await createSecurityPrincipal(sql);

      // Staff functions: refused for a visitor, a customer, a vendor user, an outsider, and staff without two-step sign-in.
      const reads: [string, object][] = [
        ["mmhr_get_rfp_send_out", { organizationId: fixture.organizationId, rfpId, version }],
        ["mmhr_get_rfp_vendor_form", { formId: one.formId }],
        ["mmhr_get_vendor_rfp_tracking", { vendorOrganizationId: first.organizationId }],
      ];
      const writes: [string, object][] = [
        ["mmhr_set_vendor_rfp_contact", { vendorOrganizationId: first.organizationId, contactName: "X", contactEmail: "x@vendor.example.test" }],
        ["mmhr_prepare_rfp_vendor_form", { organizationId: fixture.organizationId, recipientId: first.recipientId, tokenHash: hashOf("other"),
          libraryVersion: 1, tabKeys: ["core"], clientOverview: overview, dueAt: future() }],
        ["mmhr_record_rfp_vendor_form_event", { formId: one.formId, kind: "declined" }],
      ];
      for (const [actor, assurance] of [[customer, "aal1"], [customer, "aal2"], [first.actor, "aal2"], [outsider, "aal2"], [staff, "aal1"]] as const) {
        for (const [name, payload] of reads) await expect(read(sql, actor, name, payload, assurance)).rejects.toMatchObject(denied);
        for (const [name, payload] of writes) await expect(invoke(sql, actor, name, payload, assurance)).rejects.toMatchObject(denied);
        await expect(asAuthenticated(sql, actor, (probe) => probe`SELECT public.mmhr_get_vendor_rfp_contacts()`, assurance)).rejects.toMatchObject(denied);
      }
      await expect(asVisitor(sql, (probe) => probe`SELECT public.mmhr_get_vendor_rfp_contacts()`)).rejects.toMatchObject(denied);
      await expect(asVisitor(sql, (probe) => probe`SELECT public.mmhr_get_rfp_vendor_form(${JSON.stringify({ formId: one.formId })}::jsonb, ${randomUUID()}::uuid)`))
        .rejects.toMatchObject(denied);
      await expect(asVisitor(sql, (probe) => probe`SELECT count(*) FROM mmhr_private.rfp_vendor_forms`)).rejects.toMatchObject(denied);
      await expect(asAuthenticated(sql, staff, (probe) => probe`SELECT count(*) FROM mmhr_private.rfp_vendor_form_files`)).rejects.toMatchObject(denied);
      const [state] = await sql<{ state: string }[]>`SELECT state FROM mmhr_private.rfp_vendor_forms WHERE id = ${one.formId}::uuid`;
      expect(state!.state).toBe("sent");

      // An unknown or malformed link finds nothing and changes nothing.
      await expect(vendorCall(sql, "read", [hashOf("guess")])).resolves.toBeNull();
      await expect(vendorCall(sql, "read", ["not-a-hash"])).resolves.toBeNull();
      await expect(vendorCall(sql, "save", [hashOf("guess"), JSON.stringify({ core_01: { answer: "yes", comment: null } })])).rejects.toMatchObject(denied);
      await expect(vendorCall(sql, "submit", [hashOf("guess"), "Pat", "pat@vendor.example.test"])).rejects.toMatchObject(denied);
      await expect(vendorCall(sql, "reopen", [hashOf("guess")])).rejects.toMatchObject(denied);
      await expect(vendorCall(sql, "reopen", ["not-a-hash"])).rejects.toMatchObject(invalid);

      // One vendor's link never reads or changes the other vendor's form or files.
      await vendorCall(sql, "save", [one.tokenHash, JSON.stringify({ core_01: { answer: "yes", comment: "Vendor one only" } })]);
      const file = await vendorCall(sql, "file_add", [one.tokenHash, "other", "one.pdf", "application/pdf", pdfBase64]);
      await expect(vendorCall(sql, "read", [two.tokenHash])).resolves.toMatchObject({ answers: {}, files: [] });
      await expect(vendorCall(sql, "file_remove", [two.tokenHash, String(file!.fileId)])).resolves.toMatchObject({ removed: false });
      const visible = JSON.stringify(await vendorCall(sql, "read", [two.tokenHash]));
      expect(visible).not.toContain("Vendor one only");
      expect(visible).not.toContain("pat@vendor.example.test");
      // The vendor never sees staff-only fields.
      for (const key of ["formId", "organizationId", "recipientId", "contactEmail", "events", "tokenHash"]) expect(visible).not.toContain(`"${key}"`);
    });
  }, 240_000);

  test("the new tables are closed to every app role and at most 12 files are kept", async () => {
    await rollbackCase(context, async (sql) => {
      const tables = await sql<{ name: string; rls: boolean; open: boolean }[]>`
        SELECT c.relname AS name, c.relrowsecurity AS rls,
          (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) AS open
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'mmhr_private'
          AND c.relname IN ('rfp_vendor_form_events', 'rfp_vendor_form_files', 'rfp_vendor_forms', 'vendor_rfp_contacts') ORDER BY c.relname`;
      expect(tables).toEqual(["rfp_vendor_form_events", "rfp_vendor_form_files", "rfp_vendor_forms", "vendor_rfp_contacts"]
        .map((name) => ({ name, rls: true, open: false })));

      const { staff, first } = await delivered(sql, fixture);
      const { tokenHash } = await sentForm(sql, fixture, staff, first.recipientId);
      for (let index = 0; index < 12; index += 1) {
        await expect(vendorCall(sql, "file_add", [tokenHash, "other", `file-${index}.pdf`, "application/pdf", pdfBase64])).resolves.toMatchObject({ stored: true });
      }
      await expect(vendorCall(sql, "file_add", [tokenHash, "other", "file-13.pdf", "application/pdf", pdfBase64]))
        .resolves.toMatchObject({ stored: false, reason: "too_many" });
    });
  }, 240_000);
});
