# Staff notification browser review

The synthetic browser rehearsals passed the rendered notification state checks and both saved-state recovery checks.
Exact replay through the uncertain retry button remains unproved.
No actual email was sent, and no provider credential was used.
This report does not establish full application acceptance or live launch readiness.

Each Vitest runner passed one fixture orchestration test.
Those runner results prove setup and cleanup completion, not the entire browser checklist as automated test cases.
The rendered checks used computer-use observations and interactions.
Separate scratch checks verified the saved database counts and source hashes.

## Scope and isolation

The test used the actual local Next.js application and genuine signed staff Auth with AAL2.
The fixture created a synthetic customer intake, approved comparison, disclosed vendor, and distributed RFP through existing protected workflow functions.
Two current verified contacts belonged to the selected synthetic vendor.
The dedicated notification worker role executed only fixed claim, preflight, and result functions for simulated outcomes.
It did not call a real email service.

The app, fault proxy, launcher, and control used `127.0.0.2`.
The disposable Supabase API and database retained their guarded `127.0.0.1` endpoints.
Host-only cookies kept the test session separate from existing user tabs on other local hosts.
The proxy preserved application cookies, request origin, and normal CSRF checks.
No application authorization bypass was added.

Every external variable from `.env.example` was explicitly empty before Next.js started.
AgentMail credentials were explicitly empty, and provider jobs, AgentID, public release, and telemetry were disabled.
Installed Next.js environment code retains explicitly empty initial values when loading dotenv files.
The Next.js log listed `.env.local`; its values were not read or printed by the agent.
The empty initial provider values prevented dotenv from restoring provider credentials.

The built-in Browser was absent from the available browser inventory.
The supported Chrome computer-use browser performed the rehearsal.
No old rejected tab was selected, and no URL policy rejection occurred.

## First fixture results

Fixture: `mmhr-r1-browser-42e4ab66`.
Its database recorded 159 migrations and one copy of the frozen migration 0158 hash.
The [application log](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-2026-10-03.log) remains unchanged.

| Check | Observed result |
|---|---|
| Initial contacts | Two verified synthetic vendor contacts appeared |
| Delayed refresh | The refresh control became disabled while requests were pending |
| Read failure | The correct notification error message appeared and contacts were hidden |
| Read recovery | Normal refresh restored both contacts |
| Lost confirmed queue response | The database saved one row and one receipt; the UI showed an uncertain result |
| Later focus and refetch | The UI replaced the uncertain form with the saved queued state |
| Definite failure before dispatch | Staff could confirm and retry that failure |
| Uncertain worker outcome | Staff review became required; no failed-notification retry button remained |
| Simulated provider acceptance | The UI said `Provider accepted` and kept mailbox delivery unconfirmed |
| Refresh after acceptance | The accepted label remained unchanged |
| Narrow viewport | At 390 pixels, the document width was 375 pixels and notification width was 285 pixels |
| Suspended vendor contacts | The empty-contact message appeared; both previous notification states remained visible |
| Console capture | The available console API returned no warning or error entries |

The transient initial loading text was not captured.
The delayed refresh proved that controls disable while reads remain pending.
The browser API did not expose a complete network trace.
The fault proxy and saved database evidence establish the injected queue response loss.

The first exact retry button could not be clicked after the later focus and refetch changed the visible form.
This was saved-state recovery, not proof of an exact button replay.
The second approved fixture attempted that replay within one browser action sequence.
The first trace remains separate.

The [pre-retry evidence](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-queue-before-retry.json) records the original saved queue result.
The [final database evidence](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-final-evidence.json) records two outbox rows, three command receipts, and three simulated worker attempts.
The original notification reached `needs_attention` after a definite failure and an uncertain second attempt.
The second notification reached `accepted` after one simulated attempt.
There was no provider dispatch.

The first fixture runner exited with code 0 after owned cleanup.
Its containers and volumes were absent after teardown.
Ports 3016, 3018, 3086, and 3087 were free on `127.0.0.2`.
No unrelated service was stopped.

## Second fixture and exact retry limit

Fixture: `mmhr-r1-browser-7548be7a`.
The [second log](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-exact-retry-2026-10-03.log) remains separate from the first run.
The [second database evidence](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-exact-retry-evidence.json) records its distinct notification, recipient, membership, correlation, and idempotency IDs.
One confirmed queue response was dropped for the selected synthetic vendor contact.

