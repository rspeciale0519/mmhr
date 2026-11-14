import { spawn } from "node:child_process";
import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";

const separator = process.argv.indexOf("--");
const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (command.length === 0) {
  throw new Error("A child command is required after --");
}

const normalizePath = (value) => {
  const resolved = path.resolve(projectRoot, value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};
const rehearsalFiles = new Set(
  [
    "src/server/auth/auth.integration.test.ts",
    "src/server/auth/rls.integration.test.ts",
    "src/server/auth/permissions.integration.test.ts",
    "src/server/auth/r1-security.integration.test.ts",
    "src/server/db/db.integration.test.ts",
    "src/server/db/r1-empty-migration.integration.test.ts",
    "src/server/db/r1-account-setup.integration.test.ts",
    "src/server/db/r1-customer-registration.integration.test.ts",
    "src/server/db/r2a-lead-rate-limit.integration.test.ts",
    "src/server/db/r3-intake-read.integration.test.ts",
    "src/server/db/r3-requirement-read.integration.test.ts",
    "src/server/db/r3-requirement-write.integration.test.ts",
    "src/server/db/r1-invitation-command.integration.test.ts",
    "src/server/db/r1-member-read.integration.test.ts",
    "src/server/db/r1-permission-migration-failure.integration.test.ts",
    "src/server/db/r1-security-command.integration.test.ts",
    "src/server/db/r1-security-command-role-lifetime.integration.test.ts",
    "src/server/db/r1-security-command-role-revocation.integration.test.ts",
    "src/server/db/r1-identity-intent.integration.test.ts",
    "src/server/db/r1-recovery-command.integration.test.ts",
    "src/server/db/r1-recovery-mfa.integration.test.ts",
    "src/server/db/r1-recovery-mfa-api.integration.test.ts",
    "src/server/db/r1-identity-worker.integration.test.ts",
    "src/server/db/r2b-crm-foundation.integration.test.ts",
    "src/server/db/r2b-crm-commands.integration.test.ts",
    "src/server/db/r2b-crm-search.integration.test.ts",
    "src/server/db/r2b-crm-export.integration.test.ts",
    "src/server/db/r2b-crm-duplicate.integration.test.ts",
    "src/server/db/r2b-vendor-evidence.integration.test.ts",
    "src/server/db/r2a-lead-routing.integration.test.ts",
      "src/server/db/r3-scorecard-entry.integration.test.ts",
      "src/server/db/r3-scorecard-view.integration.test.ts",
      "src/server/db/r3-initial-evaluation.integration.test.ts",
      "src/server/db/r3-scorecard-create.integration.test.ts",
      "src/server/db/r3-requirement-metadata.integration.test.ts",
      "src/server/db/r3-workspace-view.integration.test.ts",
      "src/server/db/r3-workspace-comment.integration.test.ts",
      "src/server/db/r4-rfp-create.integration.test.ts",
      "src/server/db/r4-rfp-approval.integration.test.ts",
      "src/server/db/r4-rfp-distribution.integration.test.ts",
      "src/server/db/r4-rfp-clarification.integration.test.ts",
      "src/server/db/r4-response-ingestion.integration.test.ts",
      "src/server/db/r4-response-normalization.integration.test.ts",
      "src/server/db/r4-response-review.integration.test.ts",
      "src/server/db/r4-portal-response.integration.test.ts",
      "src/server/db/r4-response-clarifications.integration.test.ts",
      "src/server/db/r4-response-failures.integration.test.ts",
      "src/server/db/r4-communication.integration.test.ts",
      "src/server/db/r4-document-controls.integration.test.ts",
      "src/server/db/r4-document-uploads.integration.test.ts",
      "src/server/db/r4-document-reservations.integration.test.ts",
    "src/server/db/r4-document-reservations-auth.integration.test.ts",
    "src/server/db/r4-document-reads.integration.test.ts",
    "src/server/db/r4-document-reads-auth.integration.test.ts",
      "src/server/integrations/documents/supabase-document-storage.integration.test.ts",
      "src/server/integrations/documents/document-scan-flow.integration.test.ts",
      "src/server/integrations/documents/document-review-access.integration.test.ts",
      "src/server/db/r4-document-worker.integration.test.ts",
      "src/server/workflows/clamav-document-scanner.integration.test.ts",
      "src/server/db/r4-job-controls.integration.test.ts",
      "src/server/db/r6-demo-round.integration.test.ts",
      "src/server/db/r6-proposal.integration.test.ts",
      "src/server/db/r6-proposal-quotes.integration.test.ts",
      "src/server/db/r6-proposal-quotes-auth.integration.test.ts",
      "src/server/db/r6-contract-handoff.integration.test.ts",
      "src/server/db/r6-contract-portal.integration.test.ts",
      "src/server/db/r6-contract-portal-auth.integration.test.ts",
    "src/server/db/r4-rfp-notifications.integration.test.ts",
    "src/server/db/r8-deal-follow-up-auth.integration.test.ts",
    "src/server/db/r8-task-historical-request.integration.test.ts",
    "src/server/db/r4-rfp-receipt-auth.integration.test.ts",
    "src/server/db/r4-rfp-receipt-history.integration.test.ts",
    "src/server/audit/staff-audit.integration.test.ts",
      "src/server/db/r8-onboarding.integration.test.ts",
      "src/server/db/r8-work-item.integration.test.ts",
      "src/server/db/r8-renewal.integration.test.ts",
      "src/server/db/r8-project-plan.integration.test.ts",
      "src/server/db/r8-administration-configuration.integration.test.ts",
      "src/server/db/r8-approval-queue.integration.test.ts",
      "src/server/db/r8-follow-up-schedule.integration.test.ts",
      "src/server/db/r2b-vendor-fact-override.integration.test.ts",
      "src/server/db/r2b-deal.integration.test.ts",
      "src/server/db/r2b-relationship.integration.test.ts",
      "src/server/db/r2b-vendor-source.integration.test.ts",
      "src/server/db/r4-document-search.integration.test.ts",
      "src/server/db/r4-evaluation-routing.integration.test.ts",
      "src/server/db/r2b-vendor-acquisition.integration.test.ts",
      "src/server/db/r4-rfp-amendment.integration.test.ts",
      "src/server/db/r5-ai-run.integration.test.ts",
      "src/server/db/r5-ai-evaluation.integration.test.ts",
      "src/server/db/r9-operational-evidence.integration.test.ts",
      "src/server/db/r9-deletion-command.integration.test.ts",
      "src/server/db/r3-candidate-transition.integration.test.ts",
      "src/server/db/r3-candidate-add.integration.test.ts",
      "src/server/db/r3-candidate-masking.integration.test.ts",
      "src/server/db/r3-comparison.integration.test.ts",
    "src/server/db/r3-intake-save.integration.test.ts",
    "src/server/db/r3-customer-intake-save.integration.test.ts",
    "src/server/db/r3-customer-requirement-save.integration.test.ts",
    "src/server/db/r3-customer-intake-submit.integration.test.ts",
    "src/server/db/r3-candidate-vendor-scope.integration.test.ts",
    "src/server/db/r3-candidate-vendor-backfill.integration.test.ts",
    "src/server/db/r3-approved-vendor-inputs.integration.test.ts",
    "src/server/db/r3-evaluation-publication.integration.test.ts",
    "src/server/db/r3-initial-selection.integration.test.ts",
    "src/server/db/r3-current-publication.integration.test.ts",
    "src/server/db/r3-coverage-scoring.integration.test.ts",
    "src/server/db/r3-disclosure.integration.test.ts",
      "src/server/db/r3-matching.integration.test.ts",
      "src/server/db/r3-comparison-export.integration.test.ts",
      "src/server/db/r3-duplicate-product.integration.test.ts",
    "src/server/db/r3-intake-matching.integration.test.ts",
    "src/server/auth/security-command-api.integration.test.ts",
    "src/server/db/r1-populated-migration.integration.test.ts",
    "src/server/db/r1-rollback-compatibility.integration.test.ts",
    "src/server/db/r1-restore.integration.test.ts",
  ].map(normalizePath),
);
const integrationFiles = new Set([
  ...rehearsalFiles,
  normalizePath("src/server/auth/auth.integration.test.ts"),
  normalizePath("src/server/auth/rls.integration.test.ts"),
  normalizePath("src/server/auth/permissions.integration.test.ts"),
  normalizePath("src/server/auth/r1-security.integration.test.ts"),
  normalizePath("src/server/db/db.integration.test.ts"),
  normalizePath("src/server/db/r2b-crm-foundation.integration.test.ts"),
  normalizePath("src/server/db/r3-intake-matching.integration.test.ts"),
]);
const samePath = (left, right) => normalizePath(left) === normalizePath(right);
const isVitestCommand =
  command.length >= 5 &&
  command[0] === "node" &&
  samePath(command[1], "node_modules/vitest/vitest.mjs") &&
  command[2] === "run" &&
  command[3] === "--config" &&
  samePath(command[4], "vitest.integration.config.ts");
const vitestArguments = isVitestCommand ? command.slice(5) : [];
const explicitIntegrationTarget =
  vitestArguments.length === 1 ? normalizePath(vitestArguments[0]) : undefined;
const isFullIntegrationSuite = isVitestCommand && vitestArguments.length === 0;
const isRehearsal =
  explicitIntegrationTarget !== undefined &&
  rehearsalFiles.has(explicitIntegrationTarget);
const isNextDevCommand =
  command.length === 3 &&
  command[0] === "node" &&
  samePath(command[1], "node_modules/next/dist/bin/next") &&
  command[2] === "dev";

if (
  !isNextDevCommand &&
  (!isVitestCommand ||
    (!isFullIntegrationSuite &&
      (!explicitIntegrationTarget ||
        !integrationFiles.has(explicitIntegrationTarget))))
) {
  throw new Error("The R1 worker wrapper refused an unexpected child command");
}

if (!isRehearsal && !isFullIntegrationSuite) {
  dotenv.config({ path: path.join(projectRoot, ".env.local") });
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url]")
    .replace(/SCRAM-SHA-256\$[^\s'";]+/gi, "[scram-verifier]");
}

function createScramVerifier(password) {
  const iterations = 4096;
  const salt = randomBytes(16);
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key")
    .digest("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey}:${serverKey}`;
}

function rehearsalEnvironment() {
  const allowedNames = new Set(
    [
      "APPDATA",
      "CI",
      "COMSPEC",
      "DOCKER_CONFIG",
      "DOCKER_CONTEXT",
      "DOCKER_HOST",
      "HOME",
      "LOCALAPPDATA",
      // Non-secret file scope for vitest.integration.config.ts (owner decision D9).
      "MMHR_INTEGRATION_SCOPE",
      "PATH",
      "PATHEXT",
      "PROGRAMDATA",
      "SYSTEMDRIVE",
      "SYSTEMROOT",
      "TEMP",
      "TMP",
      "TMPDIR",
      "USERPROFILE",
      "WINDIR",
    ].map((name) => name.toLowerCase()),
  );
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name, value]) => value !== undefined && allowedNames.has(name.toLowerCase()),
    ),
  );
}

