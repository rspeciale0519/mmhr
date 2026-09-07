import { describe, expect, test } from "vitest";
import { parseCollaborationRequest } from "./collaboration-contract";

const base = { organizationId: "00000000-0000-4000-8000-000000000001", dealId: "00000000-0000-4000-8000-000000000002", ownerIdentityId: "00000000-0000-4000-8000-000000000003", participantReferences: ["identity:customer"], request: "Review the shortlist" };

describe("evaluation collaboration contract", () => {
  test("supports secure messages and review requests", () => expect(parseCollaborationRequest({ ...base, channel: "secure_message", scheduledAt: null }).organizationId).toBe(base.organizationId));
  test("requires a time for meeting coordination", () => expect(() => parseCollaborationRequest({ ...base, channel: "meeting", scheduledAt: null })).toThrow("Meeting coordination requires a time"));
});
