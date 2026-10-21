# Security dependency remediation decision

Date: October 3, 2026. Status: approved by the user; exact local installation completed. Candidate acceptance remains open.

Approve the exact compatible updates below, then verify the changed dependency graph.
These updates address available fixes. They cannot close the security gate while the unpatched `braces` finding remains.

## Approved installation result

The user approved this packet and the separate parser packet on October 3.
The exact versions and scoped overrides below are installed with Node24.20.0 and npm12.0.2.
The first installation failed because two owned Next.js workers held a native CSS file open.
Creation-bound process checks identified the project server on127.0.0.1:3100.
Only its verified process tree stopped. A guarded `npm ci` retry exited zero.
Original failure logs and both pre-change package files remain in session scratch.

All13 approved direct and scoped installed copies matched. Existing unrelated overrides remained unchanged.
Seven Windows native runtime checks passed for sharp, canvas, Next.js SWC, and four esbuild copies.
The explicit full audit failed with11high affected entries and no critical, moderate, or low entries.
All11 entries derive from the unpatched `braces` advisory below.
These are affected package entries, not11independent defects.
Fresh type checking passed. Remaining application gates and browser checks remain open.

The approved package hash is `fada8f89c4078012125590394f33dae9df34c75311fc62e1fa1a8f36ce2c06d1`.
The lockfile hash is `3661b32594ac594e13a368d07f2cd96db971ccba6be154ce5fc255d96b839c0e`.
See [current state](../../mmhrbrain/STATE.md) for the active verification work.

## Current evidence

The repeated current npm audit reports 16 affected package entries: 1 critical, 12 high, 2 moderate, and 1 low.
These entries include inherited findings in parent packages. They do not represent 16 independent defects.
The October 2 count of five affected packages is no longer current.

Read-only commands checked `package.json`, `package-lock.json`, npm audit results, and public npm version metadata.
The first audit produced 39 package entries with incomplete parent ranges and fix metadata.
Two subsequent audits agreed on 16 entries, including the repeated `--prefer-online` result.
No version changed between these checks.

The current audit gate fails. New high findings affect both production dependencies and development tools.
The exact Node and npm versions should be recorded during the approved remediation run.

## Exact update request

| Package | Current installed version | Requested version | Reason |
|---|---|---|---|
| `next` | 16.3.4 | 16.3.6 | Minimum fixed version for the critical `next/og` advisory |
| `eslint-config-next` | 16.3.4 | 16.3.6 | Keep the Next.js lint configuration at the framework version |
| `brace-expansion` major 1 | 1.1.18 | 1.1.21 | Fix CPU exhaustion and recursive stack exhaustion |
| `brace-expansion` major 5 | 5.0.9 | 5.0.12 | Fix the same findings without changing the major version |
| `fast-uri` | 3.1.7 | 3.1.8 | Fix inconsistent host normalization |
| `ip-address` | 10.7.0 | 10.7.3 | Use the verified current patch within major 10 |
| `dompurify` | 3.4.14 | 3.4.16 | Fix retained event handlers in affected sanitization hooks |

Public npm metadata confirms every requested version exists.
Next.js 16.3.6 requires Node 20.9.0 or later and supports the installed React 19.2.4 version.
The current advisory lists 16.3.6 as fixed. npm audit suggests 16.3.8, but this packet proposes the minimum patch.
The `ip-address` advisories identify 10.7.1 as the first fixed version. Version 10.7.3 is the verified current compatible patch.

### Findings and official sources

The critical Next.js issue affects Node.js `ImageResponse` with attacker-controlled SVG values.
The source search found no direct `next/og` or `ImageResponse` references under `src/`.
This result limits observed direct exposure. It does not remove the installed vulnerability or establish complete runtime safety.
See the [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).

