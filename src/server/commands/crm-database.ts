import "server-only";

import { z } from "zod";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type AuthorizationOptions,
} from "@/server/auth/authorization";
import { securityUuidSchema } from "@/server/audit/security-values";

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const contactStatus = z.enum(["active", "inactive", "archived"]);
const productStatus = z.enum(["draft", "active", "retired", "archived"]);
const idempotencyKey = securityUuidSchema;

const contactFields = {
  fullName: text(200),
  normalizedEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)).nullable(),
  phone: nullableText(32),
  title: nullableText(200),
  status: contactStatus,
};

const productFields = {
  stableKey: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,99}$/),
  name: text(200),
  description: nullableText(2_000),
  status: productStatus,
};

export const createContactInputSchema = z.strictObject({
  organizationId: securityUuidSchema,
  ...contactFields,
  normalizedEmail: contactFields.normalizedEmail.default(null),
  phone: contactFields.phone.default(null),
  title: contactFields.title.default(null),
  status: contactFields.status.default("active"),
  idempotencyKey,
});

export const updateContactInputSchema = z.strictObject({
  organizationId: securityUuidSchema,
  contactId: securityUuidSchema,
  fullName: contactFields.fullName.optional(),
  normalizedEmail: contactFields.normalizedEmail.optional(),
  phone: contactFields.phone.optional(),
  title: contactFields.title.optional(),
  status: contactFields.status.optional(),
  expectedRevision: z.int().min(1),
  idempotencyKey,
}).refine(
  ({ fullName, normalizedEmail, phone, title, status }) =>
    fullName !== undefined || normalizedEmail !== undefined || phone !== undefined
      || title !== undefined || status !== undefined,
  { message: "At least one contact field is required" },
);

export const createProductInputSchema = z.strictObject({
  organizationId: securityUuidSchema,
  vendorProfileId: securityUuidSchema,
  ...productFields,
  description: productFields.description.default(null),
  status: productFields.status.default("draft"),
  idempotencyKey,
});

export const updateProductInputSchema = z.strictObject({
  organizationId: securityUuidSchema,
  productId: securityUuidSchema,
  stableKey: productFields.stableKey.optional(),
  name: productFields.name.optional(),
  description: productFields.description.optional(),
  status: productFields.status.optional(),
  expectedRevision: z.int().min(1),
  idempotencyKey,
}).refine(
  ({ stableKey, name, description, status }) =>
    stableKey !== undefined || name !== undefined || description !== undefined || status !== undefined,
  { message: "At least one product field is required" },
);

export type CreateContactInput = z.input<typeof createContactInputSchema>;
export type UpdateContactInput = z.input<typeof updateContactInputSchema>;
export type CreateProductInput = z.input<typeof createProductInputSchema>;
export type UpdateProductInput = z.input<typeof updateProductInputSchema>;
export type ParsedCrmInput =
  | z.output<typeof createContactInputSchema>
  | z.output<typeof updateContactInputSchema>
  | z.output<typeof createProductInputSchema>
  | z.output<typeof updateProductInputSchema>;

export type CrmDatabaseInput =
  | { operation: "create_contact"; input: CreateContactInput }
  | { operation: "update_contact"; input: UpdateContactInput }
  | { operation: "create_product"; input: CreateProductInput }
  | { operation: "update_product"; input: UpdateProductInput };

export type CrmDatabaseOperation = CrmDatabaseInput["operation"];

const crmCommandResultSchema = z.strictObject({
  operation: z.enum(["create_contact", "update_contact", "create_product", "update_product"]),
  recordId: securityUuidSchema,
  organizationId: securityUuidSchema,
  revision: z.int().min(1),
  outcomeCode: z.enum(["created", "updated", "replayed"]),
  correlationId: securityUuidSchema,
});

export type CrmDatabaseResult = z.infer<typeof crmCommandResultSchema>;
export type CrmDatabaseAdapter = (
  operation: CrmDatabaseOperation,
  input: ParsedCrmInput,
  context: AuthorizationContext,
) => Promise<unknown>;
export type CrmDatabaseOptions = AuthorizationOptions & {
  /** Optional test or replacement adapter. The default uses fixed reviewed RPCs. */
  adapter?: CrmDatabaseAdapter;
};

