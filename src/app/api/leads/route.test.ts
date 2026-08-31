import { beforeEach, describe, expect, test, vi } from "vitest";

const { createLead } = vi.hoisted(() => ({ createLead: vi.fn() }));
vi.mock("@/server/commands/lead-create", async () => {
  const actual = await vi.importActual<typeof import("@/server/commands/lead-create")>("@/server/commands/lead-create");
  return { ...actual, createLead };
});

import { LeadCreateError } from "@/server/commands/lead-create";
import { POST } from "./route";

const payload = {
  fullName: "Alex Example",
  company: "Example Co",
  workEmail: "alex@example.com",
  directCompanyPhone: "+12125550100",
  source: "website",
  consentAt: "2026-08-30T12:00:00.000Z",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
};

function request(
  body: unknown,
  headers: Record<string, string | undefined> = { origin: "http://localhost:3000" },
) {
  const requestHeaders = new Headers({ "content-type": "application/json" });
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) requestHeaders.set(key, value);
  }
  return new Request("http://localhost:3000/api/leads", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

describe("public lead route boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    createLead.mockReset();
    createLead.mockResolvedValue({
      leadId: "11111111-1111-4111-8111-111111111111",
      status: "new",
      ownerIdentityId: null,
      outcomeCode: "created",
      correlationId: "22222222-2222-4222-8222-222222222222",
    });
  });

  test.each([
    {},
    { origin: "https://evil.example" },
    { origin: "http://localhost:3000/path" },
  ])("rejects request without exact trusted origin", async (headers) => {
    const response = await POST(request(payload, headers));
    expect(response.status).toBe(403);
    expect(createLead).not.toHaveBeenCalled();
  });

  test("returns a redacted acceptance response", async () => {
    const response = await POST(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(createLead).toHaveBeenCalledOnce();
  });

  test("does not expose the lead identifier or personal data on conflict", async () => {
    createLead.mockResolvedValue({
      leadId: null,
      status: null,
      ownerIdentityId: null,
      outcomeCode: "idempotency_conflict",
      correlationId: "22222222-2222-4222-8222-222222222222",
    });
    const response = await POST(request(payload));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ accepted: false, error: "request_not_accepted" });
  });

  test("maps invalid input and database failures to safe errors", async () => {
    createLead.mockRejectedValueOnce(new LeadCreateError("INVALID_INPUT"));
    expect((await POST(request(payload))).status).toBe(400);
    createLead.mockRejectedValueOnce(new Error("private detail"));
    const response = await POST(request(payload));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
