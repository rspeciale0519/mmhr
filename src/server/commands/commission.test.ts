import {describe,expect,test} from "vitest";import {randomUUID} from "node:crypto";import {commissionSchema} from "./commission";const b={organizationId:randomUUID(),actorIdentityId:randomUUID(),correlationId:randomUUID(),idempotencyKey:randomUUID()};const structure=(changes:Record<string,unknown>={})=>({...b,action:"create_structure",structureId:randomUUID(),vendorOrganizationId:randomUUID(),effectiveFrom:"2026-09-01T00:00:00.000Z",effectiveTo:null,calculationType:"contract_value_rate",rateBasisPoints:500,flatAmountMinorUnits:null,currency:"USD",sourceAgreementId:randomUUID(),revision:1,...changes});describe("commission schema",()=>{test("accepts rate structure",()=>expect(commissionSchema.parse(structure()).action).toBe("create_structure"));test("rejects invalid currency",()=>expect(commissionSchema.safeParse(structure({calculationType:"flat_amount",rateBasisPoints:null,flatAmountMinorUnits:100,currency:"usd"})).success).toBe(false));test("rejects an effective end before the start",()=>expect(commissionSchema.safeParse(structure({effectiveTo:"2026-08-31T23:59:59.999Z"})).success).toBe(false));test("accepts an inclusive effective end",()=>expect(commissionSchema.parse(structure({effectiveTo:"2026-09-01T00:00:00.000Z"}))).toMatchObject({action:"create_structure",effectiveTo:"2026-09-01T00:00:00.000Z"}));});

import { beforeEach, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { recordCommission } from "./commission";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const rpc = vi.fn(), supabase = { rpc } as never;
const event = (changes: Record<string, unknown> = {}) => ({ ...b, action: "create_event", eventId: randomUUID(),
  contractId: randomUUID(), dealId: randomUUID(), vendorOrganizationId: randomUUID(), structureId: randomUUID(),
  eventIdempotencyKey: randomUUID(), signedAt: "2026-09-01T00:00:00.000Z", currency: "USD",
  contractValueMinorUnits: 10000, commissionAmountMinorUnits: 500, calculationRevision: 1, ...changes });
beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requirePermission).mockReset().mockResolvedValue({ supabase, identityId: b.actorIdentityId,
    scope: { kind: "organization", organizationId: b.organizationId }, assurance: "aal2", correlationId: b.correlationId });
});

test.each([
  { rateBasisPoints: null },
  { flatAmountMinorUnits: 100 },
  { calculationType: "flat_amount", rateBasisPoints: null, flatAmountMinorUnits: null },
  { calculationType: "flat_amount", rateBasisPoints: 500, flatAmountMinorUnits: 100 },
  { vendorOrganizationId: b.organizationId },
])("rejects an inconsistent commission structure before authorization %#", async changes => {
  await expect(recordCommission(structure(changes))).rejects.toThrow("Invalid commission input");
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test("accepts a zero flat fee without rate values", () => {
  expect(commissionSchema.safeParse(structure({ calculationType: "flat_amount", rateBasisPoints: null,
    flatAmountMinorUnits: 0 })).success).toBe(true);
});

test.each(["recorded", "replayed"])("binds the %s creation result to the requested entity and status", async outcomeCode => {
  for (const command of [structure(), event()]) {
    const parsed = commissionSchema.parse(command);
    const entityId = parsed.action === "create_structure" ? parsed.structureId : parsed.eventId;
    const status = parsed.action === "create_structure" ? "active" : "pending_review";
    rpc.mockResolvedValue({ error: null, data: { entityId, organizationId: b.organizationId, correlationId: b.correlationId,
      status, outcomeCode } });
    await expect(recordCommission(command, { supabase })).resolves.toMatchObject({ entityId, status, outcomeCode });
    expect(requirePermission).toHaveBeenLastCalledWith("finance.manage", { kind: "organization", organizationId: b.organizationId },
      { supabase, correlationId: b.correlationId });
  }
});

test.each(["entity", "status", "organization", "correlation"])("rejects altered commission result %s", async field => {
  const command = event();
  const result = { entityId: command.eventId, organizationId: b.organizationId, correlationId: b.correlationId,
    status: "pending_review", outcomeCode: "recorded" };
  rpc.mockResolvedValue({ error: null, data: { ...result, ...({ entity: { entityId: randomUUID() }, status: { status: "paid" },
    organization: { organizationId: randomUUID() }, correlation: { correlationId: randomUUID() } }[field]) } });
  await expect(recordCommission(command)).rejects.toThrow("Invalid commission result");
});

test.each([
  { identityId: randomUUID() },
  { scope: { kind: "organization", organizationId: randomUUID() } },
  { correlationId: randomUUID() },
])("denies an altered authorization binding before the RPC %#", async change => {
  vi.mocked(requirePermission).mockResolvedValue({ supabase, identityId: b.actorIdentityId, assurance: "aal2",
    scope: { kind: "organization", organizationId: b.organizationId }, correlationId: b.correlationId, ...change } as never);
  await expect(recordCommission(event())).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test("keeps provider errors private and preserves authorization denial", async () => {
  rpc.mockResolvedValueOnce({ error: { message: "Private agreement reference", code: "XX000" } });
  await expect(recordCommission(event())).rejects.toThrow("Commission unavailable");
  vi.mocked(requirePermission).mockRejectedValueOnce(new AuthorizationError());
  await expect(recordCommission(event())).rejects.toBeInstanceOf(AuthorizationError);
});
