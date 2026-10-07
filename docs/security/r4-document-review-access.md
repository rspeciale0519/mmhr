# Private document review and access — October 1, 2026

This record covers independent manual review and bounded access to managed workspace originals.
It does not establish complete FR-DOC coverage or permission for real customer use.

## Implemented behavior

Assigned staff can start review of a current, clean original at `/documents/review`.
The reviewer needs current workspace access, `rfp.approve`, platform `admin.access`, and verified MFA assurance.
The uploader cannot review or approve their own file.
The reviewer must request the exact version and explicitly confirm content review before approval or rejection.
The review request must belong to that reviewer and Auth session, with the same version and revision.
It can support a decision for 30 minutes. File access itself expires after 60 seconds.

Approval records the actual reviewer, date, private reason, reference, and immutable version history.
Rejected files remain stored. Rejection denies further content access and new review decisions.
A replacement denies the prior version's access without rewriting its original decision receipt.
Exact retries preserve original results. Changed-content retries fail.
Audit failure rolls back both review state changes and new access grants.

Customers can download an approved current version within their workspace.
Vendors receive the same controls for their own workspace.
This does not authorize cross-workspace attachments or customer document sharing with vendors.
Ordinary metadata and history reads omit private review reasons, scan evidence, and access tokens.

The download route accepts a same-origin POST after selected-workspace authorization.
It binds an opaque access token to the original live Auth session and current authority.
The server verifies actual byte size, format, and hash, then rechecks access before returning the file.
The response forces attachment download and disables caching, content sniffing, and referrer transmission.
The route does not put tokens in URLs or expose the Storage service key.

Storage distinguishes authenticated object downloads from signing, listing, copying, updates, and deletion.
An existing restrictive policy contains additional broad read policies.
Only a current actor and an unexpired exact-version grant permit an ordinary download.
The actor can make at most 16 active grants in the same session.

## Verification

| Check | Result |
|---|---|
| Focused command, audit-value, transport, and review form checks | 109 passed |
| Earlier download, screen, authorization, and inventory checks | 168 passed |
| Earlier download form, review form, and port allocator checks | 21 passed |
| Type checking and full lint after shared reason and label corrections | Passed |
| Production build with document review and access routes | Passed |
| Empty migration rehearsal | Eleven passed across all 157 migrations |
| Current security boundary rehearsal | Two passed |
| Restricted worker database rehearsal | Ten passed |
| Genuine Auth and Storage workflow | All 17 passed after the expiry fixture waited for every active grant |
| Expanded genuine Auth and Storage workflow | All 18 passed, including vendor approved bytes and customer/other-vendor denial |
| Latest 12-file focused run | 212 passed; one document-page worker failed to start; overall run failed |
| Isolated document page retry | All 36 passed; the preceding combined run remains failed |
| Repeated 12-file focused run | All 248 passed |
| Search consumer and document page regression checks | All 45 passed after preserving download and review controls in search results |
| Type checking and full lint after the search correction | Passed |
| Type checking after the joined scanner test | Passed |
| Real Auth, private Storage, scanner, review, and approved access suite | All 13 passed at migration level 157 |
| Complete current unit run | 417 files and 4,868 tests passed; evaluation-options worker failed to start; overall gate failed |
| Fresh complete October 2 unit gate | All 418 files and 4,940 tests passed outside the sandbox after disposable browser services stopped |
| October 2 candidate gates after finance command checks | Type checking, full lint, production build, final whitespace review, and changed document links passed |
| Rendered review and download workflow | Synthetic staff approval and rejection, customer approved access, vendor isolation, histories, and search passed; limits below |

The genuine Auth suite uses real local Auth sessions, private Storage bytes, and restricted document worker claims.
Its scanner evidence is modeled. It does not independently prove antivirus operation.
Earlier combined scan tests proved actual ClamAV at migration level 153.
The first fresh scanner run failed before setup because the sandbox denied Docker access. All twelve checks were skipped.
The isolated run with Docker access passed all thirteen checks.
Its new check joins actual scanner evidence, independent review, and approved customer bytes.
This proves the composed synthetic software path. Human reading and legal validity remain outside that evidence.
The additional vendor approval case first failed because its new organizations lacked required administrators.
The preceding seventeen cases passed. The fixture now includes administrators and an explicit capacity assertion.
The application retains its existing admission checks. The corrected run passed all eighteen cases.

## Browser evidence

The rehearsal used genuine disposable local Auth, Storage, and database services at migration level 157.
It used valid synthetic PDF bytes and modeled clean scanner results. It sent no external messages.
Staff started independent review, requested the current file, and approved it after explicit confirmation.
An unconfirmed decision stayed blocked. Another file followed the separate rejection path.
Terminal approval and rejection screens exposed no new decision controls.

