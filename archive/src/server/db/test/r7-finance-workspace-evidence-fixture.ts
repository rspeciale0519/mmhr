import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { elevatedClient, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { reserveWorkspaceDocument, completeWorkspaceDocumentUpload } from "@/server/commands/document-reservations";
import { recordWorkspaceDocumentReview, issueWorkspaceDocumentAccess } from "@/server/commands/workspace-document-review";
import { downloadWorkspaceDocument } from "@/server/integrations/documents/workspace-document-download";
import { createSupabaseDocumentStore } from "@/server/integrations/documents/supabase-document-store";
import { runDocumentScan } from "@/server/workflows/document-scan-worker";
import type { RequestSupabaseClient } from "@/server/auth/authorization";

/** Use actual signed workspace commands and Storage; the scanner remains a declared test double. */
export async function createApprovedWorkspaceDemoEvidence(fixture: SecurityCommandApiFixtures,
  worker: Awaited<ReturnType<SecurityCommandApiFixtures["createDocumentScanProcessor"]>>, bytes: Uint8Array) {
  expect(fixture.isolation.apiLoopbackOnly).toBe(true);
  const metadata = () => ({ correlationId: randomUUID(), idempotencyKey: randomUUID() });
  const uploader = { supabase: elevatedClient(fixture.pair[0]) as RequestSupabaseClient };
  const reviewer = { supabase: elevatedClient(fixture.pair[1]) as RequestSupabaseClient };
  const request = { organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(),
    expectedVersion: 0, fileName: "synthetic-demo-evidence.pdf", declaredMimeType: "application/pdf", ...metadata() };
  await reserveWorkspaceDocument(request, bytes, uploader);
  await createSupabaseDocumentStore(uploader.supabase).putQuarantined({ organizationId: request.organizationId,
    documentId: request.documentId, versionId: request.versionId, fileName: request.fileName,
    declaredMimeType: request.declaredMimeType, bytes });
  const scope = { organizationId: request.organizationId, documentId: request.documentId, versionId: request.versionId };
  await completeWorkspaceDocumentUpload({ ...scope, expectedRevision: 1, ...metadata() }, uploader);
  const scanned = await runDocumentScan(request.versionId, { repository: worker.repository,
    store: createSupabaseDocumentStore(worker.reader as RequestSupabaseClient),
    scanner: { async scan(input) { return { versionId: input.versionId, sha256: input.expectedSha256,
      state: "clean", scanner: "clamav", scannerVersion: "1.4.6", signatureVersion: 28139,
      signatureUpdatedAt: new Date().toISOString(), scannedAt: new Date().toISOString(), failureCode: null }; } },
  });
  expect(scanned).toMatchObject({ outcome: "recorded", state: "ready" });
  await recordWorkspaceDocumentReview({ ...scope, expectedRevision: 4, action: "begin_review",
    reason: "Synthetic ordinary evidence review started", reviewReference: "synthetic:demo-review", ...metadata() }, reviewer);
  const grant = await issueWorkspaceDocumentAccess({ ...scope, expectedRevision: 5, purpose: "review", ...metadata() }, reviewer);
  const original = await downloadWorkspaceDocument({ organizationId: scope.organizationId, accessId: grant.accessId,
    accessToken: grant.accessToken, correlationId: randomUUID() }, reviewer);
  expect(original.bytes).toEqual(bytes);
  const approved = await recordWorkspaceDocumentReview({ ...scope, expectedRevision: 5, action: "approve",
    reason: "Synthetic ordinary evidence independently checked", reviewReference: "synthetic:demo-approval",
    reviewedAccessId: grant.accessId, contentsReviewed: true, ...metadata() }, reviewer);
  expect(approved).toMatchObject({ state: "approved", revision: 6, outcomeCode: "recorded" });
  return { versionId: request.versionId };
}
