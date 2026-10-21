# Four-option staff comparison preview

Status: Native staff preview verified. Not a published customer comparison.

The prior turn completed the profile-approval feature and passed all 4,100 unit tests.
Five local profile approvals remain pending after the automatic review rejection.
This check uses the three already approved real profiles and an existing synthetic option.
It does not bypass the five pending approvals.

## Saved inputs and result

The native staff browser opened submitted fictional intake `da7b8b35-1fb7-4f41-bab8-c8b80cc419ac`.
The saved requirement has key `input_payroll`, with requested value `yes` and weight 1.
Staff preparation selected vendor field `input_payroll` and answer path `requested` under rules version 2.
The new unpublished preview contains four options. The prior preview had one option before profile approvals.

Three real options show “More approved evidence is needed” and “Needs confirmation.”
Each has zero confirmed fit and zero evidence coverage because reviewed package scope is missing.
This does not mean the products lack payroll.
One of those options shows the separately approved Add-on delivery classification.
The existing synthetic option shows 100% fit and evidence coverage for its reviewed test scope.
Every cost and setup estimate remains Unknown.
No publish button was submitted. No customer choice or disclosure was created.

## Native browser checks

- At a 320-pixel viewport, document width and scroll width both measured 305 pixels.
- The matrix region measured 255 pixels wide with 688 pixels of internal content.
- ArrowRight moved the matrix scroll position to 19 pixels.
- All seven requirement/metric row labels retained sticky positioning.
- Enter opened the third option's evidence details. Space closed them.
- The screenshot showed readable evidence text and a visible keyboard focus indicator.
- Evidence details show controlled dates, version, and delivery classification.
- The matrix contained no links, images, or matching text for any of the eight vendor names.
- Browser warning and error logs were empty.
- The viewport was reset. Both working tabs remain available.

The first text-only evidence selector did not match the accessible full label.
Inspection showed a `summary` with hidden option text. A grounded summary locator completed the keyboard check.
No application code changed. Existing tests were not rerun without a code change.

## Remaining evidence

This is staff preview evidence only.
Five profile approvals, reviewed package conditions, remaining delivery classifications, publication, and actual customer selections remain open.
The customer form's keyboard and narrow-screen checks remain separate from this matrix check.
Do not mark Phase 1 complete or start Phase 2.

## September 16 follow-up

See [payroll form and scope evidence](phase1-payroll-browser-scope-2026-09-16.md).
The customer payroll keyboard and narrow-screen checks now pass.
The later preview confirms BambooHR scope and Add-on classification.
Earlier preview results above remain historical evidence.
