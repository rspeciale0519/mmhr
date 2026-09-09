import "server-only";
import { z } from "zod";
import { requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { securityUuidSchema as uuid } from "@/server/audit/security-values";

type SavedJson = null | string | number | boolean | SavedJson[] | { [key: string]: SavedJson };
const characterCount = (value: string) => Array.from(value).length;
function isSavedJson(value: unknown, depth = 0): value is SavedJson {
  if (depth > 5) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return characterCount(value) <= 2_000;
  if (Array.isArray(value)) return value.length <= 50 && Array.from(value).every((item) => isSavedJson(item, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, item]) =>
    characterCount(key) >= 1 && characterCount(key) <= 100 && isSavedJson(item, depth + 1));
}

// JSON text and JSONB storage have different sizes. The RPC enforces stored
// shape/size; this larger wire budget accepts valid stored Unicode and escaping.
const savedResponse = z.custom<SavedJson>((value) =>
  isSavedJson(value) && Buffer.byteLength(JSON.stringify(value), "utf8") <= 100_000,
).transform((value) => JSON.parse(JSON.stringify(value)) as SavedJson);
const rowSchema = z.strictObject({
  requirement_id: uuid, organization_id: uuid, intake_id: uuid,
  stable_key: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
  label: z.string().max(100_000).refine((value) => {
    const count = characterCount(value.replace(/^ +| +$/g, ""));
    return count >= 1 && count <= 200 && Buffer.byteLength(value, "utf8") <= 100_000;
  }),
  importance: z.enum(["must", "nice", "not_applicable"]), weight: z.number().int().min(1).max(100),
  response: savedResponse, status: z.literal("active"), requirement_type: z.enum(["structured", "custom"]),
  revision: z.number().int().min(1).max(2_147_483_647),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
});

export const requirementPageInputSchema = z.strictObject({
  organizationId: uuid, intakeId: uuid, afterId: uuid.optional(),
  pageSize: z.number().int().min(1).max(50).default(25),
});
export class RequirementReadError extends Error {
  constructor(readonly code: "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Requirements could not be loaded");
    this.name = "RequirementReadError";
  }
}

export async function getIntakeRequirementsPage(input: z.input<typeof requirementPageInputSchema>, options: AuthorizationOptions = {}) {
  const parsed = requirementPageInputSchema.safeParse(input);
  if (!parsed.success) throw new RequirementReadError("REJECTED");
  const value = parsed.data;
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: value.organizationId }, options);
  if (context.scope.kind !== "organization" || context.scope.organizationId !== value.organizationId) {
    throw new RequirementReadError("REJECTED");
  }
  let response;
  try {
    response = await context.supabase.rpc("mmhr_get_intake_requirements_page", {
      requested_organization_id: value.organizationId, requested_intake_id: value.intakeId,
      after_id: value.afterId ?? null, page_size: value.pageSize,
    });
  } catch { throw new RequirementReadError("UNAVAILABLE"); }
  if (!response) throw new RequirementReadError("UNAVAILABLE");
  if (response.error) {
    throw new RequirementReadError(response.error.code === "42501" ? "REJECTED"
      : response.error.code === "22023" ? "INVALID_RESPONSE" : "UNAVAILABLE");
  }
  const rows = z.array(rowSchema).max(value.pageSize + 1).safeParse(response.data);
  if (!rows.success) throw new RequirementReadError("INVALID_RESPONSE");
  let previous = value.afterId;
  const keys = new Set<string>();
  for (const row of rows.data) {
    if (row.organization_id !== value.organizationId || row.intake_id !== value.intakeId ||
      (previous !== undefined && row.requirement_id <= previous) || keys.has(row.stable_key)) {
      throw new RequirementReadError("INVALID_RESPONSE");
    }
    previous = row.requirement_id;
    keys.add(row.stable_key);
  }
  const requirements = rows.data.slice(0, value.pageSize).map((row) => ({
    requirementId: row.requirement_id, organizationId: row.organization_id, intakeId: row.intake_id,
    stableKey: row.stable_key, label: row.label, importance: row.importance, weight: row.weight,
    response: row.response, status: row.status, requirementType: row.requirement_type,
    revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  return { requirements, nextCursor: rows.data.length > value.pageSize ? requirements[requirements.length - 1]!.requirementId : null };
}
