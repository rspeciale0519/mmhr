import { managedFinanceDetailPageSchema } from "@/lib/managed-finance-reads";
import { managedFinanceOriginalChoicesPageSchema } from "@/lib/managed-finance-originals";
import type { ManagedFinanceCommand } from "@/lib/managed-finance-workflow";
export const commercialId=(value:number)=>`10000000-0000-4000-8000-${String(value).padStart(12,"0")}`;
export const commercialOrg=commercialId(1),commercialCorrelation=commercialId(2),commercialAccess=commercialId(30);
export const commercialDocument={documentId:commercialId(6),versionId:commercialId(7),version:1,isCurrent:true,state:"approved",revision:6,
  fileName:"Synthetic original.pdf",contentType:"application/pdf",byteSize:64,failureCode:null,createdAt:"2026-10-03T09:00:00Z",updatedAt:"2026-10-03T10:00:00Z"};
export const commercialOriginal={organizationId:commercialOrg,documentId:commercialId(6),versionId:commercialId(7),sha256:"a".repeat(64),
  fileName:commercialDocument.fileName,currentDocumentVersion:1,originalVersion:1,document:commercialDocument};
const decision={state:"pending",revision:1,preparedByIdentityId:commercialId(21),preparedByLabel:"Synthetic preparer",preparedAt:"2026-10-03T10:00:00Z",
  decidedByIdentityId:null,decidedByLabel:null,decidedAt:null,decisionReason:null,canDecide:true,canApprove:true,canReject:true};
export function commercialAgreement(){
  const value=managedFinanceDetailPageSchema.parse({organizationId:commercialOrg,correlationId:commercialCorrelation,entityId:commercialId(3),currentActorIdentityId:commercialId(20),view:"agreement",
    agreement:{agreementId:commercialId(3),vendorOrganizationId:commercialId(4),vendorLabel:"Synthetic vendor",seriesRevision:0,currentApprovedVersionId:null,pendingVersionCount:1},
    versions:[{...decision,versionId:commercialId(10),version:1,predecessorVersionId:null,expectedSeriesRevision:0,original:commercialOriginal,sourceDigest:"b".repeat(64),
      effectiveFrom:"2026-10-03T10:00:00Z",statedEffectiveEnd:null,rule:{kind:"flat_amount",amountMinorUnits:0,currency:"USD"},conditionReferences:[]}],nextVersion:null});
  if(value.view!=="agreement")throw new Error("Invalid synthetic agreement fixture");return value;
}
export function commercialContract(){
  const value=managedFinanceDetailPageSchema.parse({organizationId:commercialOrg,correlationId:commercialCorrelation,entityId:commercialId(11),currentActorIdentityId:commercialId(20),view:"contract",
    contract:{contractId:commercialId(11),handoffId:commercialId(12),dealId:commercialId(13),dealLabel:"Synthetic customer / Platform / Signed",vendorOrganizationId:commercialId(4),vendorLabel:"Synthetic vendor",
      signedAt:"2026-10-02T10:00:00Z",approvedFactsVersionId:null,commissionEventId:null,commissionState:null,currentFactsRevision:0,currentEventRevision:null,currentSourceDigest:null,
      canResolveEligibility:true,canPrepareCalculation:false},versions:[{...decision,versionId:commercialId(14),version:1,predecessorVersionId:null,expectedFactsRevision:0,
        original:commercialOriginal,sourceDigest:"b".repeat(64),contractValue:{amountMinorUnits:null,currency:null},sourceReference:"signed section 3"}],nextVersion:null});
  if(value.view!=="contract")throw new Error("Invalid synthetic contract fixture");return value;
}
export function commercialCalculation(){
  const value=managedFinanceDetailPageSchema.parse({organizationId:commercialOrg,correlationId:commercialCorrelation,entityId:commercialId(15),view:"calculation",
    calculation:{...decision,calculationId:commercialId(15),commissionEventId:commercialId(16),contractId:commercialId(11),dealLabel:"Synthetic customer / Platform / Signed",vendorLabel:"Synthetic vendor",
      calculationRevision:7,amountMinorUnits:0,currency:"USD",blockerCodes:[],expectedEventRevision:4,currentEventRevision:4,expectedSourceDigest:"b".repeat(64),currentSourceDigest:"b".repeat(64),
      factsVersionId:commercialId(14),agreementVersionId:commercialId(10),agreementOrganizationId:commercialId(17),contractOriginal:commercialOriginal,
      agreementOriginal:{...commercialOriginal,organizationId:commercialId(17)},contractValue:{amountMinorUnits:null,currency:null},rule:{kind:"flat_amount",amountMinorUnits:0,currency:"USD"},
      conditionReferences:[],currentActorIdentityId:commercialId(20)}});
  if(value.view!=="calculation")throw new Error("Invalid synthetic calculation fixture");return value;
}
export function commercialChoices(contract=false){
  const source=contract?{sourceClass:"signed_contract",vendorOrganizationId:commercialId(4),contractId:commercialId(11),handoffId:commercialId(12),dealId:commercialId(13)}
    :{sourceClass:"agreement",vendorOrganizationId:commercialId(4)};
  return managedFinanceOriginalChoicesPageSchema.parse({organizationId:commercialOrg,correlationId:commercialCorrelation,source,items:[{original:{organizationId:commercialOrg,
    documentId:commercialId(6),versionId:commercialId(7),sha256:"a".repeat(64)},document:commercialDocument,vendorLabel:"Synthetic vendor",dealLabel:contract?"Synthetic customer / Platform / Signed":null}],nextCursor:null});
}
export function commercialResult(input:ManagedFinanceCommand){
  const common={organizationId:input.organizationId,correlationId:input.correlationId,action:input.action,outcomeCode:"recorded",revision:
    "expectedRevision" in input?input.expectedRevision+1:"expectedCalculationRevision" in input?input.expectedCalculationRevision+1:1};
  if("agreementId" in input)return {...common,entityId:input.versionId,agreementId:input.agreementId};
  if(input.action==="resolve_eligibility")return {...common,entityId:commercialId(16),contractId:input.contractId,handoffId:input.handoffId};
  if("contractId" in input)return {...common,entityId:input.versionId,contractId:input.contractId};
  return {...common,entityId:input.calculationId,commissionEventId:input.commissionEventId};
}
