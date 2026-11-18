#!/usr/bin/env node
// Dependency audit gate used by CI and the release gate.
// It runs `npm audit` and fails when any high or critical advisory is found,
// except for advisories listed in ALLOWED below until their expiry date.
//
// Why this exists: on 2026-11-17 a high ReDoS advisory was published for
// picomatch (GHSA-fc5q-39xc-vjpf) covering every released version, so no
// update could fix it. The owner approved a 30-day exception on 2026-11-18.
import { execFileSync } from "node:child_process";

// Each entry: the advisory URL, the last day it is allowed (inclusive, UTC),
// and why. After `until`, the check fails again, so the exception cannot
// silently become permanent.
const ALLOWED = [
  {
    url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
    until: "2026-12-18",
    reason: "picomatch ReDoS; no patched release yet; used only by build and setup tools on our own patterns",
  },
];

// Severities that fail the check (same as `npm audit --audit-level=high`).
const FAILING = new Set(["high", "critical"]);

// Read the audit report as JSON. `npm audit` exits non-zero when it finds
// anything, so we read its output from the error object in that case.
function readAuditReport() {
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.trim().startsWith("{")) return JSON.parse(error.stdout);
    throw error;
  }
}

const report = readAuditReport();
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC
const failures = [];
const allowedHits = [];

// npm lists each vulnerable package. Its `via` array holds either the
// advisory objects themselves or names of other vulnerable packages that it
// depends on. Only the advisory objects are real findings; a package that
// is listed only because of a dependency is covered by that dependency's advisory.
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  for (const source of vulnerability.via) {
    if (typeof source !== "object" || !FAILING.has(source.severity)) continue;
    const allowed = ALLOWED.find((entry) => entry.url === source.url);
    if (allowed && today <= allowed.until) allowedHits.push(`${name}: ${source.url} (allowed until ${allowed.until})`);
    else failures.push(`${name}: ${source.severity} ${source.title} ${source.url}${allowed ? ` (exception expired ${allowed.until})` : ""}`);
  }
}

for (const line of allowedHits) console.log(`allowed  ${line}`);
if (failures.length > 0) {
  for (const line of failures) console.error(`FAIL     ${line}`);
  console.error(`Dependency audit failed: ${failures.length} high or critical advisory finding(s).`);
  process.exit(1);
}
console.log("Dependency audit passed: no high or critical advisories outside the allowed list.");
