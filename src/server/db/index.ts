import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as audit from "./schema/audit";
import * as crm from "./schema/crm";
import * as identity from "./schema/identity";
import * as identityAdmin from "./schema/identity-admin";
import * as leads from "./schema/leads";
import * as permissions from "./schema/permissions";
import * as r3Intake from "./schema/r3-intake";

export const schema = {
  ...audit,
  ...crm,
  ...identity,
  ...identityAdmin,
  ...leads,
  ...permissions,
  ...r3Intake,
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
export * from "./schema/crm";
export * from "./schema/identity";
export * from "./schema/identity-admin";
export * from "./schema/leads";
export * from "./schema/permissions";
export * from "./schema/r3-intake";