The `brace-expansion` fixes cover the installed major 1 and major 5 copies.
See the [CPU exhaustion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [nested recursion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7), and [comma parsing advisory](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).

`fast-uri` requires 3.1.8 within the installed major version.
See the [host normalization advisory](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj).

The `ip-address` defects affect address family comparisons and excessive diagnostic allocation.
See the [address family advisory](https://github.com/advisories/GHSA-j6r3-76f7-8jcv) and [resource exhaustion advisory](https://github.com/advisories/GHSA-h3mg-xc3c-68pw).

DOMPurify 3.4.16 fixes the reported unsafe detached subtree behavior.
See the [DOMPurify advisory](https://github.com/advisories/GHSA-p98j-92pf-mc4p).

## Transitive version controls

Every requested transitive version fits its current parent's declared dependency range.
A targeted lockfile refresh can therefore obtain the fixes without a major parent upgrade.
Overrides are not required to make these versions compatible.
Use version-scoped overrides if an exact reproducible constraint is needed or the refresh retains vulnerable copies.
Preserve all existing unrelated overrides.

The proposed additional constraints are:

```json
{
  "brace-expansion@1": "1.1.21",
  "brace-expansion@5": "5.0.12",
  "fast-uri@3": "3.1.8",
  "ip-address@10": "10.7.3",
  "dompurify@3": "3.4.16"
}
```

Do not replace both `brace-expansion` major versions with one global version.
Major 1 is required by minimatch 3.1.5. Major 5 is required by minimatch 10.2.5.
The `fast-uri` consumers use `^3.0.1`. The `ip-address` consumer uses `^10.2.0`.
PostHog uses DOMPurify `^3.3.2`.

## Unpatched high finding

The installed `braces` 3.0.3 package has a high stack exhaustion advisory.
The official advisory lists no patched version. npm metadata lists no release above 3.0.3.
See the [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Current consumers include micromatch 4.0.8, chokidar 3.6.0, and Trigger.dev CLI 4.5.16.
Inherited audit entries also affect fast-glob, the Next.js lint plugin, shadcn, and ts-morph.
The CLI is a development dependency. Some other consumers enter the production dependency graph.

Do not apply `npm audit fix --force`.
The audit suggests major downgrades to `eslint-config-next` 14.2.35, `shadcn` 1.0.0, and `trigger.dev` 3.3.17.
These suggestions are not verified compatible with this application.
They do not establish a safe replacement for every `braces` consumer.

After the approved patch run, review updated parent releases for removal of this dependency.
If no safe parent release exists, prepare a separate bounded replacement or maintained patch decision.
Do not change dependency scope, omit development auditing, or suppress findings to make the gate pass.
Trusted tool input and process limits can reduce exposure, but they do not make the package audit pass.

### Consumer checks and parent releases

The source and configuration search found no direct application imports of `braces`, micromatch, fast-glob, chokidar, or ts-morph.
This result does not prove those packages are absent from bundled code or tools.

`src/app/globals.css` imports `shadcn/tailwind.css`.
Removing shadcn requires a reviewed replacement for that stylesheet and rendered checks for its consumers.
It is not an unused CLI package in this repository.

`src/trigger/health.ts`, `src/trigger/identity-admin-intents.ts`, and `trigger.config.ts` use the Trigger.dev SDK.
`src/server/operations/dependency-compatibility.test.ts` verifies the Trigger.dev CLI esbuild override.
Removing the CLI requires a separate tooling decision. Removing the SDK would affect required application tasks.

The current Next.js lint plugin also depends on fast-glob, which uses micromatch and `braces`.
Removing only CLI roots cannot clear every path in the full dependency audit.

Current npm metadata reports shadcn 4.21.1 still uses fast-glob 3.3.3 and ts-morph 26.
Trigger.dev CLI 4.7.2 still uses `braces` 3.0.3 and chokidar 3.6.0.
Current micromatch 4.0.8 and fast-glob 3.3.3 retain the same vulnerable path.
No checked compatible parent update removes every path.
Do not request those parent upgrades as a verified fix for this finding.

A separately reviewed maintained patch or replacement may be necessary if upstream releases remain unavailable.
That decision requires exact source changes, compatibility tests, distribution integrity, and explicit dependency approval.
No such patch or replacement is approved or implemented by this packet.

## Validation after approval

1. Record the current manifest and lockfile hashes before changing them.
   Wait until any integration run that shares installed dependencies finishes.
2. Change only the approved versions and necessary version constraints.
3. Review the resulting lockfile for unrelated upgrades and new native components.
4. Confirm every affected package copy uses an approved fixed version.
5. Run `npm run check:dependency-audit`.
6. Run `npm run type-check`, `npm run lint`, and `npm test`.
7. Run `npm run build`.
8. Verify customer, staff, vendor, authentication, private upload, and download screens in the browser.
9. Run relevant integration checks if framework behavior or server authorization changes.
10. Record unresolved findings and exact check results.

The audit must stay failed while any required high or critical finding remains.
Do not claim remediation is complete from installation success alone.

## Risks and recovery

Framework patches can change server rendering, request behavior, build output, and lint rules.
Transitive changes can affect pattern handling, validation, analytics sanitization, and development tools.
Keep the update focused and retain the full pre-change package records.

If a regression occurs, disable the affected local test path and preserve its evidence.
Restore only this task's manifest and lockfile changes from the recorded pre-change content.
Preserve unrelated user edits. Do not use destructive Git commands.
Do not deploy a reverted vulnerable candidate.
No database migration is required for the proposed package changes.

## Approval boundary

This packet requests local installation of the exact security updates and the listed optional scoped constraints.
Repository instructions require approval before adding production dependencies.
The user approved the exact Next.js update in this packet.
No cloud write, provider activation, deployment, Git write, or major package downgrade is included.

Document parser dependencies remain a separate decision.
See [the document processing packet](decision-document-processing-dependencies.md).
Approval of these security patches does not approve parser installation.