export class CrmDatabaseCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "REJECTED" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT"
      ? "CRM command input is invalid"
      : "CRM command could not be completed");
    this.name = "CrmDatabaseCommandError";
  }
}

const rpcNames: Record<CrmDatabaseOperation, string> = {
  create_contact: "mmhr_create_contact",
  update_contact: "mmhr_update_contact",
  create_product: "mmhr_create_product",
  update_product: "mmhr_update_product",
};

function parseInput(operation: CrmDatabaseOperation, input: unknown): ParsedCrmInput {
  const parsed = operation === "create_contact"
    ? createContactInputSchema.safeParse(input)
    : operation === "update_contact"
      ? updateContactInputSchema.safeParse(input)
      : operation === "create_product"
        ? createProductInputSchema.safeParse(input)
        : updateProductInputSchema.safeParse(input);
  if (!parsed.success) throw new CrmDatabaseCommandError("INVALID_INPUT");
  return parsed.data;
}

function requireExactOrganizationScope(
  context: AuthorizationContext,
  organizationId: string,
): void {
  if (
    context.scope.kind !== "organization"
    || context.scope.organizationId !== organizationId
  ) {
    throw new AuthorizationError();
  }
}

/**
 * Validates a CRM command and rechecks the caller for its exact organization.
 * The fixed SQL functions own the mutation, receipt, audit, and revision check.
 */
export async function executeCrmDatabaseCommand(
  command: CrmDatabaseInput,
  options: CrmDatabaseOptions = {},
): Promise<CrmDatabaseResult> {
  if (
    !command || typeof command !== "object" || !("operation" in command)
    || !["create_contact", "update_contact", "create_product", "update_product"].includes(command.operation)
  ) {
    throw new CrmDatabaseCommandError("INVALID_INPUT");
  }
  const parsedInput = parseInput(command.operation, command.input);

  const organizationId = parsedInput.organizationId;
  let context: AuthorizationContext;
  try {
    context = await requirePermission(
      "workspace.access",
      { kind: "organization", organizationId },
      options,
    );
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new CrmDatabaseCommandError("UNAVAILABLE");
  }
  requireExactOrganizationScope(context, organizationId);

  let response: unknown;
  try {
    if (options.adapter) {
      response = await options.adapter(command.operation, parsedInput, context);
    } else {
      const rpcResponse = await context.supabase.rpc(rpcNames[command.operation], {
        payload: parsedInput,
        correlation_id: context.correlationId,
        idempotency_key: parsedInput.idempotencyKey,
      });
      if (rpcResponse.error) throw new CrmDatabaseCommandError("REJECTED");
      response = rpcResponse.data;
    }
  } catch (error) {
    if (error instanceof CrmDatabaseCommandError) throw error;
    throw new CrmDatabaseCommandError("UNAVAILABLE");
  }
  const result = crmCommandResultSchema.safeParse(response);
  if (!result.success
    || result.data.operation !== command.operation
    || result.data.organizationId !== organizationId
  ) {
    throw new CrmDatabaseCommandError("INVALID_RESPONSE");
  }
  return result.data;
}

export function createContact(input: CreateContactInput, options: CrmDatabaseOptions = {}) {
  return executeCrmDatabaseCommand({ operation: "create_contact", input }, options);
}

export function updateContact(input: UpdateContactInput, options: CrmDatabaseOptions = {}) {
  return executeCrmDatabaseCommand({ operation: "update_contact", input }, options);
}

export function createProduct(input: CreateProductInput, options: CrmDatabaseOptions = {}) {
  return executeCrmDatabaseCommand({ operation: "create_product", input }, options);
}

export function updateProduct(input: UpdateProductInput, options: CrmDatabaseOptions = {}) {
  return executeCrmDatabaseCommand({ operation: "update_product", input }, options);
}
