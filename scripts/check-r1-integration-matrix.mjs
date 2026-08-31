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

if (missing.length > 0 || stale.length > 0) {
  if (missing.length > 0) {
    console.error(`Integration tests missing from the worker wrapper: ${missing.join(", ")}`);
  }
  if (stale.length > 0) {
    console.error(`Worker wrapper entries without integration tests: ${stale.join(", ")}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Integration matrix is complete: ${discovered.size} test files.`);
}
