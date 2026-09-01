import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as audit from "./schema/audit";
import * as aiRun from "./schema/ai-run";
import * as crm from "./schema/crm";
import * as crmActivity from "./schema/crm-activity";
import * as crmWorkflow from "./schema/crm-workflow";
import * as workflowFoundation from "./schema/workflow-foundation";
import * as identity from "./schema/identity";
import * as identityAdmin from "./schema/identity-admin";
import * as leads from "./schema/leads";
import * as permissions from "./schema/permissions";
import * as r3Intake from "./schema/r3-intake";
import * as r3Scorecard from "./schema/r3-scorecard";
import * as r3Workspace from "./schema/r3-workspace";
import * as r6Workflow from "./schema/r6-workflow";
import * as r7Finance from "./schema/r7-finance";
import * as r8Operations from "./schema/r8-operations";

export const schema = {
  ...audit,
  ...aiRun,
  ...crm,
  ...crmActivity,
  ...crmWorkflow,
  ...workflowFoundation,
  ...identity,
  ...identityAdmin,
  ...leads,
  ...permissions,
  ...r3Intake,
  ...r3Scorecard,
  ...r3Workspace,
  ...r6Workflow,
  ...r7Finance,
  ...r8Operations,
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// The runtime pool must use the restricted worker login. It receives no raw
// table DML in R1.2. Request-scoped user data still uses a Supabase client with
// the caller's verified token. Migrations use MIGRATION_DATABASE_URL elsewhere.
const client = postgres(connectionString, { max: 10, max_lifetime: 60 });

export const db = drizzle(client, { schema });

export * from "./schema/audit";
export * from "./schema/ai-run";
export * from "./schema/crm";
export * from "./schema/crm-activity";
export * from "./schema/crm-workflow";
export * from "./schema/workflow-foundation";
export * from "./schema/identity";
export * from "./schema/identity-admin";
export * from "./schema/leads";
export * from "./schema/permissions";
export * from "./schema/r3-intake";
export * from "./schema/r3-scorecard";
export * from "./schema/r3-workspace";
export * from "./schema/r6-workflow";
export * from "./schema/r7-finance";
export * from "./schema/r8-operations";
