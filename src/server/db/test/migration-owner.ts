import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertRestrictedRehearsal, type RestrictedRehearsal } from "../r1-migration-rehearsal";

export function createTestMigrationOwner(rehearsal?: RestrictedRehearsal) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The migration-owner fixture client is test-only");
  }

  if (rehearsal) assertRestrictedRehearsal(rehearsal);
  const connectionString = rehearsal?.context.databaseUrl ?? process.env.TEST_MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_MIGRATION_DATABASE_URL is not set");
  }

  const parsed = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("The migration-owner fixture must use a loopback database");
  }

  const client = postgres(connectionString, { max: 2, prepare: true });
  return {
    client,
    db: drizzle(client),
    close: () => client.end({ timeout: 5 }),
  };
}