function validateLocalMigrationUrl(value) {
  if (!value) {
    throw new Error("MIGRATION_DATABASE_URL is not set");
  }

  const parsed = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error("MIGRATION_DATABASE_URL must use a loopback host");
  }

  const config = readFileSync(
    path.join(projectRoot, "supabase", "config.toml"),
    "utf8",
  );
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  const databaseSection = config.match(/\[db\]([\s\S]*?)(?:\r?\n\[|$)/);
  const port = databaseSection?.[1]?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1];
  if (projectId !== "mmhr" || !port || parsed.port !== port) {
    throw new Error("MIGRATION_DATABASE_URL does not match the local MMHR stack");
  }

  return parsed;
}

function readLocalApiPort() {
  const config = readFileSync(
    path.join(projectRoot, "supabase", "config.toml"),
    "utf8",
  );
  const apiSection = config.match(/\[api\]([\s\S]*?)(?:\r?\n\[|$)/);
  const port = apiSection?.[1]?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1];
  if (!port) throw new Error("The local MMHR API port is not configured");
  return port;
}

let releaseSignalHandlers = () => undefined;
let stopActiveChild = () => undefined;

function runChild(environment) {
  const [requestedExecutable, ...args] = command;
  // The local worker must not expose the development server to the LAN.
  // Keep the input allowlist exact; callers cannot override this binding.
  if (isNextDevCommand) args.push("--hostname", "127.0.0.1");
  const executable = requestedExecutable === "node" ? process.execPath : requestedExecutable;
  const child = spawn(executable, args, {
    cwd: projectRoot,
    env: environment,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  let childClosed = false;
  let forceTimer;
  let signalForwarded = false;
  const forwardSignal = (signal) => {
    if (signalForwarded || childClosed) return;
    signalForwarded = true;

    if (process.platform === "win32") {
      forceTimer = setTimeout(() => {
        if (childClosed || !child.pid) return;
        const terminator = spawn(
          "taskkill.exe",
          ["/PID", String(child.pid), "/T", "/F"],
          { shell: false, stdio: "ignore", windowsHide: true },
        );
        terminator.unref();
      }, 10_000);
      forceTimer.unref();
      return;
    }

    child.kill(signal);
    forceTimer = setTimeout(() => {
      if (childClosed) return;
      child.kill("SIGKILL");
    }, 10_000);
    forceTimer.unref();
  };
  const forwardInterrupt = () => forwardSignal("SIGINT");
  const forwardTerminate = () => forwardSignal("SIGTERM");
  stopActiveChild = forwardTerminate;
  process.on("SIGINT", forwardInterrupt);
  process.on("SIGTERM", forwardTerminate);
  releaseSignalHandlers = () => {
    process.removeListener("SIGINT", forwardInterrupt);
    process.removeListener("SIGTERM", forwardTerminate);
    if (forceTimer) clearTimeout(forceTimer);
    stopActiveChild = () => undefined;
    releaseSignalHandlers = () => undefined;
  };

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      childClosed = true;
      if (forceTimer) clearTimeout(forceTimer);
      resolve({ code, signal });
    });
  });
}