The immediate browser action sequence waited for the uncertain retry button.
It requested a 30-second locator budget through the documented browser API.
The backend reported a 3-second selector deadline and a CDP evaluation timeout before that button was observed.
The next observation showed the saved queued state.
The retry button was not clicked, and no exact replay request was recorded.

The database contained one outbox row, one original command receipt, and zero worker attempts.
The proxy captured one request and one recorded result.
There was no duplicate row or provider dispatch.
This proves saved-state recovery and original receipt retention, not unchanged-payload replay.
The capture API again returned no console warning or error entries.

The second fixture exited with code 0 after owned cleanup.
Its containers, volumes, matching fixture processes, and matching Next.js process were absent after teardown.
Ports 3016, 3018, 3086, and 3087 were free on `127.0.0.2`.
All seven application source hashes matched the first record after both runs and final teardown.
The temporary viewport override was removed.
The rehearsal tab was kept open as a retained result.

No third fixture was started.
No focus/refetch behavior, selector limit, application rule, or injected DOM was changed to make the check pass.
The recorded browser timing failure does not establish an application receipt defect.

## Alternative bounded browser proof

Use one documented browser action sequence after the application route and mutation endpoint are warm.
Keep Chrome active throughout that sequence.
Submit the queue form through its visible checkbox and button.
Use bounded semantic DOM observations to check the asynchronous result without changing browser focus.
Click `Retry same request` only after a fresh observation shows that control.
Stop if ordinary refetch instead shows the saved queued record.

Use the documented DOM snapshot and locator APIs only.
Limit the observation sequence to 30 seconds.
Do not suppress refetch, inject DOM, replace authentication, or add a runtime bypass.
Compare the two proxy request fingerprints, safe command IDs, immutable receipt, and original result afterward.
Require one outbox row and zero worker attempts.
This proposed sequence has not run and does not close the current evidence gap.

## Rendered evidence

![Uncertain queue result](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-uncertain-queue.jpg)

![Notification controls at narrow width](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-narrow.jpg)

![Empty contacts with retained notification history](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-empty-history.jpg)

The [read error](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-read-error.jpg), [staff review](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-staff-review.jpg), and [accepted state](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/notification-browser-accepted.jpg) are also retained.

## Source identity

The complete SHA256 manifest is in the final database evidence file.
The frozen migration hash was checked before and after applying migrations.
The following application files were hashed after the first rehearsal.

| File | SHA256 |
|---|---|
| `drizzle/0158_r4_rfp_notification_outbox.sql` | `5a7251db7b4ee2eee1248839bd405e3f9bc9476d42d9c60a31039f67d33a4eb7` |
| `rfp-notification-controls.tsx` | `b3233b148be49a35dfa112fe735f7ba9a52e0ce2c2eb5e378dbd830a42e1d86a` |
| `review-controls.tsx` | `42aa0a875354a7db4d762d54ee44c0290b8ec929080a6ac6c1d82798a8accc49` |
| `routers/rfps.ts` | `2605ec43207efe819d5e1ac92030379ec48bf7dac4fd0e42c91d788a6f7a007d` |
| `commands/rfp-notifications.ts` | `c9996eb793292409be7c86248cb1db09f12820de58320daca7971b147d82b13f` |
| `rfp-notification-contract.ts` | `aecdc8fec09558e67b2f2b51e4516213b4ce708196b235f1cc628d950bc2ac17` |
| `rfp-notification-worker.ts` | `88b2dfee32a3e08e55c756e31a4c47d2f973bb40b8de8761c07ce2e24cdb3eab` |

## Risks and remaining limits

The simulated accepted result proves the label and saved state, not actual provider acceptance or inbox delivery.
The missing retry button proves the UI boundary, not independent direct-RPC denial.
The separate 24-case outbox integration evidence covers protected database behavior.
Full candidate gates, real provider wiring, inbox testing, and live launch approval remain separate requirements.
The approved three AgentMail inboxes were not used in this disabled-provider rehearsal.

Recovery stops only owned app and fixture services, removes the disposable stack, and removes its ephemeral application worker login.
The browser tab remains available; cleanup does not close the browser.
The database cleanup makes later page refresh unavailable until another approved fixture starts.
