import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";
import { requirePagePermission, readSelectedOrganizationId } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { searchStaffAudit } from "@/server/audit/staff-audit-read";
import { StaffAuditSearch } from "@/components/workflow/staff-audit-search";

export default async function AuditPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { authorization } = await requirePagePermission("admin.access", { kind: "platform" });
  const parsed = z.strictObject({ scope: z.enum(["platform", "workspace"]).default("platform") }).safeParse(await searchParams);
  if (!parsed.success) notFound();
  const organizationId = parsed.data.scope === "workspace" ? await readSelectedOrganizationId() : null;
  if (parsed.data.scope === "workspace" && !organizationId) forbidden();
  let initialPage;
  try { initialPage = await searchStaffAudit({ organizationId }, { supabase: authorization.supabase }); }
  catch (error) { if (error instanceof AuthorizationError) forbidden(); throw error; }
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
    <header className="space-y-3"><Link href="/admin" className="inline-flex min-h-11 items-center underline">Back to administration</Link>
      <h1 className="text-3xl font-semibold">Audit events</h1>
      <p>{organizationId ? "Search the selected workspace events." : "Search platform events."}</p>
      <nav aria-label="Audit scope" className="flex flex-wrap gap-4">
        <Link href="/admin/audit?scope=platform" className="inline-flex min-h-11 items-center underline">Platform events</Link>
        <Link href="/admin/audit?scope=workspace" className="inline-flex min-h-11 items-center underline">Selected workspace events</Link>
        <Link href="/workspaces" className="inline-flex min-h-11 items-center underline">Select a workspace</Link>
      </nav>
    </header>
    <StaffAuditSearch key={organizationId ?? "platform"} organizationId={organizationId} initialPage={initialPage}/>
  </main>;
}
