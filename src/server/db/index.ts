import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as audit from "./schema/audit";
import * as aiRun from "./schema/ai-run";
import * as aiEvaluation from "./schema/ai-evaluation";
import * as crm from "./schema/crm";
import * as customerRegistration from "./schema/customer-registration";
import * as crmActivity from "./schema/crm-activity";
import * as crmExport from "./schema/crm-export";
import * as crmDuplicate from "./schema/crm-duplicate";
import * as crmWorkflow from "./schema/crm-workflow";
import * as workflowFoundation from "./schema/workflow-foundation";
import * as portalResponse from "./schema/r4-portal-response";
import * as documentUploads from "./schema/r4-document-uploads";
import * as documentScanReaders from "./schema/r4-document-scan-readers";
import * as documentAccess from "./schema/r4-document-access";
import * as identity from "./schema/identity";
import * as identityAdmin from "./schema/identity-admin";
import * as leads from "./schema/leads";
import * as permissions from "./schema/permissions";
import * as r3Intake from "./schema/r3-intake";
import * as r3Matching from "./schema/r3-matching";
import * as r3Evaluation from "./schema/r3-evaluation";
import * as r3Scorecard from "./schema/r3-scorecard";
import * as r3Workspace from "./schema/r3-workspace";
import * as r3Publication from "./schema/r3-publication";
import * as r3Selection from "./schema/r3-selection";
import * as r3Disclosure from "./schema/r3-disclosure";
import * as r6Workflow from "./schema/r6-workflow";
import * as proposalQuotes from "./schema/r6-proposal-quotes";
import * as contractPortal from "./schema/r6-contract-portal";
import * as r7Finance from "./schema/r7-finance";
import * as financeDocuments from "./schema/r7-finance-documents";
import * as managedFinance from "./schema/r7-managed-finance";
import * as managedInvoices from "./schema/r7-managed-invoice";
import * as r8Operations from "./schema/r8-operations";
import * as dealFollowUps from "./schema/r8-deal-follow-ups";
import * as rfpReceipts from "./schema/r4-rfp-receipts";
import * as rfpVendorForms from "./schema/r4-rfp-vendor-forms";
import * as r9Evidence from "./schema/r9-evidence";

export const schema = {
  ...customerRegistration,
  ...audit,
  ...aiRun,
  ...aiEvaluation,
  ...crm,
  ...crmActivity,
  ...crmExport,
  ...crmDuplicate,
  ...crmWorkflow,
  ...workflowFoundation,
  ...portalResponse,
  ...documentUploads,
  ...documentScanReaders,
  ...documentAccess,
  ...identity,
  ...identityAdmin,
  ...leads,
  ...permissions,
  ...r3Intake,
  ...r3Matching,
  ...r3Evaluation,
  ...r3Scorecard,
  ...r3Workspace,
  ...r3Publication,
  ...r3Selection,
  ...r3Disclosure,
  ...r6Workflow,
  ...proposalQuotes,
  ...contractPortal,
  ...r7Finance,
  ...financeDocuments,
  ...managedFinance,
  ...managedInvoices,
  ...r8Operations,
  ...dealFollowUps,
  ...rfpReceipts,
  ...rfpVendorForms,
  ...r9Evidence,
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// The runtime pool must use the restricted worker login. It receives no raw
// table DML in R1.2. Request-scoped user data still uses a Supabase client with
// the caller's verified token. Migrations use MIGRATION_DATABASE_URL elsewhere.
export function createRuntimeDatabase(url: string) {
  const client = postgres(url, { max: 10, max_lifetime: 60 });
  return drizzle(client, { schema });
}

export const db = createRuntimeDatabase(connectionString);

export * from "./schema/audit";
export * from "./schema/ai-run";
export * from "./schema/ai-evaluation";
export * from "./schema/crm";
export * from "./schema/crm-activity";
export * from "./schema/crm-export";
export * from "./schema/crm-duplicate";
export * from "./schema/crm-workflow";
export * from "./schema/workflow-foundation";
export * from "./schema/r4-portal-response";
export * from "./schema/r4-document-uploads";
export * from "./schema/r4-document-scan-readers";
export * from "./schema/identity";
export * from "./schema/identity-admin";
export * from "./schema/leads";
export * from "./schema/permissions";
export * from "./schema/r3-intake";
export * from "./schema/r3-matching";
export * from "./schema/r3-evaluation";
export * from "./schema/r3-scorecard";
export * from "./schema/r3-workspace";
export * from "./schema/r3-publication";
export * from "./schema/r3-selection";
export * from "./schema/r3-disclosure";
export * from "./schema/r6-workflow";
export * from "./schema/r6-contract-portal";
export * from "./schema/r7-finance";
export * from "./schema/r7-finance-documents";
export * from "./schema/r7-managed-finance";
export * from "./schema/r7-managed-invoice";
export * from "./schema/r8-operations";
export * from "./schema/r8-deal-follow-ups";
export * from "./schema/r4-rfp-receipts";
export * from "./schema/r4-rfp-vendor-forms";
export * from "./schema/r9-evidence";
