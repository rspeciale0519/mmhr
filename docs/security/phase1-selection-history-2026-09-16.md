# Phase 1 selection history correction

Status: Local correction, all test gates, and browser check passed. Phase 1 remains incomplete.

## Browser finding

The approved local customer sign-in succeeded in the native browser.
Comparison version 2 showed one masked option and one saved choice from version 1.
The screen offered the current option as a new choice. Saving returned a rejection.
Read-only local database inspection confirmed both options refer to the same product.
The server correctly rejects duplicate products across publication versions.
The display compared only publication and option IDs, so it missed the existing product choice.

## Change and compatibility

Migration 0139 adds an optional publication parameter to the existing selection read.
The result contains only option IDs from that authorized, current publication.
The database checks product identity internally. It does not return vendor or product identifiers.
The matrix uses these option IDs to display Choice saved.
Old read calls retain their existing result shape. Existing selections and publications remain unchanged.
The existing server duplicate check and five-choice limit remain unchanged.

## Risk and recovery

The main risk is returning a saved-choice mapping for the wrong publication or organization.
The read uses the existing scoped publication check before it returns any mapping.
The command binds the returned publication ID to the request.
Apply locally only after disposable database regression tests pass.
Keep this additive migration if application code must revert. Correct SQL through a forward migration.
No cloud migration or production action is authorized.

## Verification

Focused unit, page, and migration checks passed: four files, 88 tests.
The disposable database regression suite passed all eight tests after a migration syntax correction.
Type checking, lint, and the production build passed. The build contains 71 routes.
The integration inventory passed for 100 test files. The tracked secret scan passed for 1,156 files.
Dependency audit reported zero vulnerabilities.
The database test covers changed option IDs across versions and preserves historical items.
It also checks old reads, rejected old or missing publications, and invalid input.
Migration 0139 was reviewed and applied to local Supabase only.
The native customer browser now shows Choice saved after refresh, with the earlier historical option retained.
At a 320-pixel viewport, document width and scroll width both measured 305 pixels.
The matrix contained no links or images. Captured browser warning and error logs were empty.
The viewport was reset and the customer tab retained.
This one-option check does not prove a new save or multiple-option scrolling.
The earlier rejected save did not prove successful new-choice persistence.
Full unit suite25014 passed: 360 files and 4,070 tests in 761.73 seconds. Source remained unchanged during the run.

## Review notes

An initial SQL generation attempt mishandled newline and replacement-string syntax. Review caught it before application.
The first disposable migration test rejected an unparenthesized CASE expression.
The corrected migration passed all eight integration tests before local application.
No failed migration reached the local application database.
The command still uses request-scoped authority. The optional result excludes product IDs, vendor names, source links, and branded content.
No write function, selection limit, RLS policy, permission, or historical record changed in this correction.
