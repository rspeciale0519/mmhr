import { requireLaunchArea } from "@/lib/launch-surface-guard";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden,notFound } from "next/navigation";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "@/server/commands/finance-document-upload";
import { getManagedFinancePage,getManagedFinanceDetail } from "@/server/commands/managed-finance";
import { CommercialFinanceClientWorkspace } from "@/components/workflow/commercial-finance-client";
const querySchema=z.strictObject({view:z.enum(["agreements","contracts","calculations","agreement","contract","calculation"]).optional(),
  entityId:z.uuid().optional(),afterId:z.uuid().optional(),beforeVersion:z.string().regex(/^[1-9][0-9]{0,9}$/).transform(Number)
    .pipe(z.number().int().min(1).max(2_147_483_647)).optional()}).refine(value=>{
  const detail=["agreement","contract","calculation"].includes(value.view??"");
  return detail?Boolean(value.entityId)&&!value.afterId&&(value.view!=="calculation"||value.beforeVersion===undefined)
    :!value.entityId&&value.beforeVersion===undefined;
});
const membershipsSchema=z.array(z.strictObject({organization_id:z.uuid(),organization_name:z.string().trim().min(1).max(200).nullable(),
  organization_type:z.enum(["internal","customer","vendor"]),organization_status:z.literal("active"),
  role_key:z.enum(["organization_admin","contributor","viewer"]).nullable()})).refine(rows=>new Set(rows.map(row=>row.organization_id)).size===rows.length);
export default async function CommercialFinancePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  requireLaunchArea("finance");
  const {authorization}=await requireSelectedOrganizationPermission("finance.manage");
  if(authorization.scope.kind!=="organization"||authorization.assurance!=="aal2")forbidden();
  const parsed=querySchema.safeParse(await searchParams);if(!parsed.success)notFound();
  const organizationId=authorization.scope.organizationId,correlationId=randomUUID(),options={supabase:authorization.supabase};
  const denied=(error:unknown):never=>{if(error instanceof AuthorizationError)notFound();throw error;};
  const authority=await requireFinanceDocumentAuthority(organizationId,correlationId,options).catch(denied);
  const response=await authority.supabase.rpc("mmhr_get_my_memberships");
  const memberships=membershipsSchema.safeParse(response.error?null:response.data);
  if(!memberships.success)throw new Error("Finance workspace could not load");
  const selected=memberships.data.find(row=>row.organization_id===organizationId);
  if(!selected||selected.organization_type==="vendor")notFound();
  const workspaceType=selected.organization_type,workspaceLabel=selected.organization_name??"Organization name restricted";
  const query=parsed.data,view=query.view??(workspaceType==="internal"?"agreements":"contracts");
  if(workspaceType==="internal"?!["agreements","agreement"].includes(view):["agreements","agreement"].includes(view))notFound();
  if(view==="agreement"||view==="contract"||view==="calculation"){
    if(!query.entityId)notFound();const request={organizationId,correlationId,view,entityId:query.entityId,...(query.beforeVersion?{beforeVersion:query.beforeVersion}:{})};
    const initialData=await getManagedFinanceDetail(request,options).catch(denied);
    return <CommercialFinanceClientWorkspace workspaceType={workspaceType} workspaceLabel={workspaceLabel} request={request} initialData={initialData}/>;
  }
  const request={organizationId,correlationId,view,...(query.afterId?{afterId:query.afterId}:{})};
  const initialData=await getManagedFinancePage(request,options).catch(denied);
  return <CommercialFinanceClientWorkspace workspaceType={workspaceType} workspaceLabel={workspaceLabel} request={request} initialData={initialData}/>;
}

