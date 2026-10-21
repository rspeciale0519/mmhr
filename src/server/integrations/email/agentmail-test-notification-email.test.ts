import { afterEach, describe, expect, test, vi } from "vitest";
import { createAgentMailTestNotificationEmail } from "./agentmail-test-notification-email";
import { runRfpNotificationWorker } from "@/server/workflows/rfp-notification-worker";
import type { NotificationClaim } from "@/server/workflows/rfp-notification-contract";
import type { OutboundCommunicationRequest } from "@/server/workflows/communication-contract";

const clock = Date.parse("2026-10-03T05:00:00Z");
const claim: NotificationClaim = {
  notificationId: "9f4ef26b-cdfd-44c0-9849-4ce87af223a9",
  organizationId: "7db1a7ef-00b8-481e-96cf-5c504e117b0b",
  rfpId: "dd3bd331-c956-4914-b1ec-1366270281fc", version: 1,
  correlationId: "a69b2b54-5449-4911-89c9-427a349b6b53",
  recipientId: "ec8a7b6a-fc1b-42a7-91fb-e8eb39384543",
  membershipId: "ea77343b-274d-45d7-b76d-e02b41d7f939",
  recipientIdentityId: "60c4cb77-660d-4504-8a60-76fbad2480c8",
  recipientEmail: "dev-0003@agentmail.to", sourceDigest: "a".repeat(64),
  subject: "A new request is available in your MMHR vendor portal",
  body: "Sign in to your MMHR vendor portal to review your request.",
  attemptId: "4c0d03a6-1f7c-4a66-a4bf-055888d22131", attemptNumber: 1,
  token: "b".repeat(64), expiresAt: "2026-10-03T05:01:00Z",
};
const config = { enabled: true as const, apiKey: "synthetic-key-never-real", sendingInbox: "dev-0002@agentmail.to" as const };
function request(): OutboundCommunicationRequest {
  return { channel: "email", idempotencyKey: claim.notificationId, correlationId: claim.correlationId,
    templateKey: "rfp.portal_notification", subject: claim.subject, body: claim.body,
    recipientIds: [claim.recipientIdentityId], consent: "transactional",
    associations: [{ organizationId: claim.organizationId, recordType: "rfp", recordId: claim.rfpId }] };
}
function setup(manifest: unknown = claim, options: unknown = config) {
  const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    message_id: "<synthetic-message@agentmail.to>", thread_id: "synthetic-thread",
  }), { status: 200 }));
  const service = createAgentMailTestNotificationEmail(manifest, options as typeof config, { fetchImplementation, now: () => clock });
  return { service, fetchImplementation };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function cleanupSetup(status: number, cancel: () => Promise<void>) {
  const { service, fetchImplementation } = setup();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(status === 200 ? 16_385 : 1)); },
    cancel,
  });
  fetchImplementation.mockResolvedValue(new Response(body, { status }));
  return { service, fetchImplementation, body };
}