async function runRehearsal() {
  const blockedUrl = "postgresql://blocked:blocked@127.0.0.1:1/blocked";
  const result = await runChild({
    ...rehearsalEnvironment(),
    DATABASE_URL: blockedUrl,
    MIGRATION_DATABASE_URL: blockedUrl,
    NODE_ENV: "test",
    R1_MIGRATION_REHEARSAL: "1",
    R1_REHEARSAL_ONLY: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
  });
  process.exitCode = result.code ?? (result.signal ? 1 : 0);
}

async function runWithWorker(isIntegrationTest, includeRehearsals) {
  const migrationUrl = validateLocalMigrationUrl(
    process.env.MIGRATION_DATABASE_URL,
  );
  const owner = postgres(migrationUrl.toString(), { max: 1, prepare: true });
  const loginName = `mmhr_worker_${randomBytes(16).toString("hex")}`;
  const credential = randomBytes(32).toString("base64url");
  const passwordVerifier = createScramVerifier(credential);
  const lifetimeMs = 5 * 60 * 1000;
  let renewal;
  let provisioned = false;
  let renewing = false;
  let renewalFailed = false;

  try {
    await owner`
      select mmhr_private.r1_disable_expired_worker_logins()
    `;
    await owner`
      select mmhr_private.r1_remove_expired_worker_logins()
    `;
    await owner`
      select mmhr_private.r1_create_ephemeral_worker_login(
        ${loginName},
        ${passwordVerifier},
        ${new Date(Date.now() + lifetimeMs)}
      )
    `;
    provisioned = true;

    renewal = setInterval(async () => {
      if (renewing) return;
      renewing = true;
      try {
        await owner`
          select mmhr_private.r1_renew_ephemeral_worker_login(
            ${loginName},
            ${new Date(Date.now() + lifetimeMs)}
          )
        `;
      } catch (error) {
        renewalFailed = true;
        process.stderr.write(`Worker renewal failed: ${safeError(error)}\n`);
        if (renewal) clearInterval(renewal);
        renewal = undefined;
        stopActiveChild();
      } finally {
        renewing = false;
      }
    }, 60_000);

    const workerUrl = new URL(migrationUrl);
    workerUrl.username = loginName;
    workerUrl.password = credential;

    const childEnvironment = {
      ...process.env,
      DATABASE_URL: workerUrl.toString(),
      MIGRATION_DATABASE_URL: "blocked",
    };
    if (isIntegrationTest) {
      childEnvironment.TEST_MIGRATION_DATABASE_URL = migrationUrl.toString();
      childEnvironment.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${readLocalApiPort()}`;
    } else {
      delete childEnvironment.TEST_MIGRATION_DATABASE_URL;
    }
    if (includeRehearsals) {
      childEnvironment.R1_MIGRATION_REHEARSAL = "1";
    } else {
      delete childEnvironment.R1_MIGRATION_REHEARSAL;
    }
    delete childEnvironment.R1_REHEARSAL_ONLY;

    const result = await runChild(childEnvironment);
    process.exitCode = renewalFailed
      ? 1
      : (result.code ?? (result.signal ? 1 : 0));
  } finally {
    if (renewal) clearInterval(renewal);
    if (provisioned) {
      try {
        await owner`
          select mmhr_private.r1_disable_ephemeral_worker_login(${loginName})
        `;
        await owner`
          select mmhr_private.r1_remove_ephemeral_worker_login(${loginName})
        `;
      } catch (error) {
        process.stderr.write(`Worker cleanup failed: ${safeError(error)}\n`);
        process.exitCode = 1;
      }
    }
    await owner.end({ timeout: 5 });
  }
}

try {
  if (isRehearsal || isFullIntegrationSuite) {
    await runRehearsal();
  } else {
    await runWithWorker(isVitestCommand, isFullIntegrationSuite);
  }
} catch (error) {
  process.stderr.write(`R1 worker wrapper failed: ${safeError(error)}\n`);
  process.exitCode = 1;
} finally {
  releaseSignalHandlers();
}
