import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { approveVendorCatalogProfile, getVendorCatalogProfile } from "./vendor-catalog";
vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const organizationId=randomUUID(), profileId=randomUUID(), identityId=randomUUID(), idempotencyKey=randomUUID();
const rpc=vi.fn(), supabase={rpc} as never;
const input={organizationId,profileId,expectedRevision:1,reason:"Reviewed identity",approvalReference:"review:catalog",idempotencyKey};
const profile={organizationId,profileId,revision:2,status:"active",approvedAt:"2026-09-16T01:00:00Z"};
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({error:null,data:{...profile,outcomeCode:"approved",correlationId:idempotencyKey}});
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission,scope) => ({identityId,scope,supabase,assurance:"aal2",correlationId:randomUUID()}));
});
test("uses scoped approval without caller-controlled identities or dates", async () => {
  await expect(approveVendorCatalogProfile(input,{supabase})).resolves.toMatchObject(profile);
  const {idempotencyKey:key,...payload}=input;
  expect(rpc).toHaveBeenCalledWith("mmhr_approve_vendor_catalog_profile",{payload,correlation_id:key,idempotency_key:key});
});
test.each([{approvedAt:profile.approvedAt},{approvedByIdentityId:identityId},{expectedRevision:0},{reason:" "}])("rejects invalid approval input %#", async patch => {
  await expect(approveVendorCatalogProfile({...input,...patch},{supabase})).rejects.toMatchObject({code:"INVALID_INPUT"});
  expect(rpc).not.toHaveBeenCalled();
});
test("denies mismatched staff identity", async () => {
  vi.mocked(requirePermission).mockImplementation(async (_permission,scope) => ({identityId:scope.kind==="platform"?randomUUID():identityId,scope,supabase,assurance:"aal2",correlationId:randomUUID()}));
  await expect(approveVendorCatalogProfile(input,{supabase})).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([{profileId:randomUUID()},{organizationId:randomUUID()},{approvedAt:null},{correlationId:randomUUID()}])("rejects unrelated approval response %#", async patch => {
  rpc.mockResolvedValue({error:null,data:{...profile,outcomeCode:"approved",correlationId:idempotencyKey,...patch}});
  await expect(approveVendorCatalogProfile(input,{supabase})).rejects.toMatchObject({code:"INVALID_RESPONSE"});
});
test("reads only the requested catalog profile", async () => {
  rpc.mockResolvedValue({error:null,data:profile});
  await expect(getVendorCatalogProfile({organizationId,profileId},{supabase})).resolves.toEqual(profile);
  rpc.mockResolvedValue({error:null,data:{...profile,profileId:randomUUID()}});
  await expect(getVendorCatalogProfile({organizationId,profileId},{supabase})).rejects.toMatchObject({code:"INVALID_RESPONSE"});
});
test("does not expose database errors", async () => {
  rpc.mockResolvedValue({error:{message:"private data"},data:null});
  await expect(approveVendorCatalogProfile(input,{supabase})).rejects.toMatchObject({code:"UNAVAILABLE"});
});
