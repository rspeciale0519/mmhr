# Finance calculation verification — October 1, 2026

This record covers FR-FIN-03 and FR-FIN-05 calculation controls only.
The complete finance workflow remains unfinished.

## Defects and corrections

The TypeScript payment sum used ordinary numbers for repeated additions.
Valid individual payments could produce a total above `Number.MAX_SAFE_INTEGER` and lose precision.
The sum now uses `BigInt` and rejects an unsupported total before converting it to a number.
Reconciliation and financial reports use the same checked sum.
Reversed payments remain excluded. Duplicate payments and unknown events remain rejected.

The SQL commission calculation rounded down. The TypeScript calculation used half-up rounding.
SQL also multiplied two integers before division, which could overflow for supported large contract values.
Migration `0155_r7_commission_calculation_receipts.sql` uses exact `numeric` multiplication and the existing half-up rule.
It does not rewrite historical commission events.

The migration requires exactly one occurrence of the known old expression in the current function definition.
An unexpected definition stops the correction for review.
The migration replaces the existing function without dropping its identity or changing its privileges.
This behavior follows [PostgreSQL 17 function replacement](https://www.postgresql.org/docs/17/sql-createfunction.html).
Exact arithmetic follows [PostgreSQL 17 numeric types](https://www.postgresql.org/docs/17/datatype-numeric.html).

The current SQL creation retry also omits `status`, which the command result schema requires.
The migration returns the original creation status for an exact structure or event retry.
It does not report a later financial state as the original creation result.
Both known replacement expressions must match exactly once before the migration changes the function.

## Evidence and limits

| Check | Result |
|---|---|
| `npm test -- src/server/finance/commission-contract.test.ts` | 15 passed |
| Registered SQL calculation suite | Eight passed, including preserved historical amounts |
| Existing commission SQL suite | Five passed |
| Finance commands, arithmetic, and authorization boundaries | 89 passed |
| Empty database after finance registration | Eleven passed across 156 migrations |
| Type checking, full lint, production build | Passed for the finance candidate |
| Complete finance unit run | 4,761 passed; one worker failed to start; overall run failed |
| Isolated missing evaluation-options file | 26 passed; this does not convert the complete run into a pass |
| Root finance migration | Registered; normal local and hosted application remain pending |
| Real signed-contract eligibility and source agreement approval | Unverified |
| Invoice, payment, dispute, approval, and closure screens | Unfinished |

The SQL cases cover values below, at, and above a half-unit rounding boundary.
They cover `Number.MAX_SAFE_INTEGER` at a 100-percent rate, stored results, and exact retries.
Both structure and event retries return their required creation status.
Function identity, privileges, security mode, and search path remained unchanged.
Customer, organization administrator, and low-assurance staff requests remained denied.

The SQL fixture models Auth claims. It does not prove genuine signed-token authorization.
It seeds a legacy won deal and synthetic contract identifier to test arithmetic only.
It does not prove current signed-contract associations or an effective approved source agreement.
The rehearsal removed its owned disposable database after the eight registered checks passed.
Logs remain in the session scratch directory.

The command rejects simultaneous percentage and flat amounts, or missing amounts for the selected rule.
It binds the actor, organization, correlation, target, action, and original creation status before returning a receipt.
These checks preserve the current authorization boundary.

## Risk and recovery

The main risks are silent amount errors, changed historical records, and unintended privilege changes.
Boundary tests and function-property comparisons cover this correction's narrow scope.
Apply the reviewed forward migration only in an approved environment.
Preserve stored events and resolve any historical discrepancy through the required approved adjustment workflow.
Do not recalculate or overwrite historical events automatically.
Cloud migration, provider activation, real payments, and deployment require separate approval.

Next, bind finance eligibility to the actual signed portal contract and effective approved vendor agreement.
Complete independent review, invoices, partial payments, exceptions, closure, and ordinary staff screens.
Verify genuine Auth, raw access denial, audit failure, retries, and customer/vendor privacy for that complete workflow.
