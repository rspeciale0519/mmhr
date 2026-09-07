import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import { recordWorkItem, workItemCommandSchema } from "./work-item";

vi.mock("@/server/auth/authorization", () => ({
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor() {
      super("Request is not authorized");
    }
  },
}));

const id = (value: number) => `abcdefab-2222-4222-8222-${value.toString(16).padStart(12, "0")}`;
const organizationId = id(1);
const actorIdentityId = id(2);
const correlationId = id(3);
const idempotencyKey = id(4);
const taskId = id(5);
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const options = { supabase, correlationId };
const context: AuthorizationContext = {
  supabase,
  correlationId,
  identityId: actorIdentityId,
  scope: { kind: "organization", organizationId },
  assurance: "aal2",
};
const createInput = {
  organizationId,
  actorIdentityId,
  correlationId,
  idempotencyKey,
  taskId,
  action: "create" as const,
  queue: "follow_ups" as const,
  assignedRole: "operations" as const,
  status: "open" as const,
  priority: "high" as const,
  escalated: false,
  createdAt: "2026-09-03T00:00:00Z",
};
const result = {
  taskId,
  organizationId,
  status: "open",
  outcomeCode: "recorded" as const,
  correlationId,
};

describe("work item command", () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockReset().mockResolvedValue({ data: result, error: null });
  });

  test("accepts an operational task", () => {
    expect(workItemCommandSchema.parse(createInput).action).toBe("create");
  });

  test("requires an expected status for updates", () => {
    expect(workItemCommandSchema.safeParse({
      ...createInput,
      action: "update",
      status: "completed",
    }).success).toBe(false);
  });

  test("uses exact organization scope and the authorized client", async () => {
    await expect(recordWorkItem(createInput, options)).resolves.toEqual(result);
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "workspace.access",
      { kind: "organization", organizationId },
      options,
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_record_work_item", {
      payload: createInput,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    });
  });

  test("rejects an actor or scope mismatch before the RPC", async () => {
    vi.mocked(requirePermission).mockResolvedValue({
      ...context,
      identityId: id(9),
    });
    await expect(recordWorkItem(createInput, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();

    vi.mocked(requirePermission).mockResolvedValue({
      ...context,
      scope: { kind: "organization", organizationId: id(10) },
    });
    await expect(recordWorkItem(createInput, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects malformed responses without exposing returned data", async () => {
    rpc.mockResolvedValue({
      data: { ...result, organizationId: id(10), privateDetail: "secret" },
      error: null,
    });
    const response = recordWorkItem(createInput, options);
    await expect(response).rejects.toThrow("Invalid work item result");
    await expect(response).rejects.not.toHaveProperty("cause");
  });
});
