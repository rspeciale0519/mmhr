# Private document implementation checkpoint

Updated October 1, 2026. Document upload implementation remains active.

The new server adapters inspect actual bytes, preserve an immutable snapshot, and retain quarantine.
The application now shows scoped document metadata, versions, and history.
Application upload controls are implemented locally. Browser upload verification remains open.
No hosted scanner or scheduled document processor is active in MMHR.
Owned test stacks install private Storage policies and stop after verification.
An owned disposable scanner ran synthetic checks and then stopped.
This work does not complete FR-DOC-01 through FR-DOC-05.

## Prepared behavior

`document-bytes.ts` derives byte size and SHA-256 from the private snapshot.
It accepts the existing PDF, PNG, JPEG, and DOCX header formats within the 25,000,000-byte limit.
It rejects empty files, paths, control characters, oversized UTF-8 names, and client-supplied metadata assertions.
Header recognition does not establish that a complete file is valid or safe.

`docx-container.ts` checks bounded ZIP directory and local-header associations without extracting content.
It requires the Word package parts and rejects encrypted, split, unsupported, overlapping, and excessive archive entries.
It rejects path traversal, duplicate names, macros, and named executable entries.
It does not validate complete XML, archive checksums, or all document behavior.
All accepted bytes still require a trusted scan and processing review.
The format references are [PKWARE APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) and [Microsoft WordprocessingML structure](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document).

