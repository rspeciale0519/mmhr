import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R4 document search RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r4-document-search"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("searches only approved content within the organization", async () => {
    await rollbackCase(context!, async (sql) => {
      const documentId = randomUUID(); const versionId = randomUUID(); const actor = fixture.pair[0].identityId;
      const invoke = async (fn: string, payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.${probe.unsafe(fn)}(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`; return row!.result; });
      const upload = { documentId, organizationId: fixture.organizationId, actorIdentityId: actor, action: "upload", versionId, version: 1, documentType: "proposal", sha256: "a".repeat(64), storageReference: "quarantine://proposal.txt", contentType: "text/plain", byteSize: 64, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await invoke("mmhr_record_workflow_document", upload);
      await invoke("mmhr_record_workflow_document", { documentId, organizationId: fixture.organizationId, actorIdentityId: actor, action: "scan", versionId, scanState: "clean", correlationId: randomUUID(), idempotencyKey: randomUUID() });
      await invoke("mmhr_record_workflow_document", { documentId, organizationId: fixture.organizationId, actorIdentityId: actor, action: "approve", versionId, correlationId: randomUUID(), idempotencyKey: randomUUID() });
      await expect(invoke("mmhr_set_workflow_document_search_content", { documentId, versionId, organizationId: fixture.organizationId, actorIdentityId: actor, metadata: { vendor: "Acme" }, approvedExtractedContent: "Supports SSO and SCIM", correlationId: randomUUID(), idempotencyKey: randomUUID() })).resolves.toMatchObject({ versionId, outcomeCode: "recorded" });
      await expect(invoke("mmhr_search_workflow_documents", { organizationId: fixture.organizationId, actorIdentityId: actor, query: "SCIM", documentType: null, limit: 10, correlationId: randomUUID(), idempotencyKey: randomUUID() })).resolves.toMatchObject({ results: [{ documentId, versionId, documentType: "proposal" }], outcomeCode: "recorded" });
    });
  }, 120_000);
});