describe("synthetic AgentMail notification transport", () => {
  test("sends only immutable manifest content with provider idempotency and restricted fetch", async () => {
    const { service, fetchImplementation } = setup();
    expect(await service.send(request())).toEqual({ communicationId: claim.notificationId,
      providerMessageId: "<synthetic-message@agentmail.to>", state: "sent", failureCode: null, retryable: false });
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://api.agentmail.to/v0/inboxes/dev-0002%40agentmail.to/messages/send");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "omit", redirect: "error", cache: "no-store" }));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({ to: [claim.recipientEmail], subject: claim.subject, text: claim.body });
    const headers = new Headers(init?.headers);
    expect(headers.get("Idempotency-Key")).toBe(claim.notificationId);
    expect(headers.get("Authorization")).toBe(`Bearer ${config.apiKey}`);
    expect(headers.has("cookie")).toBe(false);
    expect(String(init?.body)).not.toContain(claim.token);
    expect(String(init?.body)).not.toContain(claim.organizationId);
  });

  test("uses no provider when configuration remains disabled", async () => {
    const { service, fetchImplementation } = setup(claim, { enabled: false });
    expect(await service.send(request())).toMatchObject({ state: "failed", failureCode: "provider_unavailable_pre_dispatch" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test.each([
    { ...config, sendingInbox: "outside@example.test" }, { ...config, apiKey: "bad\nheader" },
    { ...config, apiKey: "" }, { ...config, endpoint: "https://outside.example.test" },
  ])("rejects invalid or expanded provider configuration %#", async options => {
    const { service, fetchImplementation } = setup(claim, options);
    expect(await service.send(request())).toMatchObject({ state: "failed", failureCode: "provider_unavailable_pre_dispatch" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test.each(["dev-0001@agentmail.to", "dev-0002@agentmail.to", "dev-0003@agentmail.to"])("permits authorized synthetic inbox %s", async recipientEmail => {
    const { service, fetchImplementation } = setup({ ...claim, recipientEmail });
    expect(await service.send(request())).toMatchObject({ state: "sent" });
    expect(JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body)).to).toEqual([recipientEmail]);
  });

  test.each(["outside@example.test", "dev-0003+extra@agentmail.to", "DEV-0003@agentmail.to"])("denies recipient outside exact test allowlist %s", async recipientEmail => {
    const { service, fetchImplementation } = setup({ ...claim, recipientEmail });
    expect(await service.send(request())).toMatchObject({ failureCode: "source_changed" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  const alterations: Array<[string, (input: OutboundCommunicationRequest) => void]> = [
    ["content", input => { input.body += " changed"; }],
    ["subject", input => { input.subject = "Changed subject"; }],
    ["recipient", input => { input.recipientIds = [claim.organizationId]; }],
    ["extra recipient", input => { input.recipientIds.push(claim.organizationId); }],
    ["organization", input => { input.associations[0].organizationId = claim.rfpId; }],
    ["RFP", input => { input.associations[0].recordId = claim.organizationId; }],
    ["record type", input => { input.associations[0].recordType = "customer"; }],
    ["extra association", input => { input.associations.push({ ...input.associations[0] }); }],
    ["template", input => { input.templateKey = "other.template"; }],
    ["consent", input => { input.consent = "opted_out"; }],
    ["idempotency", input => { input.idempotencyKey = claim.rfpId; }],
    ["correlation", input => { input.correlationId = claim.rfpId; }],
  ];
  test.each(alterations)("rejects changed %s before dispatch", async (_, change) => {
    const { service, fetchImplementation } = setup(); const input = request(); change(input);
    expect(await service.send(input)).toMatchObject({ failureCode: "source_changed" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test("copies source values before caller mutation", async () => {
    const mutable = { ...claim }; const mutableConfig = { ...config };
    const { service, fetchImplementation } = setup(mutable, mutableConfig);
    mutable.recipientEmail = "outside@example.test"; mutable.body = "Private changed text"; mutableConfig.apiKey = "altered";
    expect(await service.send(request())).toMatchObject({ state: "sent" });
    const init = fetchImplementation.mock.calls[0][1];
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${config.apiKey}`);
    expect(JSON.parse(String(init?.body))).toEqual({ to: [claim.recipientEmail], subject: claim.subject, text: claim.body });
  });

  test.each(["2026-10-03T05:00:00Z", "2026-10-03T04:59:59Z"])("denies expired lease %s", async expiresAt => {
    const { service, fetchImplementation } = setup({ ...claim, expiresAt });
    expect(await service.send(request())).toMatchObject({ failureCode: "lease_expired" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test.each([null, { ...claim, extra: "private" }, { ...claim, recipientEmail: "bad" }])("denies malformed manifest %#", async manifest => {
    const { service, fetchImplementation } = setup(manifest);
    expect(await service.send(request())).toMatchObject({ failureCode: "source_changed" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test.each([400, 403, 404, 409, 429, 500, 503, 202, 302])("keeps HTTP %s uncertain without exposing response text", async status => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(new Response("private provider response", { status }));
    const result = await service.send(request());
    expect(result).toMatchObject({ providerMessageId: null, state: "failed", failureCode: "outcome_unknown", retryable: false });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  test.each([null, {}, { message_id: "id" }, { message_id: "id", thread_id: "bad\nvalue" },
    { message_id: "x".repeat(256), thread_id: "thread" }])("rejects incomplete or unsafe acceptance %#", async value => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(new Response(JSON.stringify(value), { status: 200 }));
    expect(await service.send(request())).toMatchObject({ failureCode: "outcome_unknown" });
  });

  test.each(["not JSON", "x".repeat(16_385)])("rejects malformed or oversized acceptance %#", async body => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(new Response(body, { status: 200 }));
    expect(await service.send(request())).toMatchObject({ failureCode: "outcome_unknown" });
  });

  test("redacts transport errors and prevents an automatic second send", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockRejectedValue(new Error(`private ${config.apiKey}`));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await service.send(request());
      expect(result).toMatchObject({ failureCode: "outcome_unknown", retryable: false });
      expect(JSON.stringify(result)).not.toContain(config.apiKey);
    }
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  test("prevents concurrent or repeated dispatch from one attempt", async () => {
    const { service, fetchImplementation } = setup();
    const results = await Promise.all([service.send(request()), service.send(request())]);
    expect(results.map(result => result.state)).toEqual(["sent", "failed"]);
    expect(await service.send(request())).toMatchObject({ failureCode: "outcome_unknown" });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  test.each([true, false])("worker composes the adapter without claiming delivery; accepted=%s", async accepted => {
    const { service, fetchImplementation } = setup();
    if (!accepted) fetchImplementation.mockRejectedValue(new Error("private timeout"));
    const recordResult = vi.fn().mockResolvedValue(true);
    expect(await runRfpNotificationWorker(claim.notificationId, { enabled: true,
      claim: async () => claim, canDispatch: async () => true, createEmailService: () => service, recordResult,
    })).toEqual({ outcome: accepted ? "accepted" : "needs_attention" });
    expect(recordResult.mock.calls[0][1]).toEqual(accepted
      ? { outcome: "accepted", providerMessageId: "<synthetic-message@agentmail.to>" }
      : { outcome: "needs_attention", failureCode: "outcome_unknown" });
  });

  test.each([200, 503])("bounds HTTP %s cancellation and preserves an uncertain no-retry result", async status => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => undefined));
    const { service, fetchImplementation, body } = cleanupSetup(status, cancel);
    let settled = false;
    const result = service.send(request()).then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_999); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ state: "failed", providerMessageId: null, failureCode: "outcome_unknown", retryable: false });
    expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    expect(await service.send(request())).toMatchObject({ failureCode: "outcome_unknown", retryable: false });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  test.each([200, 503])("sanitizes HTTP %s cancellation rejection and releases its owned reader", async status => {
    const cancel = vi.fn(async () => { throw new Error(`private ${config.apiKey}`); });
    const { service, fetchImplementation, body } = cleanupSetup(status, cancel);
    const result = await service.send(request());
    expect(result).toMatchObject({ state: "failed", failureCode: "outcome_unknown", retryable: false });
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(body.locked).toBe(false); expect(cancel).toHaveBeenCalledOnce(); expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  test.each([200, 503])("handles a synchronous HTTP %s cancellation failure and still releases the reader", async status => {
    const { service, body } = cleanupSetup(status, async () => undefined);
    const reader = status === 200 ? body.getReader() : undefined;
    if (reader) vi.spyOn(body, "getReader").mockReturnValue(reader);
    const cancel = reader ? vi.spyOn(reader, "cancel") : vi.spyOn(body, "cancel");
    cancel.mockImplementation(() => { throw new Error(`private ${config.apiKey}`); });
    const result = await service.send(request());
    expect(result).toMatchObject({ state: "failed", failureCode: "outcome_unknown", retryable: false });
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
  });

  test.each([200, 503])("observes HTTP %s cancellation rejection after the wait expires", async status => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, fail) => { reject = fail; });
    const cancel = vi.fn(() => pending);
    const { service, fetchImplementation, body } = cleanupSetup(status, cancel);
    const result = service.send(request());
    await vi.advanceTimersByTimeAsync(2_000);
    const receipt = await result;
    expect(receipt).toMatchObject({ state: "failed", failureCode: "outcome_unknown", retryable: false });
    reject(new Error(`private late ${config.apiKey}`));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toEqual(receipt); expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    expect(cancel).toHaveBeenCalledOnce(); expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  test("does not report valid acceptance before successful owned cleanup", async () => {
    const { service, fetchImplementation } = setup();
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }), { status: 200 });
    let resolve!: () => void;
    const pending = new Promise<void>(done => { resolve = done; });
    const reader = response.body!.getReader();
    vi.spyOn(reader, "read").mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(JSON.stringify({
      message_id: "<synthetic-message@agentmail.to>", thread_id: "synthetic-thread",
    })) }).mockResolvedValue({ done: true, value: undefined });
    vi.spyOn(reader, "cancel").mockImplementation(() => pending);
    vi.spyOn(reader, "releaseLock");
    vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
    fetchImplementation.mockResolvedValue(response);
    let settled = false;
    const result = service.send(request()).then(value => { settled = true; return value; });
    await vi.waitFor(() => expect(reader.cancel).toHaveBeenCalledOnce()); expect(settled).toBe(false);
    expect(reader.releaseLock).not.toHaveBeenCalled(); resolve();
    expect(await result).toMatchObject({ state: "sent", providerMessageId: "<synthetic-message@agentmail.to>" });
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  test("maps reader release failure to sanitized uncertainty without a second dispatch", async () => {
    const { service, fetchImplementation } = setup();
    const response = new Response(JSON.stringify({ message_id: "id", thread_id: "thread" }), { status: 200 });
    const reader = response.body!.getReader();
    vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
    const release = vi.spyOn(reader, "releaseLock").mockImplementation(() => { throw new Error(`private ${config.apiKey}`); });
    fetchImplementation.mockResolvedValue(response);
    const result = await service.send(request());
    expect(result).toMatchObject({ state: "failed", failureCode: "outcome_unknown", retryable: false });
    expect(JSON.stringify(result)).not.toContain(config.apiKey); release.mockRestore(); reader.releaseLock();
    expect(await service.send(request())).toMatchObject({ failureCode: "outcome_unknown" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  test.each(["reject", "timeout"])("keeps valid provider acceptance uncertain when cleanup fails: %s", async kind => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { service, fetchImplementation } = setup();
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }), { status: 200 });
    const reader = response.body!.getReader();
    vi.spyOn(reader, "read").mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(JSON.stringify({
      message_id: "<synthetic-message@agentmail.to>", thread_id: "synthetic-thread",
    })) }).mockResolvedValue({ done: true, value: undefined });
    vi.spyOn(reader, "cancel").mockImplementation(() => kind === "reject"
      ? Promise.reject(new Error(`private ${config.apiKey}`)) : new Promise<void>(() => undefined));
    vi.spyOn(reader, "releaseLock");
    vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
    fetchImplementation.mockResolvedValue(response);
    const result = service.send(request());
    await vi.advanceTimersByTimeAsync(kind === "timeout" ? 2_000 : 0);
    const receipt = await result;
    expect(receipt).toMatchObject({ state: "failed", providerMessageId: null, failureCode: "outcome_unknown", retryable: false });
    expect(JSON.stringify(receipt)).not.toContain(config.apiKey); expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(reader.cancel).toHaveBeenCalledOnce(); expect(fetchImplementation).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  test("allows the worker to record uncertainty after cancellation times out without retry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { service, fetchImplementation, body } = cleanupSetup(200, () => new Promise(() => undefined));
    const recordResult = vi.fn().mockResolvedValue(true);
    const result = runRfpNotificationWorker(claim.notificationId, { enabled: true,
      claim: async () => claim, canDispatch: async () => true, createEmailService: () => service, recordResult,
    });
    await vi.advanceTimersByTimeAsync(0); expect(recordResult).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toEqual({ outcome: "needs_attention" });
    expect(recordResult).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "needs_attention", failureCode: "outcome_unknown" });
    expect(body.locked).toBe(false); expect(fetchImplementation).toHaveBeenCalledOnce();
  });
});
