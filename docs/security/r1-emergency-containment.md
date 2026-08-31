# R1 Emergency Containment

## Shutdown

1. Record the incident, affected environment, UTC time, and operator.
2. Run the reviewed statements in `r1-emergency-revocation.sql` as the migration owner.
3. Do not disable RLS or grant a broad replacement role.
4. Disable the affected route, command, or function at its smallest boundary.
5. If exact revocation is not sufficient, stop the affected Data API service.

The script revokes the five R1.3 read functions and `mmhr_authorize` when installed.

It preserves RLS, role history, and audit events.

## Restoration

1. Preserve database and application evidence before changing policy.
2. Identify the failed grant, policy, function, or request boundary.
3. Apply a reviewed forward migration that fixes the boundary.
4. Rehearse the migration on a clean local Supabase stack.
5. Verify anonymous denial, current permissions, field filtering, assurance, and cross-organization denial.
6. Restore the route only after review records the test evidence.

## Authority

The migration owner controls grants, policies, and functions.

The application worker cannot grant roles or bypass RLS.

Protected organization-data requests require a verified Supabase token and a validated active organization.

Public, caller-only identity, and platform requests follow their separate scope rules.

Use an authorized incident or release action for production changes.

Recovery and bootstrap remain disabled until their own activation requirements pass.

## Current Local Permission Matrix

These rows describe the local R1.4 evaluation foundation. They do not claim production activation.

An active verified identity can read its own identity without an organization membership.

Organization denial does not remove that caller-only identity read.

Denied fields return `NULL`. Denied scoped records return no rows.

| Principal | Direct tables | Fixed functions | Organization scope |
|---|---|---|---|
| Anonymous | Denied | Denied | None |
| Authenticated without membership | Denied | Identity only after verification | None |
| Customer Viewer | Denied | Own identity, own memberships, active organization | Assigned customer organizations |
| Customer Contributor | Denied | Own identity, own memberships, active organization | Assigned customer organizations |
| Customer Organization Admin | Denied | Own identity and workspace; member list and audit metadata require AAL2 | Assigned active customer organizations |
| Vendor Viewer | Denied | Own identity, own memberships, active organization | Assigned vendor organizations |
| Vendor Contributor | Denied | Own identity, own memberships, active organization | Assigned vendor organizations |
| Vendor Organization Admin | Denied | Own identity and workspace; member list and audit metadata require AAL2 | Assigned active vendor organizations |
| Internal Staff or Admin | Denied | Platform workspace; administration feature requires AAL2; no security mutations | Active membership; external organizations also require an explicit scoped workspace grant |
| Super Admin | Denied | Platform workspace and AAL2 audit metadata; no security mutations | Active membership; external organizations also require an explicit scoped workspace grant |
| Suspended or revoked member | Denied | No reads through that membership | None through that membership |
| Pending, recovery-pending, suspended, or archived identity | Denied | Denied | None |
| Pending, suspended, or archived organization | Denied | No scoped reads for that organization | None for that organization |
| Invited or unaccepted user | Denied | Denied until an active identity exists | None |
| Restricted system worker | No raw table privileges | No active domain command grants | None |
| User with two memberships | Denied | Membership list and one validated organization at a time | Each active membership separately |

Every allowed result still requires current policy. Overrides, role versions, expiry, and feature denial can remove access.

Platform assignment history prevents revoked internal users from gaining external-member access.

See the [permission contract](./r1-permission-evaluation.md) for the exact parent gates and read-function rules.

## Evidence

Keep the migration SQL, local rehearsal output, integration test result, and
review record together. Do not include tokens, secrets, invitation values, or
personal data.
