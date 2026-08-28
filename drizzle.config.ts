import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";

dotenv.config({ path: ".env.local" });

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl) {
  throw new Error("MIGRATION_DATABASE_URL is not set");
}

const parsedMigrationUrl = new URL(migrationUrl);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
if (!loopbackHosts.has(parsedMigrationUrl.hostname)) {
  throw new Error("MIGRATION_DATABASE_URL must use the local Supabase host");
}

const supabaseConfig = readFileSync("supabase/config.toml", "utf8");
const databaseSection = supabaseConfig.match(/\[db\]([\s\S]*?)(?:\r?\n\[|$)/);
const configuredPort = databaseSection?.[1]?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1];
if (!configuredPort || parsedMigrationUrl.port !== configuredPort) {
  throw new Error("MIGRATION_DATABASE_URL does not match the local Supabase port");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/*.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationUrl,
  },
  verbose: true,
  strict: true,
});
