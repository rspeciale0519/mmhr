import "server-only";
import { managedInvoiceOriginalRequestSchema } from "@/lib/managed-invoice-original";
import { AuthorizationError, type AuthorizationOptions } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "./finance-document-upload";
import { getManagedInvoiceDetail } from "./managed-invoice";
import { issueFinanceDocumentAccess } from "./finance-document-review";
import { FinanceDocumentAccessExpiredError } from "./finance-document-errors";
import { downloadFinanceDocument } from "@/server/integrations/documents/finance-document-download";

export class ManagedInvoiceOriginalAccessExpiredError extends Error {
  constructor() { super("Invoice original access expired"); this.name = "ManagedInvoiceOriginalAccessExpiredError"; }
}

/** Source workspace access stays separate from the selected customer invoice scope. */
export async function downloadManagedInvoiceOriginal(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedInvoiceOriginalRequestSchema.parse(value);
  const context = await requireFinanceDocumentAuthority(input.organizationId, input.correlationId, options);
  const scoped = { supabase: context.supabase };
  const read = { organizationId: input.organizationId, commissionEventId: input.commissionEventId,
    invoiceId: input.invoiceId, correlationId: input.correlationId };
  const detail = await getManagedInvoiceDetail(read, scoped);
  const preparation = detail.currentPreparation;
  if (detail.currentActorIdentityId !== context.identityId || preparation?.preparationId !== input.preparationId) throw new AuthorizationError();
  const original = preparation.supportingOriginals.find(item => item.organizationId === input.source.organizationId
    && item.documentId === input.source.documentId && item.versionId === input.source.versionId && item.sha256 === input.source.sha256);
  if (!original || original.document.revision !== input.expectedRevision) throw new AuthorizationError();
  const sourceAuthority = await requireFinanceDocumentAuthority(original.organizationId, input.correlationId, scoped);
  if (sourceAuthority.identityId !== context.identityId) throw new AuthorizationError();
  const grant = await issueFinanceDocumentAccess({ organizationId: original.organizationId, documentId: original.documentId,
    versionId: original.versionId, expectedRevision: input.expectedRevision, purpose: "finance_original",
    correlationId: input.correlationId, idempotencyKey: input.idempotencyKey }, scoped).catch((error: unknown) => {
    if (error instanceof FinanceDocumentAccessExpiredError) throw new ManagedInvoiceOriginalAccessExpiredError();
    throw error;
  });
  if (Date.parse(grant.expiresAt) <= Date.now()) throw new ManagedInvoiceOriginalAccessExpiredError();
  const downloaded = await downloadFinanceDocument({ organizationId: original.organizationId, accessId: grant.accessId,
    accessToken: grant.accessToken, correlationId: input.correlationId }, scoped);
  const manifest = downloaded.manifest;
  if (manifest.organizationId !== original.organizationId || manifest.documentId !== original.documentId
    || manifest.versionId !== original.versionId || manifest.sha256 !== original.sha256
    || manifest.revision !== original.document.revision || manifest.byteSize !== original.document.byteSize
    || manifest.fileName !== original.fileName || manifest.contentType !== original.document.contentType
    || manifest.accessId !== grant.accessId || manifest.purpose !== "finance_original") throw new AuthorizationError();
  const current = await getManagedInvoiceDetail(read, scoped);
  if (current.currentActorIdentityId !== context.identityId || current.invoice?.invoiceRevision !== detail.invoice?.invoiceRevision
    || current.currentPreparation?.preparationId !== input.preparationId || current.currentPreparation.revision !== preparation.revision
    || current.currentPreparation.sourceDigest !== preparation.sourceDigest
    || !current.currentPreparation.supportingOriginals.some(item => JSON.stringify(item) === JSON.stringify(original))) throw new AuthorizationError();
  return Object.freeze({ ...downloaded, reviewedAccessId: grant.accessId });
}