Customers saw the approved download control. Rejected and quarantined files had no content access control.
Customer change history omitted private review reasons.
Vendors saw only their own quarantined file and generic history.
A foreign customer history request showed the normal not-found page.
Streaming returned HTTP 200 for that page; this does not prove an HTTP 404 status.
Customer and vendor history screens had no horizontal overflow at 390 by 844 pixels.

Search showed its pending state and a clear empty vendor result.
The approved customer search result retained the download button after the consumer correction.
Nine search component checks include staff review visibility, workspace binding, and historical access denial.
The later vendor rehearsal retained the staff review link after filename search.
Assigned staff started review, requested the original, confirmed review, and approved the vendor version.
The vendor's approved search result retained its download button and reported download initiation.
The server recorded HTTP 200 for that private download.
The final customer console check returned no captured warnings or errors.
Complete network capture remains unavailable. The server log recorded three successful document access POST responses.

The browser reported download initiation. Download-event capture timed out, so saved-file and file-opening evidence remain unverified.
The October 2 upload retry passed for synthetic vendor and customer sessions.
Both uploads used the actual browser file chooser and ordinary application upload controls.
Each 629-byte PDF reached its own workspace, quarantined at revision two with scanning pending and no approval.
Neither upload had a download control.
The stale vendor search failed safely after a customer session replaced the shared browser session.
The screen showed a generic workspace error and removed the vendor search results.
The customer upload screen showed only customer documents.
Captured warnings and errors were empty for both new upload tabs.
Complete network capture remains unavailable; server logs show successful preparation and completion requests.
The vendor upload screen had no horizontal overflow at 390 by 844 pixels.
Screenshots are `document-vendor-upload-success-2026-10-02.jpg`, `document-customer-upload-success-2026-10-02.jpg`, and `document-search-workspace-error-2026-10-02.jpg` in session scratch.
Bounded database proof is `document-upload-permission-proof.json` in session scratch.
The disposable upload harness passed and cleared ports 3006, 3076, and 3077.
Full-page screenshot capture timed out. Viewport capture succeeded.
The earlier upload attempt stalled before submission. A fresh tab and renewed disposable services supported the successful retry.
Screenshots include `document-review-staff-approved.png`, `document-review-customer-search.png`, and both narrow history views in session scratch.
The harness ended successfully and removed only its owned disposable services. Ports 3006, 3076, and 3077 were clear afterward.

Tests found an unsupported SQL regex repetition count, incompatible audit summaries, and ambiguous retry column names.
The corrections retain existing validation and audit controls.
Form checks found that help text changed an accessible label. The help text now uses `aria-describedby`.
A transport assertion now expects the existing organization-scope `NOT_FOUND` privacy response.
No application authorization rule changed for that assertion.

The initial integration startup also failed to bind a Windows dynamic-range port.
Disposable services now probe bounded lower ports on Windows.
This reduces conflict with dynamic client ports. It does not eliminate all port allocation races.
The mitigation does not stop unrelated processes or change host network settings.

The isolated evaluation-options retry failed before loading inside the sandbox.
Its outside-sandbox retry passed all 26 checks with unchanged test isolation.
The complete outside-sandbox unit retry then passed all 418 files and 4,940 tests.
This establishes a passing candidate unit gate. It does not prove the earlier worker failure cause.

## Limits and remaining work

Manual confirmation does not prove that a person read the file or that an agreement is legally valid.
The download callback confirms a byte response and download initiation, not actual file opening.
Current access uses an authenticated opaque capability, rather than a provider signed URL.
FR-DOC-01 signed access remains incomplete.
Provider signing remains denied until a reviewed design meets current authorization and expiry rules.

Parsing, extraction, approved content search, and safe business-record attachments remain unfinished.
Parser dependency and runtime decisions remain pending.
Scheduled runtime activation, machine credential rotation, retention operation, and hosted bucket provisioning require separate work and approval.
No normal local or cloud migration, hosted policy installation, or external provider activation occurred.

## Migration, risk, and recovery

Migration `0156_r4_document_review_and_access.sql` adds private grants and review RPCs without deleting original files or history.
Drizzle generated its schema metadata. Reviewed SQL adds RLS, immutable grants, and scoped functions.
The owner-only policy installer checks the existing private bucket and operation-specific policy roles before adding content reads.
It refuses ordinary callers and repeated installation.

The main risks are unauthorized bytes, self-approval, stale approvals, and failed retries.
Application commands and SQL independently check the live actor, scope, session, version, and revision.
Request-scoped Supabase clients enforce Storage access. The direct server pool does not serve this route.

For recovery, disable the new application entry points and revoke the new RPC execution grants.
Remove `mmhr_document_content_read_allow` and restore `mmhr_document_read_bound` to its scanner-only predicate.
Preserve the separate scanner policy, immutable originals, grants, audit records, and review history.
Use a reviewed forward correction for stored data or migration changes.
Apply cloud or production changes only after explicit approval.