The provider implementation in `src/server/integrations/documents/supabase-document-store.ts` uses the supplied scoped client and fixed private quarantine bucket.
The earlier workflow import remains available through a compatibility export.
Object paths contain organization, document, and version identifiers.
Original names do not enter object paths.
Uploads use `upsert: false` and retain the byte-derived hash and size.
Scan reads verify the stored size, hash, and supported header again.
The adapter supplies no public or signed quarantine URL.
Storage RLS must authorize each operation before this adapter becomes reachable.
This follows the [Supabase upload reference](https://supabase.com/docs/reference/javascript/storage-from-upload) and [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control).

The ClamAV provider in `src/server/integrations/documents/clamav-document-scanner.ts` uses the documented `INSTREAM` protocol.
It supports loopback only because clamd TCP has no authentication or encryption.
It requires an explicit engine allowlist and a daemon configured with `TZ=UTC`.
It rejects signatures older than the configured limit, which defaults to 24 hours.
It binds each result to the exact version identifier and original byte hash.
Threat results retain quarantine. Errors, unavailable services, incomplete replies, and timeouts return failure.
A clean response requires matching scanner and signature information before and after the scan.
The protocol reference is [ClamAV clamd documentation](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).
The [upstream command implementation](https://github.com/Cisco-Talos/clamav/blob/main/clamd/session.c) confirms the version and command separator.

## Evidence and limits

Six focused files passed 86 tests after the final compatibility exports.
Type checking, lint, and the production build passed for that same checkpoint.
The scanner tests used owned loopback socket fixtures and synthetic bytes.
They verified framing, fragmented replies, immutable content, threats, stale signatures, hash mismatch, malformed replies, and timeouts.
Three later integration checks ran genuine ClamAV 1.4.6 with current signatures.
Clean synthetic bytes passed. The harmless EICAR test string stayed quarantined. Changed hashes failed before transport.
This proves the test detection path, not detection of every unsafe document.
The official [ClamAV protocol reference](https://docs.clamav.net/manual/Usage/ClamdProtocol.html) documents the EICAR response format.
The pinned image digest is `sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23`.
The fixture uses loopback, an owned network, no host mounts, and resource limits.
Startup failures exposed unpublished-port and inspection-format defects. Their owned fixtures were removed after correction.
The corrected fixture passed and removed its container and network automatically.
The adapter unit tests used a controlled client substitute.
Ten later checks used genuine local Auth and Storage APIs in an owned loopback stack.
They proved reserved uploads, immutable paths, scan queue creation, replay, ownership, size/MIME checks, and quarantine read denial.
They also proved denial when broader permissive policies existed or current membership changed.
The owned stack removed its containers and database after testing.
These results do not prove hosted configuration or the combined scan and review path.

## Managed records and leased work

Migrations `0145`, `0146`, and `0147` prepare upload associations, immutable history, legacy guards, and dedicated scan authority.
All 150 migrations applied to an empty disposable database. Eleven checks passed across the 147-table inventory.
Eight upload boundary checks passed, including filename safety and concurrent registration against an older scan request.
The filename check needed correction after a PostgreSQL regular expression failed during the first insert.
Legacy document, search, and job compatibility checks passed before the latest worker migration.

The old document RPC cannot scan, approve, replace, or archive managed uploads.
The old search-content RPC cannot publish text for managed versions.
The old job RPC cannot claim or complete their processing jobs.
The wrappers take the existing security lock before checking managed associations.

`document-scan-worker.ts` checks scoped leases, immutable bytes, actual hashes, and typed scanner evidence.
It rejects unsafe or altered files and records safe failure codes.
It reports uncertain database acknowledgements without another write or scan.
It does not approve, extract, summarize, or publish a document.

The dedicated document worker has four private functions and no raw table access.
It cannot use identity worker functions or ordinary user document commands.
The owner-only provisioning function creates a separate login with a maximum ten-minute lifetime.
No live login was provisioned.
Leases last two minutes. Completion checks the actual clock after lock waits.
This follows [PostgreSQL clock semantics](https://www.postgresql.org/docs/current/functions-datetime.html) and [function snapshot rules](https://www.postgresql.org/docs/current/xfunc-volatility.html).

Eleven dedicated worker database checks passed.
They covered exact claims, replay, wrong leases, stale evidence, bounded retries, unsafe files, and expired attempts.
They also covered revoked membership, expired credentials, accidental column grants, and completion after a blocked lease expired.
These database fixtures used synthetic Auth rows and scan receipts.
The earlier checks did not prove the combined Auth, Storage, scanner, and application upload workflow.

## Workspace upload checkpoint

Migration `0148` adds reservations for exact managed workspace originals.
The server derives the file size and hash from actual bytes.
The database requires current writer membership or assigned internal AAL2 staff authority.
Workspace read permission alone cannot authorize an upload.
Eleven database checks passed, including removed sessions and token expiry during a real lock wait.
Five genuine Auth checks passed for ordinary customer, vendor, and assigned staff requests.
Unrelated users, viewers, anonymous requests, and suspended memberships stayed blocked.
Initial fixtures lacked a required vendor administrator. That setup was corrected without changing the security rule.
The SQL name conflict found during review was corrected before the successful checks.

Migration `0149` adds an owner-only Storage policy installer and upload completion.
The installer requires a private bucket with the exact size and MIME limits.
It adds restrictive controls alongside any existing permissive policies.
Storage schema and object changes continue through the provider API.
The installer runs only after that API initializes its schema and creates the bucket.
It cannot run through an ordinary user or identity worker.
No normal project or hosted bucket was changed.

Completion checks the stored object, its actual size/MIME, owner, scope, and current authorization.
It queues one durable scan job and records immutable upload history.
It returns quarantine state. It does not prove the stored hash, scan, extraction, approval, or safe access.
The dedicated scanner must verify the actual stored bytes before any later state can proceed.
Thirty-nine focused checks passed for the commands and authorization/schema inventories.
Fresh type checking and lint passed after the final Storage tests. The Storage checkpoint production build passed.

The first worker checks found sequence-check evaluation and local-variable qualification errors.
Those defects were corrected before the successful checks.
Private provider errors remain hidden in application responses.

## Lease-bound processor reads

Migration `0150` adds two private capability tables with RLS and no ordinary table grants.
The owner registers a genuine machine Auth subject and session against a safe, expiring document worker login.
Registration rejects application identities and records an audit event.
Reader access lasts at most ten minutes. Revocation retains the capability record and audit history.
The existing claim function binds each lease to the exact database login.
Its four-function authority and lack of raw table access remain unchanged.

The owner installs separate download policies only after the existing private upload policies.
The [Storage operation helper](https://supabase.com/docs/guides/storage/schema/helper-functions) limits access to `object.get_authenticated`.
Missing helpers or operation context deny access.
The reader receives no service key, signing key, table read, ordinary identity, or customer/staff authority.
Only its exact active lease can authorize an object download.
Signing, listing, copying, replacement, and ordinary customer/staff/vendor downloads remain denied.
Current session, provider status, credential safety, lease, job, document, and organization checks protect every new request.
An authorized read already in progress can finish. The worker rechecks its lease before scanning and recording.

`runDocumentScanSweep` reads at most five durable queue candidates and processes them sequentially.
It stops after an uncertain worker result and never blindly retries completion.
It yields at its time budget and leaves remaining candidates unclaimed.
Provider errors return safe codes without credentials, object paths, or file contents.
Forty focused sweep/worker tests passed. Current type checking and lint passed.

Ten combined backend tests passed through real local Auth, Storage, PostgreSQL leases, and ClamAV.
They verified clean evidence, actual hash changes, exact worker ownership, broader-policy containment, revocation, and genuine lease expiry.
The harmless antivirus Word package stayed quarantined. Banned machine accounts and expired worker logins could not read files.
Clean scanning ends at `ready`; it does not approve document content or authorize an application download.
Twelve worker security/recovery checks passed after the fixture boundary correction, including copied or altered context denial.
Eight upload boundary checks passed again with the guarded observer connection.
All 151 migrations applied to an empty disposable database; eleven checks passed across 147 public tables.
The reader checkpoint production build passed. Current type checking and lint passed after the fixture corrections.
The first complete unit run failed two architecture/inventory checks and one Windows worker startup.
The fixture code now uses the existing database boundary and `src/test/documents/`.
The security test exceptions remain unchanged. The migration inventory now records the verified 151 migrations.
Sixty-one focused fixture/architecture/inventory checks passed. The missed component file passed 26 tests in isolation.
The fresh complete unit run passed 393 files and 4,400 tests after those corrections.

The first lease-expiry test tried to alter an existing lease and failed the immutable association trigger.
The corrected test waits for the actual two-minute lease deadline and keeps every production guard active.
The earlier sandbox test could not access Docker. The guarded owned fixture passed with approved local Docker access.
No normal project bucket, cloud database, hosted provider, or production permission changed.

## Workspace metadata and role screens

Migration `0151` adds three narrow authenticated read functions.
They return managed workspace metadata, version summaries, and change history in pages of 25 records.
The current version must belong to an active document and the requested organization.
Legacy records, unrelated sources, archived documents, and mismatched associations stay outside these reads.
Each request checks the real clock after the security lock, the current session, and current workspace authority.
Read-only members can view metadata. They cannot reserve or upload a document.

The `/documents` page uses the server-selected workspace.
Customer, vendor, assigned staff, and read-only members receive the same scoped metadata interface.
Home, customer, vendor, and staff navigation now link to this page.
File names render as text. Errors show generic messages.
No file location, hash, scan receipt, actor identity, extracted text, lease, or signed URL reaches these views.
Safety checks, pending processing, approval, rejection, and failure have distinct labels.
An earlier version retains its own history.

The focused command/router checks passed 42 tests.
The broader focused screen and inventory run passed 138 tests across eight files.
The corrected page passed 25 tests after moving rendered output outside the data error handler.
Ten database checks and eight genuine local Auth checks passed.
They covered paging, version/history binding, direct RPC access, viewer restrictions, membership changes, banned providers, and expired sessions.
All 152 migrations applied to an empty disposable database. Eleven checks passed across 147 public tables.
The dedicated document worker passed twelve checks again at this migration level.

Manual browser verification passed ten checks using genuine local customer, vendor, and assigned staff sessions.
These checks covered saved versions, history, escaped names, a 390-pixel viewport, an empty continuation, and cross-organization denial.
The vendor could not open the customer document.
The captured browser console had no warnings or errors.
The server log contained stale refresh-token errors before successful application requests. Their source remains unverified.
Full browser network traces remain unavailable.
The metadata fixture used synthetic reservation/history rows. It does not prove uploaded bytes, extraction, or human approval.
The owned browser servers, short-lived worker, and disposable database stopped after verification.

Current type checking and lint passed. The final metadata screen production build passed.
The new full unit attempt passed 395 files and 4,441 tests but failed one Windows worker startup.
That result is a failed complete gate.
The missed component file then passed all 26 tests separately.
The fresh complete unit command passed all 396 files and 4,467 tests.
The earlier 393-file, 4,400-test result belongs to the prior checkpoint.

Full format validation and text extraction require a separate dependency decision.
See [the concrete dependency packet](../../.codex/plans/decision-document-processing-dependencies.md).
No production library was installed without approval.

## Private file name search

Migration `0152` adds a compatible optional filter to the existing metadata read.
It matches literal file-name text without treating percent, underscore, or quotes as query operators.
The existing organization, session, clock, source, version, and paging controls remain active.
It searches current managed workspace names only. It does not search extracted content or unapproved business attachments.

The application search uses a strict POST action with the configured trusted origin.
The action checks the server-selected workspace against the displayed workspace before reading.
Each read rechecks current authorization through the request-scoped command and database function.
Previous browser state grants no authority.
Search terms stay outside page URLs. Workspace changes reset the client search state.
The interface supports keyboard submission, pending feedback, visible failures, empty results, and bounded continuation.

Seven focused files passed 153 tests after fixture and selector corrections.
Thirteen database checks and nine genuine Auth checks passed against 153 migrations.
All 153 migrations applied to an empty owned database. Eleven checks passed across 147 public tables.
Type checking, full lint, and the search application production build passed.
The earlier 396-file complete unit result precedes this search change. The next complete unit gate remains open.

Eleven manual browser checks passed for customer, vendor, and assigned staff search.
They covered Enter, button submission, literal search, clearing, isolation, safe text, unchanged page URLs, and 390-pixel layout.
No object download appeared. Captured browser console warnings and errors were empty.
Server logs confirmed POST document requests. Full browser network traces remain unavailable.
The document-only fixture grants staff workspace access. Its evaluation launcher target showed a generic denial.
Document search used the authorized document route. This fixture does not establish the full staff evaluation workflow.
The owned stack stopped and removed its short-lived worker and database.

The test launcher reused cookies from previously removed loopback databases before starting a new role login.
Those disposable endpoints share the SDK's hostname-based cookie key.
The launcher now discards only the old local Auth session before SDK initialization.
Four cookie regression checks passed. Four fresh genuine browser checks also passed for customer, vendor, and assigned staff sessions.
The fresh server log contained no stale refresh-token errors. Captured browser warnings and errors were empty.
The owned fixture stopped after verification.
Normal application sessions and production authentication code did not change.

The next complete unit attempt failed two inventory comparisons and one Windows worker startup.
Upload implementation changed the inventory during that run. Its 396 passing files do not establish a stable complete gate.
The corrected inventory and omitted component passed in a separate 66-test run.
A fresh complete run must use stable source after upload verification.

## Application upload controls under verification

The new form prepares an immutable workspace version through scoped tRPC mutations.
Both mutations require trusted-origin POST, the server-selected organization, verified identity, and current database authorization.
The database separately restricts reservations and completion to active document writers.
Read-only workspace members receive no upload control.
Replacements require an approved or rejected current version and the exact expected version.

The browser computes size and hash from the selected file.
The preparation manifest remains untrusted. It grants quarantine insertion only and never certifies bytes, scanning, or approval.
The file goes directly to the fixed private Storage bucket through the user's authenticated browser client.
The upload uses its exact immutable UUID path and prohibits replacement.
No service key, signed URL, download access, or file content passes through the application mutation.

This path preserves the 25 MB file limit without sending a large file through a Vercel Function.
Vercel limits Function request and response bodies to 4.5 MB. See [Function limits](https://vercel.com/docs/functions/limitations#request-body-size).
Supabase supports standard direct uploads and recommends resumable uploads above 6 MB. See [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).
This implementation uses the existing SDK. Resumable transport remains a later reliability improvement.

Completion checks the actual private object metadata and queues one scan with immutable history and audit.
The worker reads actual stored bytes and checks size, hash, recognized format, and scanner evidence before downstream use.
Full parser validation, extracted content review, and approval remain separate unfinished controls.

The interface prevents duplicate submission and preserves the same reservation identifiers for an explicit reservation retry.
After an uncertain Storage write, it offers completion checking without repeating or overwriting the original upload.
An uncertain completion retries the same receipt. Failures remain visible and grant no document use.
Recovery retains original objects and reservation history. Operators must review incomplete records before a new upload.

The first six focused files passed 104 tests. Tests exposed duplicate React keys; those keys are corrected.
The corrected page and omitted component/inventory checks passed 66 tests.
The corrected upload form and page passed 46 tests.
Initial type checking passed. Full lint passed after replacing rendered ref reads with state.
Twelve genuine Auth and Storage tests passed. They include manifest reservation, viewer/outsider denial, actual object completion, and audit recovery.
Twelve combined Auth, Storage, database, and ClamAV checks passed at migration level 153.
False browser hashes and changed bytes remained rejected, without scan evidence or approval.
The current production build passed, including TypeScript validation.
The stable complete unit run passed all 401 files and 4,567 tests without worker startup errors.
That result precedes the file-type correction below. Its four focused files passed 73 tests; the final manifest check passed 33 tests.
The later type check, full lint, and production build passed. A new complete run will cover the continuing proposal changes.

The upload review found that browser file-type labels can be empty or depend on operating-system settings.
The browser now derives a supported quarantine label from the file extension and rejects unsupported extensions before reading bytes.
This label proves no file safety. Actual byte, hash, format, and antivirus controls remain unchanged.
See the [File API type reference](https://developer.mozilla.org/en-US/docs/Web/API/Blob/type).

The owned browser fixture rendered the customer upload form with genuine authentication.
The browser file chooser then stalled. Its call exceeded the requested tool timeout and the fixture's two-hour lifetime.
No browser file upload, size-error interaction, or vendor/staff upload received verified evidence.
The stalled test worker exited before normal cleanup. Exact fixture labels identified the six remaining containers and two generated volumes.
Those owned containers, volumes, and the fixture network were removed. Normal MMHR volumes remained intact.
The application, launcher, control, and disposable database ports have no listeners.
Do not treat the rendered form or backend checks as a complete browser upload result.
No normal or hosted bucket was created or changed. No production dependency was installed.

## Next integration work

1. Complete upload verification and guarded review commands.
2. Add processor runtime configuration and credential rotation for separate activation review.
3. Connect the verified scan sweep to the scheduled runtime and application entry points.
4. Add reviewed extraction, independently approved content, and short-lived authorized access.
5. Add customer, staff, and vendor upload, review, processing, and approved content search controls.
6. Connect safe response documents and demo evidence to their exact business records.
7. Test the complete Auth, Storage, scanner, review, and customer read path.
8. Prepare hosted runtime configuration for separate activation approval.

The main risk is an unsafe file reaching a customer, staff member, extractor, or AI provider.
Keep managed files quarantined when any integrity, scan, authorization, or job check fails.
For recovery, disable new entry points and processors while retaining immutable originals and event history.
Revoke the dedicated worker functions and logins when processor authority must stop.
Apply corrective forward migrations after review. Do not delete source files or history.

No new production dependency, cloud migration, external provider activation, or production write occurred.
Existing unmanaged metadata commands retain their compatible behavior.
The latest full integration run remains unverified. The earlier 110-file matrix inventory check passed before proposal tests were added.
