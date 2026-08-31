# R1 identity boundary

The `IdentityService` contract separates application rules from Supabase administration.
Every runtime file imports `server-only`.
The adapter has no database client, cookies, environment reads, session store, or automatic retries.

## Caller requirements

Call the adapter only after an audited command claims a durable intent.
Use the claimed operation, target, intent ID, correlation ID, and original idempotency key.
An idempotency key must be a UUID or a lowercase SHA-256 digest.
Input validation does not prove permission or lease ownership.
The caller must verify those controls and record the returned outcome.

The adapter exposes no account update, password reset, relink, role change, or individual-factor deletion operation.
Its reset operation targets one exact provider subject.
Provider subjects differ from application identity IDs.

## Verification facts

`getVerificationFacts` reads the current provider user by subject ID.
Only `email_confirmed_at` can prove email verification.
User metadata, phone confirmation, and JWT assurance do not prove it.
The response includes provider ban, deletion, and anonymous-user flags.
These facts do not prove a request session, application status, organization membership, or permission.

`listMfaFactors` includes every verified, unverified, and unknown factor.
It returns only factor IDs, normalized kinds, normalized statuses, and an observation time.
It rejects malformed lists and duplicate IDs.
It never returns factor secrets, phone numbers, names, tokens, or provider payloads.

## Write outcomes and recovery

Supabase does not document an idempotency guarantee for these administration writes.
The adapter validates the application idempotency key but does not present it as a provider guarantee.
The durable intent ledger must prevent concurrent or repeated dispatch.

Each HTTP request has a five-second timeout.
A reset attempts each initial factor once, with a maximum of 16 factors.
It stops new deletions after a 25-second write budget.
It always performs a final provider read after deletion attempts.
Only a final zero-factor observation can prove reset success.
New factors and partial deletion prevent success.
The final observation does not promise that enrollment cannot happen later.
The recovery workflow must retain its stored-state controls and required final checks.

An uncertain deletion uses a read to check the result.
If uncertainty remains, `outcome_unknown` blocks another reset.
`reconcileMfaReset` performs reads only.
Remaining factors require manual review.
Deleted factor secrets cannot be restored; controlled replacement enrollment is the recovery path.

An invitation always uses the configured canonical origin and `/invitations/accept`.
It has no application token or caller-supplied redirect.
Provider acceptance does not prove inbox delivery.
Account existence cannot prove that a specific invitation email was delivered.
An uncertain invitation therefore requires manual review, without a repeat email call.
Provider outcomes are internal worker results; public invitation responses must remain uniform.

## Provider evidence and integration limits

The tests use the installed Supabase SDK, version 2.110.2, with a synthetic HTTP transport.
They do not make live provider requests.
The SDK currently wraps the delete response twice; the adapter validates that exact wrapper and the documented response shape.

Supabase documents all-factor listing and exact-target deletion.
See [listFactors](https://supabase.com/docs/reference/javascript/auth-admin-listfactors),
[deleteFactor](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor), and
[inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

The deletion documentation describes session logout.
The current [Auth server implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go)
and [its tests](https://github.com/supabase/auth/blob/master/internal/api/admin_test.go)
instead downgrade factor-bound sessions to AAL1.
Verify the deployed Auth server version and rehearse its behavior before recovery activation.
Keep the approved session binding and fail closed when that session disappears.
This adapter adds no session-transfer mechanism.

The composition root, durable dispatcher, lease checks, audited result commands, and recovery activation remain separate work.
No live identity write or production activation occurred during adapter development.
