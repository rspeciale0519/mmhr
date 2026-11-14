import "server-only";
import { managedInvoiceCommandSchema, managedInvoiceOwnerRequestSchema, managedInvoiceSourceRequestSchema, managedInvoiceDetailRequestSchema,
  verifyManagedInvoiceResult, verifyManagedInvoiceOwners, verifyManagedInvoiceSource, verifyManagedInvoiceDetail } from "@/lib/managed-invoice";
import type { AuthorizationOptions } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "@/server/commands/finance-document-upload";
import { checkFinanceDocumentRpcError } from "@/server/commands/finance-document-errors";

async function request(name: string, input: { organizationId: string; correlationId: string; idempotencyKey?: string }, options: AuthorizationOptions) {
  const context = await requireFinanceDocumentAuthority(input.organizationId, input.correlationId, options);
  const { correlationId, idempotencyKey, ...payload } = input;
  const response = await Promise.resolve(context.supabase.rpc(name, { payload, correlation_id: correlationId,
    ...(idempotencyKey === undefined ? {} : { idempotency_key: idempotencyKey }) }))
    .catch(() => { throw new Error("Managed invoice request failed"); });
  checkFinanceDocumentRpcError(response.error, "Managed invoice request failed");
  return { data: response.data as unknown, identityId: context.identityId };
}
export async function executeManagedInvoiceCommand(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedInvoiceCommandSchema.parse(value);
  return verifyManagedInvoiceResult((await request("mmhr_managed_invoice_command", input, options)).data, input);
}
export async function getManagedInvoiceOwners(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedInvoiceOwnerRequestSchema.parse(value);
  return verifyManagedInvoiceOwners((await request("mmhr_get_managed_invoice_owners", input, options)).data, input);
}
export async function getManagedInvoiceSource(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedInvoiceSourceRequestSchema.parse(value);
  return verifyManagedInvoiceSource((await request("mmhr_get_managed_invoice_source", input, options)).data, input);
}
export async function getManagedInvoiceDetail(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedInvoiceDetailRequestSchema.parse(value);
  const response = await request("mmhr_get_managed_invoice_detail", input, options);
  return verifyManagedInvoiceDetail(response.data, input, response.identityId);
}
