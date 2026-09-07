import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { recordRfpResponseFailure, rfpResponseFailureSchema } from "./rfp-response-failure";

vi.mock("@/server/auth/authorization", async () => { const actual = await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization"); return { ...actual, requirePermission: vi.fn() }; });
const ids = { failureId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", actorIdentityId: "33333333-3333-4333-8333-333333333333", correlationId: "44444444-4444-4444-8444-444444444444", idempotencyKey: "55555555-5555-4555-8555-555555555555" };
const base = { ...ids, failureCode: "parse_failed", failureDetail: "Attachment could not be parsed." };
const rpc = vi.fn(); const context = { supabase: { rpc } as never, identityId: ids.actorIdentityId, scope: { kind: "organization", organizationId: ids.organizationId }, assurance: "aal2", correlationId: ids.correlationId } as const;
describe("RFP response failure command", () => { beforeEach(() => { rpc.mockReset(); vi.mocked(requirePermission).mockReset().mockResolvedValue(context); }); test("requires bounded failure details", () => { expect(rfpResponseFailureSchema.safeParse(base).success).toBe(true); expect(rfpResponseFailureSchema.safeParse({ ...base, failureCode: "Bad Code" }).success).toBe(false); }); test("rejects actor mismatch before RPC", async () => { await expect(recordRfpResponseFailure({ ...base, actorIdentityId: ids.organizationId })).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled(); }); });
