import "server-only";
import { z } from "zod";
import { securityUuidSchema as uuid } from "@/server/audit/security-values";

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
function boundedJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 5) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 2_000;
  if (Array.isArray(value)) return value.length <= 50 && Array.from(value).every((item) => boundedJson(item, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, item]) => key.length >= 1 && key.length <= 100 && boundedJson(item, depth + 1));
}

export const requirementResponseSchema = z.custom<JsonValue>((value) =>
  boundedJson(value) && Buffer.byteLength(JSON.stringify(value), "utf8") <= 8_000,
  "Requirement response must contain bounded JSON data",
).transform((value) => JSON.parse(JSON.stringify(value)) as JsonValue);
export const requirementWriteFields = {
  requirementId: uuid, organizationId: uuid, intakeId: uuid,
  stableKey: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,99}$/),
  label: z.string().trim().min(1).max(200),
  importance: z.enum(["must", "nice", "not_applicable"]),
  weight: z.number().int().min(1).max(100), ownerIdentityId: uuid.nullable(),
  response: requirementResponseSchema,
  requirementType: z.enum(["structured", "custom"]),
  evidenceReferences: z.array(z.string().trim().min(1).max(500)).max(20),
  vendorResponseLinks: z.array(z.string().url().startsWith("https://").max(263)).max(20),
  actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid,
};

export const requirementResultFields = {
  requirementId: uuid, organizationId: uuid, intakeId: uuid,
  revision: z.number().int().min(1).max(2_147_483_647), correlationId: uuid,
};
