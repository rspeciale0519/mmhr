# Approved vendor inputs for matching and option publication

Status: implemented and independently reviewed. Local standard checks pass. Database execution remains unverified.
This is the shared input boundary for the forthcoming all-options list, not that list or its customer selection screen.

## Requirements and defect

[PRD](../PRD.md) requirements FR-INT-03, FR-MAT-01, FR-MAT-03 and FR-VND-05 through FR-VND-08 require approved, traceable vendor data.
The existing matching function used a fact's `published` status without checking its evidence, review, source or expiry.
It also omitted manual overrides and retained no exact vendor input record.
That behavior cannot provide the approved inputs required by the customer journey.

## Implemented boundary

Migration `0112_r3_approved_vendor_inputs.sql` adds one private stable SQL resolver.
It has no caller grants and is not a security-definer function.
The existing protected matching command invokes it with the stored provider organization and product IDs.

The resolver requires an active organization, an active approved vendor profile, and an active product.
It accepts only non-archived facts for that exact product and provider.
Normal facts require published status, the highest evidence version, an approved review and an active source from the same provider.
The highest version is selected before approval and freshness checks.
An invalid latest version cannot restore an older approved version.
Observation, capture and approval times cannot be in the future.
Expiry must be strictly after the run's recorded time.

A valid source-backed manual override takes priority over normal evidence.
The newest override is selected before source, time and expiry checks.
An expired or invalid newest override cannot restore an earlier override.
Normal approved evidence can still apply when no current valid override exists.
Draft facts can use a valid manual override; archived facts cannot.
Source-less legacy overrides remain stored but cannot affect matching.

Migration `0113_r3_matching_approved_inputs.sql` connects that resolver to the existing matching RPC.
Each candidate's exact input array supplies its score, reasons, limitations and freshness.
The private `matching_runs.vendor_input_snapshot` stores values and versioned provenance for the run.
It includes evidence, source, review and override IDs as applicable.
It does not store source URLs or source citation text.
The oldest retained capture time supplies the conservative public freshness field.
The command rejects evidence larger than four million serialized bytes instead of truncating it.

The command retains the existing payload, receipt namespace, caller authority, parent locks, formula and masked response keys.
The public candidate snapshot and RPC result do not include private provenance.
Matching runs now reject updates, deletes and truncation.
Retries return the original run without changing its evidence.
Existing runs retain empty vendor input arrays; no historical approval evidence is invented.

## Verification

- Existing matching and new consumer migration checks: four files and 16 tests pass.
- Resolver migration checks: seven tests pass.
- Type checking and full lint 5799 pass.
- Production build 34010 passes with 67 routes.
- Integration inventory passes with 96 files, 114 migrations and 111 public application tables.
- Full unit run 12713 passes 327 files and 3,663 tests in 522.84 seconds.
- Final expanded fixture lint and type check 10553 pass. All four new integration cases collect.
- Independent SQL and fixture reviews found no blocking defect. Review corrections retain the intended failure conditions.
- New runtime tests cover approval, freshness, latest-version behavior, overrides, scope, private snapshots and replay.
- Existing matching fixtures now include real source, evidence and review records for positively scoring facts.
- Focused local integration failed during setup because the sandbox denied the Docker pipe and configuration access.
- All four new cases were skipped in that attempt. No new SQL execution is claimed.

The local setup failure does not prove that the Docker engine stopped.
Earlier outside-sandbox version probes returned no usable engine response; no engine reset or data deletion occurred.
Remote CI34318285955 at `4abfe42` failed four fixture cases after passing 889 tests.
Those fixture corrections and commit `95a176b` were pushed as reviewed head `663b4e6`.
New CI34322766689 runs at that head and includes migration0111, not this package's0112 and0113.
No rendered surface changed, so no new browser check is required for this package.

## Deployment and recovery

The main risks are stale evidence, restoring invalid older values, scope errors, and leaking provider evidence.
Rehearse both migrations and populated compatibility in an isolated database before deployment.
Keep the existing command and audit contracts backward compatible.
Do not rewrite old matching runs to make them appear approved under the new rules.
If containment is needed, revoke matching execution and disable its entry points while retaining all records.
Use a reviewed forward correction to recover.
Do not remove the immutable history or restore acceptance of unreviewed published flags.
No cloud migration, merge or production release has occurred.

## Remaining customer workflow

The immutable all-options publication, protected paginated reads, customer screen and up-to-five selection command remain open.
The publication must bind the submitted requirements and actual rule content, not only a rule version label.
It must have explicit internal approval authority and a reviewed withdrawal policy.
Legacy matching still uses its existing formula and workspace permission; this package does not make that command a customer publication API.
Legacy five-row assessments and retained scores cannot prove that all approved options are available.
The new customer list must use the approved input boundary directly and must not expose legacy raw product-ID contracts.
These open requirements prevent R3 or release completion claims.
