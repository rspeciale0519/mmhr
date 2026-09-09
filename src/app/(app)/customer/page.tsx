import { forbidden } from "next/navigation";
import { z } from "zod";
import { AuthorizationError } from "@/server/auth/authorization";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { securityUuidSchema } from "@/server/audit/security-values";
import { getIntake, getIntakesPage, IntakeReadError } from "@/server/commands/intake-read";
import { CustomerFrame, IntakeDetails, IntakeList, IntakeNotice } from "./intake-views";

const querySchema = z.object({
  intake: securityUuidSchema.optional(),
  after: securityUuidSchema.optional(),
}).refine((query) => !(query.intake && query.after));

export default async function CustomerHome({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Pages and layouts can render independently. Never rely on the layout guard
  // to authorize this page's data fetch or use query parameters as authority.
  const { authorization } = await requirePortalPageAccess("customer");
  if (authorization.scope.kind !== "organization") forbidden();
  const organizationId = authorization.scope.organizationId;
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) {
    return <CustomerFrame><IntakeNotice title="This page link is not valid" /></CustomerFrame>;
  }

  let result:
    | { kind: "detail"; intake: Awaited<ReturnType<typeof getIntake>> }
    | { kind: "list"; page: Awaited<ReturnType<typeof getIntakesPage>> }
    | { kind: "error" };
  try {
    const options = { supabase: authorization.supabase };
    result = query.data.intake
      ? { kind: "detail", intake: await getIntake({ organizationId, intakeId: query.data.intake }, options) }
      : { kind: "list", page: await getIntakesPage({ organizationId, afterId: query.data.after }, options) };
  } catch (error) {
    if (!(error instanceof IntakeReadError) && !(error instanceof AuthorizationError)) throw error;
    result = { kind: "error" };
  }
  return (
    <CustomerFrame>
      {result.kind === "detail" ? <IntakeDetails intake={result.intake} />
        : result.kind === "list" ? <IntakeList page={result.page} hasCursor={query.data.after !== undefined} />
          : <IntakeNotice title="We could not load your saved intake information"
              description="The records may be unavailable, or your access may have changed. Return to the list to try again." />}
    </CustomerFrame>
  );
}
