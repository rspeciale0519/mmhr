import { randomUUID } from "node:crypto";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { AuthorizationError } from "@/server/auth/authorization";
import { requirePagePermission } from "@/server/auth/page-guards";
import { getStaffSubmissionQueue, type StaffSubmission } from "@/server/commands/staff-submissions";
import { openStaffCaseAction } from "./actions";

const querySchema = z.strictObject({
  afterSubmittedAt: z.string().optional(),
  afterIntake: z.string().optional(),
  notice: z.literal("denied").optional(),
}).refine((value) => (value.afterSubmittedAt === undefined) === (value.afterIntake === undefined));

const submittedTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function accessText(item: StaffSubmission) {
  if (item.callerHasAccess) return "You have access to this case.";
  if (item.staffWithAccess === 0) return "No staff member has opened this case.";
  return item.staffWithAccess === 1 ? "One other staff member has access." : `${item.staffWithAccess} staff members have access.`;
}

export default async function StaffSubmissionsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { authorization } = await requirePagePermission("admin.access", { kind: "platform" });
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const { afterSubmittedAt, afterIntake, notice } = query.data;
  let page;
  try {
    page = await getStaffSubmissionQueue({
      after: afterSubmittedAt && afterIntake ? { submittedAt: afterSubmittedAt, intakeId: afterIntake } : undefined,
    }, { supabase: authorization.supabase });
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }

  return <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-8 sm:px-6 sm:py-10">
    <header className="space-y-3">
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Back to administration</Link>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">Submitted customer intakes</h1>
      <p className="max-w-prose text-pretty text-sm leading-6 text-muted-foreground">
        Newest first, from every customer workspace. Opening a case gives you access to that workspace and records it in the audit log.
      </p>
    </header>
    {notice === "denied" && <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm">
      The case could not be opened. Your account needs customer review access, and access that was removed is not given again here.
    </p>}
    {page.items.length === 0 ? (
      <p role="status" className="text-sm leading-6">No submitted intakes need work now. New submissions appear here.</p>
    ) : (
      <ul aria-label="Submitted intakes" className="divide-y border-y">
        {page.items.map((item) => <li key={item.intakeId} className="py-5">
          <form action={openStaffCaseAction} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <input type="hidden" name="intakeId" value={item.intakeId}/>
            <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
            <div className="min-w-0 space-y-1">
              <h2 className="break-words text-lg font-semibold">{item.organizationName}</h2>
              <p className="text-sm">
                {item.status === "under_review" ? "Under review" : "Submitted"} on{" "}
                <time dateTime={item.submittedAt}>{submittedTime.format(new Date(item.submittedAt))} UTC</time>
              </p>
              <p className="text-sm text-muted-foreground">{accessText(item)}</p>
              <p className="break-all text-xs text-muted-foreground">Intake reference {item.intakeId}</p>
            </div>
            <Button type="submit" variant={item.callerHasAccess ? "outline" : "default"} className="min-h-11 shrink-0 px-4"
              aria-label={`${item.callerHasAccess ? "Continue review" : "Open case"} for ${item.organizationName}, intake ${item.intakeId}`}>
              {item.callerHasAccess ? "Continue review" : "Open case"}
            </Button>
          </form>
        </li>)}
      </ul>
    )}
    {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline underline-offset-4"
      href={`/admin/submissions?afterSubmittedAt=${encodeURIComponent(page.nextCursor.submittedAt)}&afterIntake=${page.nextCursor.intakeId}`}>
      Older intakes
    </Link>}
  </main>;
}
