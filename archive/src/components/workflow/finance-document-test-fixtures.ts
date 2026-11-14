import type { WorkspaceDocumentRow } from "@/lib/workspace-documents";
import type { FinanceDocumentSourcesPage } from "@/lib/finance-document-sources";
export const financeOrg="11111111-1111-4111-8111-111111111111",financeDoc="22222222-2222-4222-8222-222222222222",
  financeVersion="33333333-3333-4333-8333-333333333333",financeAccess="44444444-4444-4444-8444-444444444444",
  financeVendor="55555555-5555-4555-8555-555555555555";
export const financeRow:WorkspaceDocumentRow={documentId:financeDoc,versionId:financeVersion,version:1,isCurrent:true,state:"needs_review",revision:5,
  fileName:"Synthetic finance original.pdf",contentType:"application/pdf",byteSize:12,failureCode:null,createdAt:"2026-10-01T00:00:00Z",updatedAt:"2026-10-01T00:00:00Z"};
export const financeSources:FinanceDocumentSourcesPage={organizationId:financeOrg,correlationId:financeAccess,workspaceType:"internal",
  choices:[{choiceId:financeVendor,vendorLabel:"Verified vendor",dealLabel:null,source:{sourceClass:"agreement",vendorOrganizationId:financeVendor}}],nextCursor:null,documentBinding:null};
