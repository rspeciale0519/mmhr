# R3 reviewed masked option publication

Status: implementation and verification in progress. This record does not close R3 or approve a release.

## Requirement coverage

This package supplies the publication data path for FR-INT-03 and FR-MAT-01, 02, 03, 04, and 06.
It stores all approved product options. The initial five-contender limit belongs to selection, not publication or pagination.

Three private tables retain the reviewed configuration, captured inputs, masked options, and publication decisions.
The publication sequence versions the complete saved configuration. Configuration `version: 1` identifies the calculation format.
Published records never change. Replacement and withdrawal add decisions and retain earlier evidence.

Staff must hold organization `evaluation.publish` and platform `admin.access` authority with AAL2.
Only Super Admin receives the new permission by default. Customer reads require `portal.customer.access` for the exact organization.
Neither client input nor a provider identifier can choose the acting identity.

## Calculation and privacy

Each applicable answered requirement must have an explicit fact mapping and scalar response path.
Invalid mappings stop preparation. Approved source evidence or a valid approved override supplies each provider fact.
The saved inputs retain the evidence version and approval references. Matching never uses commission, referral, payout, or payment-status criteria.

The score measures satisfied requirement weights. Evidence coverage measures weights with relevant approved facts.
Coverage is not a statistical probability. Missing required capabilities make an option ineligible.
No relevant approved facts produce an unknown result. Freshness uses relevant evidence only.
Calculation format 1 folds ASCII letters and trims ASCII spaces. Other characters retain their exact meaning.
Numeric answers use plain decimal text. Provider text is not converted into a number.
These rules prevent locale and number-format differences from changing scores.
The database rejects numeric answers that change through a JavaScript-compatible number conversion.
The check uses PostgreSQL's [shortest precise floating-point text](https://www.postgresql.org/docs/16/datatype-numeric.html), with `extra_float_digits = 3`.
This preserves valid long decimal answers without silently rounding older stored answers.

Customer reads return opaque option IDs, labels, scores, reasons, limitations, coverage, and freshness.
They omit provider names, product IDs, source IDs, citations, and private input snapshots.
Pages use consecutive saved ordinals. The server rejects incomplete or displaced response pages.

## Change and recovery risks

Main risks are identity disclosure, incorrect scoring, stale evidence, cross-organization access, and loss of review history.
Publication checks must compare current inputs with the exact reviewed digest. Customer reads must reject stale or withdrawn versions.
Database changes and their audit events must succeed together. Exact retries must not create duplicate decisions.

Apply additive migrations 0114 through 0117 in order after rehearsal.
Migration 0114 adds authority. Migration 0115 adds private immutable records.
Migration 0116 captures and evaluates inputs. Migration 0117 supplies fixed authorized operations.

Contain a defect by revoking the affected operation or publication. Apply a reviewed forward correction.
Keep snapshots, role history, decisions, receipts, and audit records. Do not remove those records during recovery.
Existing candidate and matching interfaces remain unchanged.

## Evidence and open work

Focused contract, adapter, router, migration, and permission checks pass.
Type checking and full lint pass. Build10641 passes all67 routes.
Full unit11959 passed3,766 tests but found an unregistered test-only parity helper.
The helper is now registered, and a regression case blocks application imports. All52 boundary checks pass.
Fresh full unit10092 passes334 files and3,768 tests in529.56 seconds.
Final fixture lint, type checking and five-case collection43397 pass. The1,128-file secret scan passes.
Database fixtures do not prove a real authenticated workflow until they execute successfully.
An ordinary local attempt failed Docker access. An elevated guarded attempt34292 timed out during setup after240 seconds.
That attempt skipped all four then-current cases. The expanded five-case fixture includes a two-transaction publication race.
The race uses both available pool connections. Baseline assertions run before either transaction starts.
No publication database or concurrency execution is claimed.

CI34327707906 at49add22 passed standard checks and applied migrations through0113.
Its database suite passed900 tests and failed one later matching case due to a missing fixture organization administrator.
The fixture correction is committed as `ab0f726`; runtime authority remains unchanged.
Publication commit7b5ae49 and dependency commit5d428ea are pushed.
CI34330596999 at5d428ea passed standard checks and applied migrations through0117.
It passed903 of906 integration tests across97 files. All five publication cases passed, including concurrency and SQL/TypeScript parity.
Three failures came from old empty-migration role/audit expectations and the missing fixture administrator.
The selection package updates the cumulative migration expectations. The administrator fix is inab0f726.
This run supplies publication database evidence. It does not verify the later selection migrations0118-0121.
No staging migration, production migration, or release is claimed here.

The initial dependency audit passed its high-severity gate but reported two moderate Vitest findings.
The [Vitest advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) concerns development-server mock file access.
This repository does not configure the public mocker plugins or Vitest browser servers.
Published patch4.1.11 is verified through npm metadata and is now installed in a separate dependency change.
The current audit reports zero vulnerabilities. Patch type, lint, build, inventory and84 focused checks pass.
Full patch run56923 passes334 files and3,768 tests in501.45 seconds. Independent dependency review found no issue.

Customer comparison and initial selection now have a separate implementation and evidence record in [r3-customer-selection.md](r3-customer-selection.md).
Still required: executed database and concurrency checks; staff review screens; duplicate-product handling;
commercial conflict disclosure; approved name disclosure; and the connected RFP workflow.
These items remain part of the full goal. This package does not replace them with legacy five-row assessments.
