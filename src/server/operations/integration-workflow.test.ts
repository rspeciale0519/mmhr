// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const { load } = require("js-yaml") as { load: (source: string) => Workflow };
type Step = { name?: string; run?: string; uses?: string; if?: string; with?: Record<string, unknown>; "continue-on-error"?: boolean };
type Job = { uses?: string; needs?: string | string[]; steps?: Step[]; "continue-on-error"?: boolean };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };
const workflow = (name: string) => load(readFileSync(`.github/workflows/${name}.yml`, "utf8"));

describe("integration release workflow", () => {
  test.each(["ci", "production-release-gate"])("blocks %s on dependency audit failures", (name) => {
    const steps = Object.values(workflow(name).jobs).flatMap((job) => job.steps ?? []);
    const audit = steps.find((step) => step.run === "npm run check:dependency-audit");
    expect(audit).toBeDefined();
    expect(audit?.["continue-on-error"]).not.toBe(true);
  });

  test("runs the same integration job in pull requests and releases", () => {
    expect(workflow("ci").on).toHaveProperty("pull_request");
    expect(workflow("ci").jobs.integration.uses).toBe("./.github/workflows/integration.yml");
    const release = workflow("production-release-gate");
    expect(release.jobs["integration-tests"].uses).toBe("./.github/workflows/integration.yml");
    expect(release.jobs.evidence.needs).toContain("integration-tests");
    expect(release.jobs["integration-tests"]["continue-on-error"]).not.toBe(true);
  });

  test("starts Auth and API services before migration and integration tests", () => {
    const steps = workflow("integration").jobs.integration.steps!;
    const commands = steps.map((step) => step.run ?? "");
    const start = commands.findIndex((command) => command.startsWith("supabase start "));
    const migrate = commands.indexOf("npx drizzle-kit migrate");
    const tests = commands.indexOf("npm run test:integration");
    expect(start).toBeGreaterThan(-1);
    expect(migrate).toBeGreaterThan(start);
    expect(tests).toBeGreaterThan(migrate);
    expect(commands[start]).not.toMatch(/gotrue|postgrest|kong|ignore-health-check/);
    expect(commands).not.toContain("supabase db start");
  });

  test("pins the CLI and cleans up disposable services after failures", () => {
    const steps = workflow("integration").jobs.integration.steps!;
    expect(steps.find((step) => step.uses === "supabase/setup-cli@v1")?.with?.version)
      .toMatch(/^\d+\.\d+\.\d+$/);
    expect(steps.at(-1)).toMatchObject({ if: "always()", run: "supabase stop --no-backup" });
  });

  test("masks generated database credentials before exporting them", () => {
    const steps = workflow("integration").jobs.integration.steps!;
    const configure = steps.find((step) => step.name === "Configure local integration environment")!.run!;
    expect(configure).toContain("set -euo pipefail");
    expect(configure.indexOf("::add-mask::$db_url")).toBeLessThan(configure.indexOf("MIGRATION_DATABASE_URL="));
    expect(configure.indexOf("::add-mask::$anon_key")).toBeLessThan(configure.indexOf("NEXT_PUBLIC_SUPABASE_ANON_KEY="));
    expect(configure).toContain(".SERVICE_ROLE_KEY");
    expect(configure.indexOf("::add-mask::$service_key")).toBeGreaterThan(-1);
    expect(configure.indexOf("::add-mask::$service_key")).toBeLessThan(configure.indexOf("SUPABASE_SERVICE_ROLE_KEY="));
  });
});
