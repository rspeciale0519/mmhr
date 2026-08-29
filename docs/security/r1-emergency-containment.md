# R1 Emergency Containment

## Shutdown

1. Record the incident, affected environment, UTC time, and operator.
2. Run the reviewed statements in `r1-emergency-revocation.sql` as the migration owner.
3. Do not disable RLS or grant a broad replacement role.
4. Disable the affected route, command, or function at its smallest boundary.
5. If exact revocation is not sufficient, stop the affected Data API service.

## Restoration

1. Preserve database and application evidence before changing policy.
2. Identify the failed grant, policy, function, or request boundary.
3. Apply a reviewed forward migration that fixes the boundary.
4. Rehearse the migration on a clean local Supabase stack.
5. Verify anonymous denial, authenticated same-organization access, and cross-organization denial.
6. Restore the route only after review records the test evidence.

## Authority

The migration owner controls grants, policies, and functions.

The application worker cannot grant roles or bypass RLS.

Application requests use a verified Supabase token and a validated active organization.

Recovery, bootstrap, and production changes remain separately controlled.

## Current-table principal matrix

| Principal | Direct tables | Fixed functions | Organization scope |
|---|---|---|---|
| Anonymous | Denied | Denied | None |
| Authenticated without membership | Denied | Identity only after verification | None |
| Customer Viewer | Denied | Own identity, own memberships, active organization | Assigned customer organizations |
| Customer Contributor | Denied | Own identity, own memberships, active organization | Assigned customer organizations |
| Customer Organization Admin | Denied | Own identity, memberships, member list, redacted audit | Assigned customer organizations |
| Vendor Viewer | Denied | Own identity, own memberships, active organization | Assigned vendor organizations |
| Vendor Contributor | Denied | Own identity, own memberships, active organization | Assigned vendor organizations |
| Vendor Organization Admin | Denied | Own identity, memberships, member list, redacted audit | Assigned vendor organizations |
| Internal Staff | Denied | No platform table access in R1.3 | Assigned active memberships only |
| Delegated Admin | Denied | No delegation mutation in R1.3 | Assigned active memberships only |
| Super Admin | Denied | No administration mutation in R1.3 | Assigned active memberships only |
| Suspended or revoked member | Denied | Denied | None |
| Suspended or archived identity | Denied | Denied | None |
| Suspended or archived organization | Denied | Denied | None |
| Invited or unaccepted user | Denied | Denied until an active identity exists | None |
| Restricted system worker | No raw table privileges | Worker functions only | System operations only |
| User with two memberships | Denied | Membership list and one validated organization at a time | Each active membership separately |

## Evidence

Keep the migration SQL, local rehearsal output, integration test result, and
review record together. Do not include tokens, secrets, invitation values, or
personal data.
