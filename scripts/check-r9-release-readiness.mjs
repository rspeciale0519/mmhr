import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(projectRoot, "scripts", "r9-release-evidence.json");
const readinessModule = await import(
  pathToFileURL(path.join(projectRoot, "src", "lib", "r9-release-readiness.ts")),
);

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const checks = readinessModule.R9_RELEASE_CHECKS;
const expectedKeys = [...checks].sort();
const actualKeys = Object.keys(evidence).sort();

if (expectedKeys.length !== actualKeys.length || expectedKeys.some((check, index) => check !== actualKeys[index])) {
  throw new Error("R9 evidence manifest does not match the required release checks");
}

for (const check of checks) {
  const record = evidence[check];
  if (
    typeof record !== "object" ||
    record === null ||
    typeof record.passed !== "boolean" ||
    typeof record.reference !== "string" ||
    record.reference.trim().length === 0
  ) {
    throw new Error(`R9 evidence record is invalid: ${check}`);
  }
}

const readiness = readinessModule.evaluateR9ReleaseReadiness(evidence);
if (readiness.ready) {
  console.log("R9 release readiness is ready.");
} else {
  console.log(`R9 release readiness is blocked: ${readiness.failedChecks.join(", ")}`);
  if (process.argv.includes("--require-ready")) process.exitCode = 1;
}
