import "server-only";
import {
  managedFinanceCommandSchema,
  managedFinanceDetailSchema,
  managedFinanceReadSchema,
  verifyManagedFinanceResult,
} from "@/lib/managed-finance-workflow";
import { verifyManagedFinanceDetail, verifyManagedFinancePage } from "@/lib/managed-finance-reads";
import {
  managedFinanceOriginalChoicesSchema,
  verifyManagedFinanceOriginalChoices,
} from "@/lib/managed-finance-originals";
import type { AuthorizationOptions } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "./finance-document-upload";
import { checkFinanceDocumentRpcError } from "./finance-document-errors";

async function request(
  name: string,
  input: { organizationId: string; correlationId: string; idempotencyKey?: string },
  options: AuthorizationOptions,
) {
  const context = await requireFinanceDocumentAuthority(input.organizationId, input.correlationId, options);
  const { correlationId, idempotencyKey, ...payload } = input;
  const arguments_ = { payload, correlation_id: correlationId,
    ...(idempotencyKey === undefined ? {} : { idempotency_key: idempotencyKey }) };
  const response = await Promise.resolve(context.supabase.rpc(name, arguments_))
    .catch(() => { throw new Error("Managed finance request failed"); });
  checkFinanceDocumentRpcError(response.error, "Managed finance request failed");
  return { data: response.data as unknown, identityId: context.identityId };
}

export async function getManagedFinancePage(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedFinanceReadSchema.parse(value);
  const response = await request("mmhr_get_managed_finance_page", input, options);
  return verifyManagedFinancePage(response.data, input);
}

export async function getManagedFinanceDetail(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedFinanceDetailSchema.parse(value);
  const response = await request("mmhr_get_managed_finance_detail", input, options);
  const detail = verifyManagedFinanceDetail(response.data, input);
  const actor = detail.view === "calculation" ? detail.calculation.currentActorIdentityId : detail.currentActorIdentityId;
  if (actor !== response.identityId) throw new Error("Invalid finance detail actor");
  return detail;
}

export async function getManagedFinanceOriginals(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedFinanceOriginalChoicesSchema.parse(value);
  const response = await request("mmhr_get_managed_finance_originals", input, options);
  return verifyManagedFinanceOriginalChoices(response.data, input);
}

export async function executeManagedFinanceCommand(value: unknown, options: AuthorizationOptions = {}) {
  const input = managedFinanceCommandSchema.parse(value);
  const response = await request("mmhr_managed_finance_command", input, options);
  return verifyManagedFinanceResult(response.data, input);
}
