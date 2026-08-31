import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanModule = await import(pathToFileURL(path.join(projectRoot, "src", "lib", "secret-scan.ts")));
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: projectRoot })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
// These files contain documented local placeholders or scanner patterns, not
// deployable credentials. Secret-bearing runtime files remain in the scan.
const ignoredFiles = new Set([
  ".env.example",
  "src/lib/secret-scan.ts",
  "src/lib/secret-scan.test.ts",
  "src/server/audit/security-values.test.ts",
  "src/server/auth/r1-bootstrap-super-admin.test.ts",
  "src/server/db/r1-migration-rehearsal.ts",
  "scripts/r1-with-local-worker.mjs",
]);
const binaryExtensions = /\.(?:png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip)$/i;
const findings = [];

for (const relativePath of trackedFiles) {
  if (ignoredFiles.has(relativePath) || binaryExtensions.test(relativePath)) continue;
  const text = readFileSync(path.join(projectRoot, relativePath), "utf8");
  for (const match of scanModule.findSecretMatches(text)) {
    findings.push(`${relativePath}:${match.line} ${match.kind}`);
  }
}

if (findings.length > 0) {
  console.error(`Secret scan found ${findings.length} high-confidence match(es):`);
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${trackedFiles.length} tracked files.`);
}
