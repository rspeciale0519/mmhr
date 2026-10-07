# MVP local operation

The first MVP supports the customer journey through approved RFP delivery.
MMHR staff manage the remaining work directly during the pilot.
The complete product remains the longer-term scope in `PRD.md`.

Use the [MVP launch checklist](../.codex/plans/release-mvp-launch-checklist.md) for the authoritative launch tasks and requirement mappings.
This operation guide records startup and local evidence. It does not replace the checklist or approve production release.

## Included path

1. Create a customer account and workspace.
2. Save software needs and requirements.
3. Submit the intake for staff review.
4. Review and publish the masked comparison from approved vendor data.
5. Select up to five initial options.
6. Discuss the requirements with MMHR.
7. Record provider disclosure and prepare the RFP.
8. Approve and deliver the RFP to the selected vendor portals.

A staff member can approve their own draft when separate approval is off.
See [the approval setting](security/r4-approval-policy.md) to restore that requirement later.

Responses, demos, proposals, contracts, commissions, and onboarding remain manual pilot work.
Automated email delivery and customer RFP editing are not part of this first verified path.
Vendor evidence still requires data preparation before staff can publish meaningful comparisons.

## Start the application

1. Start Docker Desktop.
2. Run `supabase start` from the MMHR project.
3. Run `npm run dev:local`.
4. Open `http://127.0.0.1:3000/sign-in`.

Use `npm run dev:local -- --port 3006` when you need the existing browser test port.
The command reads local connection values from Supabase and uses the existing worker wrapper.
It leaves an occupied port unchanged.
It does not create accounts, replace authentication factors, seed vendor data, or apply migrations.
Existing approved local migrations must already be applied.
Closing the development terminal stops the application. Restart it with the same command.

## Local browser evidence

On September 13, the native browser verified the saved intake through vendor delivery with real local Supabase sessions.
The test covered staff publication, customer selection, the five-choice limit, provider disclosure, staff self-approval, and vendor receipt.
The customer also saw the disclosed provider and delivered questionnaire.
All business records in this run were synthetic.
Signup and email verification were not exercised in this browser run.
The registration and account setup database suites passed 49 tests.
The full unit suite passed 3,968 tests, and the production build passed.

The separate fixture launcher supports test account switching while its process runs.
Its access link is temporary and is not a production sign-in method.
See [workflow verification](security/r3-live-workflow-verification.md) for test evidence and limits.

## Pilot release

This record describes local operation. A public release has not occurred.
A hosted pilot needs a chosen environment, real staff accounts, approved vendor data, and verified customer registration.
It must also satisfy the checklist's acceptance evidence and the existing R0 release rules.
Production changes require a separate approval after the deployment package is ready.
