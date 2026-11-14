import { requireLaunchArea } from "@/lib/launch-surface-guard";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden, notFound } from "next/navigation";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "@/server/commands/finance-document-upload";
import { getManagedInvoiceDetail } from "@/server/commands/managed-invoice";
import { verifyManagedInvoiceDetail } from "@/lib/managed-invoice";
import { ManagedInvoiceClientWorkspace } from "@/components/workflow/managed-invoice-client";

const querySchema = z.strictObject({ commissionEventId: z.uuid(), invoiceId: z.uuid().optional(), afterPreparationId: z.uuid().optional() });
const membershipsSchema = z.array(z.strictObject({ organization_id: z.uuid(), organization_name: z.string().trim().min(1).max(200).nullable(),
  organization_type: z.enum(["internal", "customer", "vendor"]), organization_status: z.literal("active"),
  role_key: z.enum(["organization_admin", "contributor", "viewer"]).nullable() }))
  .refine(rows => new Set(rows.map(row => row.organization_id)).size === rows.length);

export default async function ManagedInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireLaunchArea("finance");
  const { authorization } = await requireSelectedOrganizationPermission("finance.manage");
  if (authorization.scope.kind !== "organization" || authorization.assurance !== "aal2") forbidden();
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const organizationId = authorization.scope.organizationId, correlationId = randomUUID();
  const denied = (error: unknown): never => { if (error instanceof AuthorizationError) notFound(); throw error; };
  const authority = await requireFinanceDocumentAuthority(organizationId, correlationId, { supabase: authorization.supabase }).catch(denied);
  const memberships = await authority.supabase.rpc("mmhr_get_my_memberships");
  const parsed = membershipsSchema.safeParse(memberships.error ? null : memberships.data);
  if (!parsed.success) throw new Error("Invoice workspace could not load");
  const selected = parsed.data.find(row => row.organization_id === organizationId);
  if (!selected || selected.organization_type !== "customer") notFound();
  const request = { ...query.data, organizationId, correlationId };
  const initialData = verifyManagedInvoiceDetail(await getManagedInvoiceDetail(request, { supabase: authority.supabase }).catch(denied), request, authority.identityId);
  return <ManagedInvoiceClientWorkspace request={request} actorIdentityId={authority.identityId} workspaceType="customer"
    workspaceLabel={selected.organization_name ?? "Organization name restricted"} initialData={initialData} />;
}
