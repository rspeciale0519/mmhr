import { requirePagePermission } from "@/server/auth/page-guards";
import Link from "next/link";
import { isLaunchAreaEnabled } from "@/lib/launch-surface";
import { staffAuditNavigation } from "@/server/audit/staff-audit-navigation";

export default async function AdminHome() {
  const { authorization } = await requirePagePermission("admin.access", { kind: "platform" });
  const auditHref = await staffAuditNavigation(authorization);
  const candidateB = isLaunchAreaEnabled("candidate-b");
  const finance = isLaunchAreaEnabled("finance");
  const documents = isLaunchAreaEnabled("documents");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Administration</h1>
      <p className="text-sm">You have access to internal administration.</p>
      {auditHref && <Link href={auditHref} className="inline-flex min-h-11 items-center underline">Search audit events</Link>}
      <Link href="/admin/submissions" className="inline-flex min-h-11 items-center underline">Open submitted customer intakes</Link>
      <Link href="/admin/vendors" className="inline-flex min-h-11 items-center underline">Add vendors and invite vendor users</Link>
      <Link href="/workspaces" className="inline-flex min-h-11 items-center underline">Select a customer workspace</Link>
      <Link href="/admin/evaluations" className="inline-flex min-h-11 items-center underline">Review customer evaluations and RFPs</Link>
      <Link href="/admin/vendor-evidence" className="inline-flex min-h-11 items-center underline">Review vendor evidence</Link>
      {candidateB && <Link href="/admin/demos" className="inline-flex min-h-11 items-center underline">Coordinate customer and vendor demos</Link>}
      {candidateB && <Link href="/admin/proposals" className="inline-flex min-h-11 items-center underline">Review proposals and pricing comparisons</Link>}
      {candidateB && <Link href="/admin/contracts" className="inline-flex min-h-11 items-center underline">Approve vendor selections and track contract handoffs</Link>}
      <Link href="/admin/tasks" className="inline-flex min-h-11 items-center underline">Manage customer deal follow-up tasks</Link>
      {finance && <Link href="/admin/finance/documents" className="inline-flex min-h-11 items-center underline">Manage private finance documents</Link>}
      {finance && <Link href="/admin/finance/commercial" className="inline-flex min-h-11 items-center underline">Manage commission agreements and calculations</Link>}
      {documents && <Link href="/documents" className="inline-flex min-h-11 items-center underline">View selected workspace documents</Link>}
    </main>
  );
}
