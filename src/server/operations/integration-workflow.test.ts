// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const { load } = require("js-yaml") as { load: (source: string) => Workflow };
type Step = { id?: string; name?: string; run?: string; uses?: string; if?: string; with?: Record<string, unknown>; "continue-on-error"?: boolean | string };
type Job = { name?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string>; needs?: string | string[]; steps?: Step[]; "continue-on-error"?: boolean | string };
type Workflow = { on: Record<string, { inputs?: Record<string, { default?: string; options?: string[] }> } | null>; jobs: Record<string, Job> };
const workflow = (name: string) => load(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
const excludedFeatureFiles = (JSON.parse(readFileSync("scripts/integration-excluded-features.json", "utf8")) as { files: string[] }).files;
function listIntegrationFiles(scope: string) {
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "list", "--config", "vitest.integration.config.ts", "--filesOnly"], {
    encoding: "utf8", timeout: 60_000, windowsHide: true,
    env: { ...process.env, R1_REHEARSAL_ONLY: "1", MMHR_INTEGRATION_SCOPE: scope },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}`,
    files: result.stdout.split(/\r?\n/).filter(line => line.endsWith(".integration.test.ts")).sort() };
}

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

describe("excluded-feature integration scope (owner decision D9)", () => {
  test("blocks pull requests on launch files and only reports excluded-feature files", () => {
    const ci = workflow("ci");
    expect(ci.jobs.integration).toMatchObject({ uses: "./.github/workflows/integration.yml", with: { scope: "launch" } });
    expect(ci.jobs["integration-excluded-features"]).toMatchObject({
      uses: "./.github/workflows/integration.yml", with: { scope: "excluded-features" } });
    for (const job of Object.values(ci.jobs)) expect(job["continue-on-error"]).toBeUndefined();

    const job = workflow("integration").jobs.integration;
    expect(job.env?.MMHR_INTEGRATION_SCOPE).toBe("${{ inputs.scope }}");
    expect(job["continue-on-error"]).toBeUndefined();
    const tests = job.steps!.find(step => step.run === "npm run test:integration")!;
    expect(tests["continue-on-error"]).toBe("${{ inputs.scope == 'excluded-features' }}");
    expect(job.steps!.find(step => step.if?.includes(`steps.${tests.id}.outcome == 'failure'`))?.run).toContain("::warning ");
  });

  test("keeps the full blocking suite as the default for releases and manual runs", () => {
    const integration = workflow("integration");
    expect(integration.on.workflow_call?.inputs?.scope?.default).toBe("all");
    expect(integration.on.workflow_dispatch?.inputs?.scope).toMatchObject({
      default: "all", options: ["all", "launch", "excluded-features"] });
    expect(workflow("production-release-gate").jobs["integration-tests"].with).toBeUndefined();
  });

  test("splits the integration files into two disjoint scopes that cover every file", () => {
    const all = listIntegrationFiles("all"), launch = listIntegrationFiles("launch");
    const excluded = listIntegrationFiles("excluded-features");
    expect([all.status, launch.status, excluded.status]).toEqual([0, 0, 0]);
    expect(excluded.files).toEqual([...excludedFeatureFiles].sort());
    expect(launch.files.filter(file => excluded.files.includes(file))).toEqual([]);
    expect([...launch.files, ...excluded.files].sort()).toEqual(all.files);
    expect(launch.files.length).toBeGreaterThan(0);
  }, 120_000);

  test("refuses an unknown scope instead of running a different file set", () => {
    const result = listIntegrationFiles("everything");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Unknown MMHR_INTEGRATION_SCOPE: everything");
    expect(result.files).toEqual([]);
  }, 60_000);

  test("passes the scope through the worker wrapper's rehearsal environment", () => {
    const wrapper = readFileSync("scripts/r1-with-local-worker.mjs", "utf8");
    const allowlist = wrapper.slice(wrapper.indexOf("function rehearsalEnvironment()"), wrapper.indexOf("function validateLocalMigrationUrl("));
    expect(allowlist).toContain('"MMHR_INTEGRATION_SCOPE"');
  });
});
