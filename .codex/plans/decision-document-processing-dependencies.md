# Document processing dependency decision

Initial request: October 1, 2026. Updated review: October 3, 2026.
Status: approved by the user on October 3; exact local installation completed. Processing remains disabled.

Add these exact production dependencies for the private document workflow.
Keep processing separate from approval and publication.

The guarded installation retry exited zero with all three approved parser versions.
Windows checks passed for sharp0.35.5 and optional canvas1.0.10 native operations.
These checks do not prove document extraction, isolation, or application integration.
The full dependency audit still fails on11high entries from the separate unpatched `braces` finding.
Adapters and the isolated worker remain under implementation and review.
An additional runtime image requires a separate reviewed dependency decision.
CI Node22 resolution and native redistribution notices remain unverified.
Pre-change packages and original failed installation records remain in session scratch.

| Dependency | Exact version | Purpose | Primary reference |
|---|---|---|---|
| pdfjs-dist | 6.3.289 | Parse PDF structure and extract plain text | [Mozilla release](https://github.com/mozilla/pdf.js/releases/tag/v6.3.289) |
| mammoth | 1.13.0 | Extract Word document text from private buffers | [Versioned documentation](https://github.com/mwilliamson/mammoth.js/blob/1.13.0/README.md) |
| sharp | 0.35.5 | Decode and validate PNG/JPEG images | [Versioned release](https://github.com/lovell/sharp/releases/tag/v0.35.5) and [input documentation](https://sharp.pixelplumbing.com/api-input/) |

Public npm metadata confirmed every proposed version, its engine requirements, license, and package integrity value on October 3.
Before this approved installation, the installed transitive sharp package had version0.35.4.
Direct application use requires a declared production dependency.
The installed local Node version is 24.20.0.
The PDF package requires Node 22.13.0 or later, or Node 24 or later.
CI currently selects Node 22. Verify its resolved version before acceptance.

## October 3 dependency review

The PDF and Word versions remain current in public npm metadata.
The original request proposed sharp 0.35.4. This revision requests sharp 0.35.5 before any installation.
The [official sharp release](https://github.com/lovell/sharp/releases/tag/v0.35.5) updates libvips binaries and adds array bounds checks.
This revision does not claim that npm reports a vulnerability in sharp 0.35.4.

The direct proposed packages returned no advisories from npm's public bulk security endpoint.
A provisional dependency graph also returned no advisories for 69 package names.
The graph used the newest versions within each declared dependency range and included all optional platform variants.
All metadata requests succeeded. No package was installed.

This graph is not npm's final application lockfile resolution.
Existing application constraints, deduplication, engine checks, and platform selection can change the installed result.
Rerun the full application audit after the approved lockfile changes.
The current application audit still fails independently of these parser choices.
See [the current security decision](decision-security-dependency-remediation-2026-10-03.md).

The provisional Word dependencies include jszip 3.10.2, `@xmldom/xmldom` 0.8.15, and underscore 1.13.8.
The PDF package permits optional `@napi-rs/canvas`; the provisional graph selects version 1.0.10.
Sharp 0.35.5 uses platform packages at 0.35.5 and libvips packages at 1.3.4.
These optional native components require platform testing and license review.
The npm advisory response does not prove native image libraries are free of security defects.

The declared package licenses are Apache-2.0 for PDF.js and sharp, and BSD-2-Clause for Mammoth.
Check licenses and notices for the final transitive graph and bundled native libraries before distribution.

The local Node version meets all proposed package engine requirements.
PDF.js remains the strictest requirement. Reject an installation on Node 22 below 22.13.0.
Do not change a running integration test's shared installed dependencies.
Wait for that baseline run to finish before any approved installation.

## Expected result

Only exact immutable bytes with verified clean scan evidence can enter processing.
Return bounded plain text and typed validation results.
Reject malformed, encrypted, unsupported, or excessive documents with visible failure states.
Require independent human approval before consequential content becomes customer-visible.
Image validation does not establish OCR completion.

## Implementation phases

1. Review the resolved dependency graph, licenses, native components, and vulnerability findings.
2. Pin the approved versions in package.json and package-lock.json.
3. Add parser adapters with explicit byte, page, text, image, time, and memory limits.
4. Isolate parser execution and remove inherited application secrets.
5. Prevent document instructions, remote resources, HTML, and paths from controlling processing.
6. Bind results to exact document versions, original hashes, processing leases, and configuration versions.
7. Record processing state and immutable history without automatic approval.
8. Add independent review, authorized access, and all role controls.

Read the exact installed APIs before implementation.
Do not assume options from earlier package versions.
Do not treat image metadata alone as complete image validation.
Mammoth does not sanitize generated HTML. Use its plain-text interface.
Keep external file access disabled.
Do not pass filenames or URLs as parser input.

## Verification

Test valid files, truncated files, malformed archives, checksum errors, unsafe relationships, active content, encryption, and excessive expansion.
Test limits, timeouts, worker crashes, invalid results, changed hashes, revoked access, and expired leases.
Prove that failure retains quarantine and cannot produce approved content.
Run type checking, lint, unit tests, relevant database/Auth/Storage integration tests, and the production build.
Rerun the dependency audit after the lockfile changes.
Do not claim release readiness while that gate fails.

## Risks and recovery

Untrusted parsers can consume excessive resources or contain security defects.
Keep original objects private and immutable.
Disable processor entry points and preserve originals, job history, and review records when processing fails.
Revoke machine capabilities when authority must stop.
Remove unaccepted adapters and manifest changes through a reviewed local correction.
Retain existing unrelated work and generated migration history.

## Approval boundary

The user approved these exact production libraries before installation.
[AGENTS.md](../../AGENTS.md) says, "Do not add a production dependency without approval."
The user also approved the separate exact Next.js security update packet.
This decision does not activate hosted providers, apply cloud migrations, change real accounts, or authorize deployment.
