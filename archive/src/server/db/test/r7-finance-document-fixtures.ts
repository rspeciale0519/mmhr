import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { elevatedClient, verifiedApiClaims, type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { seedQuoteWorkflow, syntheticQuote } from "./r6-proposal-quote-fixtures";
import type { SecurityPrincipal, SecurityTokenPrincipal } from "@/server/db/r1-security-command-fixtures";

/** This helper builds the stored signature through real portal commands. It does not insert signed rows. */
export async function seedSignedFinanceDocumentSourceWithPortal(fixture: SecurityCommandApiFixtures) {
  const customer=await fixture.createSyntheticPrincipal(), left=await fixture.createSyntheticPrincipal(), right=await fixture.createSyntheticPrincipal();
  async function portal(actor: SecurityApiPrincipal): Promise<SecurityTokenPrincipal> {
    const claims=await verifiedApiClaims(actor.aal1,"aal1");
    return { identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,expiresAt:new Date(claims.expiresAt) };
  }
  async function staff(actor: SecurityApiPrincipal): Promise<SecurityPrincipal> {
    const claims=await verifiedApiClaims(elevatedClient(actor),"aal2");
    const [session]=await fixture.owner<{factor_id:string|null}[]>`SELECT factor_id FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
    if(!session?.factor_id)throw new Error("Genuine MFA session required");
    return { identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,factorId:session.factor_id,expiresAt:new Date(claims.expiresAt) };
  }
  const pair=await Promise.all(fixture.pair.map(staff)), admin=await staff(fixture.organizationAdmin);
  const actors=await Promise.all([customer,left,right].map(portal));
  const target=await fixture.owner.begin(async sql=>{
    const [membership]=await sql<{id:string}[]>`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${pair[0]!.identityId}::uuid,${pair[0]!.subject}::uuid,'contributor','contributor',false) RETURNING id`;
    return seedQuoteWorkflow(sql,{organizationId:fixture.organizationId,pair:[pair[0]!,pair[1]!],organizationAdmin:admin,target:admin,
      adminMembershipId:fixture.adminMembershipId,actorMembershipId:membership!.id,targetMembershipId:fixture.adminMembershipId},
      {customer:actors[0]!,vendors:[actors[1]!,actors[2]!]});
  });
  async function command(client: SupabaseClient, name:string, payload:object): Promise<Record<string,unknown>> {
    const response=await client.rpc(name,{payload,correlation_id:randomUUID(),idempotency_key:randomUUID()});
    if(response.error||!response.data)throw new Error("Synthetic signed source command failed");
    return response.data as Record<string,unknown>;
  }
  const vendor=target.vendors[0]!;
  const submitted=await command(left.aal1,"mmhr_record_proposal_quote",{action:"submit",organizationId:vendor.organizationId,
    recipientId:vendor.recipientId,expectedVersion:0,quote:syntheticQuote});
  const quoteId=String(submitted.proposalVersionId);
  for(const [actor,action,revision] of [[fixture.pair[0],"review",1],[fixture.pair[1],"approve",2]] as const){
    await command(elevatedClient(actor),"mmhr_record_proposal_quote",{action,organizationId:fixture.organizationId,proposalVersionId:quoteId,
      expectedRevision:revision,reason:"Synthetic finance source quote decision",...(action==="approve"?{approvalReference:"Synthetic independent quote approval"}:{})});
  }
  const selected=await command(customer.aal1,"mmhr_record_portal_contract_handoff",{action:"select",organizationId:fixture.organizationId,
    intakeId:target.intakeId,comparisonId:null,proposalVersionId:quoteId,expectedQuoteRevision:3,
    selectionReasons:["Synthetic customer decision"],remainingRisks:[]});
  const approved=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",{action:"approve_selection",
    organizationId:fixture.organizationId,selectionId:selected.selectionId,expectedRevision:1,reason:"Synthetic source staff decision",
    approvalReference:"Synthetic source approval receipt"});
  const handoffId=String(approved.handoffId), client=elevatedClient(fixture.pair[0]);
  await command(client,"mmhr_record_portal_contract_handoff",{action:"introduce",organizationId:fixture.organizationId,handoffId,expectedRevision:1,
    reason:"Synthetic parties introduced",introducedAt:new Date().toISOString(),introductionReference:"Synthetic introduction evidence"});
  await command(client,"mmhr_record_portal_contract_handoff",{action:"transition",organizationId:fixture.organizationId,handoffId,expectedRevision:2,
    fromStatus:"introduced",toStatus:"negotiating",reason:"Synthetic contract negotiation"});
  await command(client,"mmhr_record_portal_contract_handoff",{action:"record_signed",organizationId:fixture.organizationId,handoffId,expectedRevision:3,
    reason:"Synthetic signature recorded",signedAt:new Date().toISOString(),contractReference:"Synthetic signed original reference"});
  const [proof]=await fixture.owner<{contract_id:string;deal_id:string}[]>`SELECT p.contract_id,h.deal_id FROM public.portal_contract_handoff_details p
    JOIN public.contract_handoffs h ON h.id=p.handoff_id WHERE p.handoff_id=${handoffId}::uuid AND h.status='signed'`;
  if(!proof)throw new Error("Stored synthetic signature missing");
  const candidates=await fixture.owner<{id:string}[]>`SELECT c.id FROM public.evaluation_candidates c
    WHERE c.organization_id=${fixture.organizationId}::uuid AND c.intake_id=${target.intakeId}::uuid AND c.product_id=${vendor.productId}::uuid`;
  if(candidates.length!==1)throw new Error("Stored synthetic candidate missing or ambiguous");
  return {source:{ sourceClass:"signed_contract" as const,vendorOrganizationId:vendor.organizationId,contractId:proof.contract_id,handoffId,dealId:proof.deal_id },
    customer,vendor:left,recipientId:vendor.recipientId,candidateId:candidates[0]!.id,intakeId:target.intakeId};
}
export async function seedSignedFinanceDocumentSource(fixture:SecurityCommandApiFixtures){
  return (await seedSignedFinanceDocumentSourceWithPortal(fixture)).source;
}
