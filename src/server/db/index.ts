import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as identity from "./schema/identity";
import * as leads from "./schema/leads";

export const schema = { ...identity, ...leads };

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Postgres.js pool. This connects as the `postgres` superuser locally, which
// bypasses RLS by design — it is the server-side/migration path. Request-scoped
// queries that must honour RLS go through the Supabase client with the caller's
// JWT, not through this pool.
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export * from "./schema/identity";
export * from "./schema/leads";
