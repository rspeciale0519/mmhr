import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const wrapperPath = path.join(projectRoot, "scripts", "r1-with-local-worker.mjs");

function collectIntegrationFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectIntegrationFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".integration.test.ts")) {
      files.push(path.relative(projectRoot, entryPath).split(path.sep).join("/"));
    }
  }

  return files;
}

const discovered = new Set(collectIntegrationFiles(sourceRoot));
const wrapper = readFileSync(wrapperPath, "utf8");
const listed = new Set(
  [...wrapper.matchAll(/["'](src\/[^"']+\.integration\.test\.ts)["']/g)].map(
    ([, file]) => file,
  ),
);

const missing = [...discovered].filter((file) => !listed.has(file)).sort();
const stale = [...listed].filter((file) => !discovered.has(file)).sort();
// Owner decision D9: these files run in the non-blocking CI job.
const excludedFeatures = JSON.parse(
  readFileSync(path.join(projectRoot, "scripts", "integration-excluded-features.json"), "utf8"),
).files;
const staleExcluded = excludedFeatures.filter((file) => !discovered.has(file)).sort();
const duplicateExcluded = excludedFeatures.filter((file, index) => excludedFeatures.indexOf(file) !== index);

if (missing.length > 0 || stale.length > 0 || staleExcluded.length > 0 || duplicateExcluded.length > 0) {
  if (missing.length > 0) {
    console.error(`Integration tests missing from the worker wrapper: ${missing.join(", ")}`);
  }
  if (stale.length > 0) {
    console.error(`Worker wrapper entries without integration tests: ${stale.join(", ")}`);
  }
  if (staleExcluded.length > 0) {
    console.error(`Excluded-feature entries without integration tests: ${staleExcluded.join(", ")}`);
  }
  if (duplicateExcluded.length > 0) {
    console.error(`Duplicate excluded-feature entries: ${duplicateExcluded.join(", ")}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Integration matrix is complete: ${discovered.size} test files.`);
  console.log(`Excluded-feature job files: ${excludedFeatures.length}.`);
}
