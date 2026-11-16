# Customer intake

A signed-in customer records software needs in their organization workspace. They start an intake, answer guided sections, save a draft, add at least one must-have or nice-to-have requirement, and submit for MMHR review. Submit does not send an RFP or name vendors.

## Sub-features

- `intake-list` shows `/customer` heading `Your software needs` and `Saved intakes`, or status `There are no saved intakes in this workspace.`
- `intake-new` opens `/customer?new=1` with form `Customer software needs intake` and heading `Describe what your team needs`.
- `intake-save` uses `Save draft` or `Save and continue` and then heading `Save confirmed`.
- `intake-requirement` adds a requirement from `Add a requirement` before submit is allowed.
- `intake-submit` uses `Review submission`, checkbox `Submit all current saved answers and requirements`, and `Submit saved intake`, then heading `Your submission is confirmed`.

## How to get to it (user POV)

- Sign in as a customer, land on `/customer` or choose `Customer portal` from `/home`.
- Choose `Start an intake` on the list (`/customer?new=1`).
- Choose `View intake` on a saved row, then `Edit intake answers` (`/customer?intake=<uuid>&edit=1`).
- From a saved intake choose `View software comparison` only after submit and staff publication (that is the evaluation feature).

## Driving it with Playwright

Preconditions:

- Full launch. Doctor `ready: yes`.
- A confirmed customer session in a customer organization. Seed data does not provide this.
- If that session does not exist, stop. Report failure. Do not create a fake comparison by calling tRPC.

- **Open the list.** Go to `/customer`. Heading `Your software needs` and nav `Customer workspace` with `Your intakes` are visible. Capture the empty or populated list.
- **Start intake.** Choose `Start an intake`. Form `Customer software needs intake` is visible. Fill `Industry` (`intake-companyContext-industryV1`) with `Restaurants`. Fill `Estimated employee count` with `25`. Choose `Save draft`. Heading `Save confirmed` appears. Choose `Open saved intake`. Status `Draft` is visible and the industry answer is still `Restaurants`.
- **Add a requirement.** Choose `Add a requirement` (`/customer?intake=<id>&newRequirement=1`). Save a must-have or nice-to-have requirement. Return to the intake.
- **Submit.** Heading `Submit your saved intake` is visible. Choose `Review submission`. Tick `Submit all current saved answers and requirements`. Choose `Submit saved intake`. Heading `Your submission is confirmed`. Reload the intake; status is `Submitted`.
- **Proof.** Screenshots of list, save confirmed, and submitted details. Record the intake UUID shown as `Reference:`.

End state that proves it works: a listed intake with status `Submitted`, the saved industry answer still visible, and at least one active requirement.

## Gotchas

- No seed customer. If sign-in cannot reach `/customer`, this journey fails. Put that in the run report; do not weaken the path to a public page.
- Submit is blocked until a must-have or nice-to-have requirement exists (`Add a requirement before submission`).
- `Save draft` stays on draft. `Save and continue` sets status `in_progress`. Submit is available for both.
- Candidate B links (`Proposals and pricing`, `Vendor selection and contracts`, `Demo coordination`) are hidden in launch candidate A. Missing those links is expected.
- Do not use staff `/admin/submissions` as proof that the customer saved an intake. Prove it on `/customer`.
- Server Actions and tRPC need origin `http://127.0.0.1:3100`.
