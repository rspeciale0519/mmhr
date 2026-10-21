# Catalog controls and saved payroll scope

Status: Local application checks passed. Catalog review and customer publication remain incomplete.

## Gaps and changes

New custom requirements use generated keys. Reusable catalog conditions need a stable question and typed fields.
The customer form now offers a standard Payroll processing question with key `input_payroll`.
Its versioned answer stores requested payroll, country, worker type, US state scope, and willingness to consider a paid payroll addition.
Blank answers remain null. A stated no remains false. These answers do not confirm a purchase or a vendor contract.
Existing custom answers retain their keys and values. Unknown future payroll formats use the existing preservation flow.
Saved payroll answers use readable labels instead of internal field names.

The staff evidence page also needs a normal way to activate a reviewed draft product.
The new control uses the existing audited product-update command, with the displayed revision and a stable retry key.
Activation permits product consideration. It does not approve facts or publish a comparison.
The mutation requires existing workspace and staff authority, uses a request-scoped client, and fixes the target status to active.

## Migration 0140

The migration adds the product revision to the existing scoped CRM search projection.
No table, RLS policy, role, grant, record, or write command changes.
Existing clients discard unknown search fields. Updated clients retain a valid product revision only.
If the revision is absent, the page does not offer activation.

Risk: a stale page can submit an old product revision. The existing command rejects it.
Recovery: reload to obtain current state. Retain the additive migration if application code reverts.
Use a reviewed forward correction for SQL changes. Do not reverse data history.
Apply locally only after disposable database checks pass. No cloud migration is authorized.

## Evidence

- Focused initial checks: six files, 53 tests passed. Later payroll edge checks: two files, 33 tests passed.
- Type check passed after correcting the new response union annotation.
- Disposable CRM command tests passed two tests, including revision reads, activation, duplicate retry and stale rejection.
- Disposable CRM search tests passed two tests, including organization boundaries and unchanged contact results.
- The wrapper rejected a two-file integration command before execution. Separate supported commands passed.
- Native customer workflow created a separate fictional intake: `da7b8b35-1fb7-4f41-bab8-c8b80cc419ac`.
- The prior submitted intake and its selections remain unchanged.

## Verified checkpoint

Migration 0140 was applied locally after both disposable integration files passed.
The migration inventory is 141. No cloud migration occurred.

- `npm run type-check` passed.
- `npm run lint` passed.
- `npm test` passed: 362 files, 4,082 tests, 702.79 seconds (session 69291).
- `npm run build` passed: 71 routes.
- Integration inventory passed: 100 files. Tracked secret scan passed: 1,156 files.
- Authorization inventory tests passed: four tests after adding the new activation entry to the documentation matrix.
- `git diff --check` passed. Existing line-ending warnings remain.

The native customer form saved and reloaded explicit fictional payroll answers.
The new intake was submitted at revision 2 with US employees, multiple states, and willingness to consider a payroll addition.
That willingness does not establish purchased modules or contract entitlement.
The prior intake and its choices remain unchanged.

Native staff controls activated ADP Workforce Now, UKG Ready, and Paylocity HR and Payroll.
Individual reviews approved their sourced payroll-availability facts.
The review reasons exclude unconfirmed packages, regional scope, prices, and setup estimates.
Read-only database verification confirms three active products with one review each and five remaining draft products with no reviews.
Each of the eight records has one fact, one evidence version, a source owner, and a 90-day cadence.
No comparison using these real products has been published.
Staff browser warning and error logs were empty at this checkpoint.

The Paylocity activation wait timed out, but the next page snapshot confirmed success.
No duplicate activation was sent. The later review also visibly saved.
The attempted 320-pixel customer viewport did not change the measured page width.
This attempt does not establish narrow-screen or keyboard verification for the new payroll form.

Next: complete the remaining individual reviews, structured scope and coverage records, real catalog publication, and customer selection checks.
Keep Phase 1 active. Do not start Phase 2.

## Follow-up at 01:29 local time

The native staff browser activated and reviewed Paycom, isolved, Rippling, Gusto, and BambooHR.
All eight products are now active with individually approved payroll-availability facts.
BambooHR also has approved `comparison_feature_coverage` evidence with `input_payroll: add_on`.
The source supports a separately purchased US Payroll addition. This does not prove customer purchase or eligibility.
All records retain their original source dates and 90-day review intervals.

Read-only database verification confirms eight active products and nine fact/evidence/review records.
Every record has a source owner. All eight vendor profiles still lack approval identities and dates.

The actual staff page prepared a comparison for the new submitted fictional intake.
It used `input_payroll` and response path `requested` under rules version 2.
The preview contained only one existing option; none of the eight real products entered it.
No publication action was taken.

The cause is the existing catalog gate in `r3_collect_publication_inputs` from migration 0116.
It requires active profiles with both `approved_at` and `approved_by_identity_id`.
Product activation and fact approval do not satisfy that separate gate.
Current command searches found no vendor-profile approval write path.
Add a normal audited staff profile-review flow before attempting another real catalog preview.
Do not bypass the gate with direct fixture writes or claim a commercial relationship.
Keep commercial metadata outside comparison scoring and ordering.

No application source changed during this follow-up. The preceding 4,082-test result remains the latest full run.
Package scope, remaining delivery classifications, publication, and customer selection verification remain open.

## September 16 follow-up

See [payroll form and scope evidence](phase1-payroll-browser-scope-2026-09-16.md).
The customer payroll keyboard and narrow-screen checks now pass.
The later preview confirms BambooHR scope and Add-on classification.
Earlier preview results above remain historical evidence.
