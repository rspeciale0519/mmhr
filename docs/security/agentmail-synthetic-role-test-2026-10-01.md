# AgentMail synthetic role test

Date: October 1, 2026.
Status: The direct API test passed. Application email delivery remains unfinished.

The user authorized the three existing AgentMail inboxes for test customer, staff, and vendor roles.
The test used the existing `AGENTMAIL_API_KEY` environment variable.
It used synthetic text and a unique test marker. It did not use real customer data.
It did not create inboxes, enable AgentID, or change Supabase accounts.

## Results

| Check | Result |
|---|---|
| Read the three approved inboxes | All three ready |
| Staff message to customer | Received |
| Staff message to vendor | Received |
| Vendor reply to staff | Received; linked to the original message |
| Customer reply to staff | Received; linked to the original message |
| Four retries with unchanged requests and keys | Original message and thread identifiers returned |
| Four retries with changed text and the original keys | HTTP 409; no altered message sent |
| Inbox checks for the four logical messages | Each appeared once per applicable inbox |

The scratch test saved only its synthetic command state, retry keys, receipts, and results.
It did not save the API key or unrelated inbox contents.
The test left the four synthetic messages in the approved inboxes.

AgentMail documents send and reply endpoints and retry protection in its current API reference.
See [Send Message](https://docs.agentmail.to/api-reference/inboxes/messages/send),
[Reply To Message](https://docs.agentmail.to/api-reference/inboxes/messages/reply),
and [Idempotent Requests](https://docs.agentmail.to/idempotency).

## Limits and next work

This test proves the approved inboxes can send and receive synthetic role messages through the AgentMail API.
It does not prove MMHR queues, sends, receives, or associates those messages through normal application controls.
Provider delivery events, verified inbound events, consent, bounded retries, and staff recovery still need application integration.
The application must preserve its current organization, audit, and approval controls when those integrations are added.
