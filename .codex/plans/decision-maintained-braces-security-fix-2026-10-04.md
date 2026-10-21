# Maintained braces package decision

Status: **Approved local installation passed. Further testing remains required.**

The user approved the exact saved manifest, lockfile, archive, and unchanged locked public dependency downloads on October 4.
The baseline package files and their hashes are preserved in the current session scratch directory.
The package files match the approved proposals. `npm ci` passed on October 4 at 20:30 EDT.
Release, production, and parser actions still require separate approval.

## Actual installation

The isolated bundled CLI used Node `24.20.0` and npm `11.19.0`.
The earlier PowerShell shim reported npm `12.0.2`; the shim can select another global-prefix CLI.
The exact bundled CLI ran with empty user/global configuration and a separate cache and home.
It installed 1,073 packages and returned exit `0` after 14 minutes.
Installed `braces` identifies as `@mmhr/braces@3.0.3-mmhr.1`.
The approved manifest and lockfile remained byte-identical.
The default policy withheld eight unapproved lifecycle scripts; no policy was bypassed or changed.
Required binary operation remains subject to the application checks.
Its audit display reported zero vulnerabilities. This display does not clear the retained upstream advisory or reference failures.
Evidence: [installation result](C:/Users/rob/.codex/visualizations/2026/10/04/01a10918-17c6-7272-b7a9-caedeac93d50/braces-approved-install/result.json).
Baseline package files, exact approval hashes, and separate output logs are retained beside that result.

Recommendation: Approve this exact package for local installation and testing.
The earlier two approved package decisions are already installed.
This decision adds a separate production dependency.

## Exact change

Add `braces` as a direct dependency:

```json
"braces": "file:vendor/braces/mmhr-braces-3.0.3-mmhr.1.tgz"
```

Add this override:

```json
"braces@3": "$braces"
```

The archive contains `@mmhr/braces@3.0.3-mmhr.1` under the logical name `braces`.
Its only dependency is the existing `fill-range@7.1.1`.
All unrelated packages, versions, and overrides stay unchanged.

Review the [proposed manifest](braces-security-candidate-2026-10-04/proposed-package.json) and [proposed lockfile](braces-security-candidate-2026-10-04/proposed-package-lock.json).
The exact [archive](braces-security-candidate-2026-10-04/mmhr-braces-3.0.3-mmhr.1.tgz) is retained with these files.

| Input | SHA256 |
| --- | --- |
| Current manifest | `fada8f89c4078012125590394f33dae9df34c75311fc62e1fa1a8f36ce2c06d1` |
| Current lockfile | `3661b32594ac594e13a368d07f2cd96db971ccba6be154ce5fc255d96b839c0e` |
| Proposed manifest | `01bcd359a22f6d8c53e540acf456369313b9026ae56f6519fea3aa95c1da298d` |
| Proposed lockfile | `383083e434f850ff9e0aa30bba042acc3fd9db212163cf2e6624023296c5ac35` |
| Archive | `61b0575b8c023ccdfa901433875966113a8d8fc45932f6cd25bf8898594ac224` |

## Verified preparation

Both offline archive builds produced the same 11,353 bytes.
Independent verification checked all 12 file headers and complete file bodies.
It rejected extra, missing, duplicated, linked, extended, and hidden entries.

The [offline metadata check](braces-security-candidate-2026-10-04/metadata-result.json) passed in 24.813 seconds.
It disabled scripts, audit, and network access.
It used empty configuration files and its own cache.
It installed no dependencies.

The [complete lock and graph review](braces-security-candidate-2026-10-04/complete-lock-and-graph-review.json) checked all 1,328 package records.
Only the root dependency record and `node_modules/braces` changed.
The original ranges from `chokidar`, `micromatch`, and `trigger.dev` stayed unchanged.
All three resolve to the same valid root artifact.
There is no nested braces copy in that graph.

The [second location check](braces-security-candidate-2026-10-04/moved-checkout-result.json) passed in 18.195 seconds.
Its generated lockfile was identical after relocation.
Both checks retained unchanged repository inputs and confirmed their tracked process was absent.
These checks do not prove a clean installation or Linux compatibility.

## Security and compatibility limits

The current audit still reports 11 HIGH entries from [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The advisory lists no patched upstream version.
The local fork adds depth and AST limits plus malformed-object checks.
It needs local maintenance until a suitable upstream correction exists.

The unchanged base and fork each passed 764 upstream checks.
The fork passed 197 security checks and 37 installed-consumer comparisons.
Its broader reference suite passed 859 of 904 checks and retained 45 failures.
Forty-two ordinary differences also failed against the unchanged base.
Two remaining differences concern cycle error classes.
One concerns rejection of fractional `maxDepth` values.

The proposed policy uses an integer depth limit with a maximum of 100.
It limits AST nodes to 20,003 and rejects malformed or cyclic input.
Trusted callbacks are not an operating-system sandbox.
The package does not fully bound every Cartesian expansion.
Approval accepts these documented policies for local testing; it does not approve release with failed checks.

The package name can change the npm audit display.
Keep the upstream advisory linked to this fork regardless of that display.
Do not declare the security issue resolved from a zero audit count alone.
Node 22, Linux, installation, application checks, and browser checks remain required.

## Installation authority and recovery

Approval covers this archive, manifest, lockfile, and local installation only.
Permit downloads of unchanged locked public dependencies from the npm registry during `npm ci`.
Do not send account credentials or private environment values.
No new transitive dependency is proposed.

Before installation, preserve the current manifest and lockfile with their hashes.
Copy the archive to its exact `vendor/braces/` destination.
Apply the two proposed package files after checking every saved hash.
Run `npm ci`, focused compatibility checks, type checking, lint, tests, and build checks.
Check the advisory's source paths separately from the audit display.

If installation or verification fails, restore the preserved manifest and lockfile.
Run the approved baseline `npm ci` recovery.
Preserve the failed run and the unused archive.
Recovery restores the known HIGH advisory; it does not clear the release block.

Approval does not authorize Git actions, publication, deployment, cloud migrations, providers, or access changes.
No collection or parser permission becomes active from this package change.
