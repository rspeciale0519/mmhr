import "server-only";
import { getIntakeRequirementsPage, RequirementReadError } from "./requirement-read";
import type { AuthorizationOptions } from "@/server/auth/authorization";

/** Submitted requirements are immutable. Use the same bounded set in both portals. */
export async function getSubmittedRequirements(organizationId: string, intakeId: string, options: AuthorizationOptions) {
  const requirements: Awaited<ReturnType<typeof getIntakeRequirementsPage>>["requirements"] = [];
  const keys = new Set<string>();
  let afterId: string | undefined;
  for (let pageNumber = 0; pageNumber < 40; pageNumber++) {
    const page = await getIntakeRequirementsPage({ organizationId, intakeId, afterId, pageSize: 50 }, options);
    for (const item of page.requirements) {
      if (keys.has(item.stableKey)) throw new RequirementReadError("INVALID_RESPONSE");
      keys.add(item.stableKey);
      requirements.push(item);
    }
    if (page.nextCursor === null) return { requirements, nextCursor: null };
    if (afterId && page.nextCursor <= afterId) throw new RequirementReadError("INVALID_RESPONSE");
    afterId = page.nextCursor;
  }
  throw new RequirementReadError("INVALID_RESPONSE");
}
