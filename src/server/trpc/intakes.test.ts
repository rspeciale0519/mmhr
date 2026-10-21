import { beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const intakeId = "44444444-4444-4444-8444-444444444444";
const getClaims = vi.fn();
const rpc = vi.fn();
const authorization = { data: [{ identity_id: identityId, authorized_organization_id: organizationId, assurance: "aal1" }], error: null };
const detail = { intakeId, organizationId, status: "draft", revision: 1,
  createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", submittedAt: null, data: {} };
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "GET", origin: null }, ...overrides }).intakes;
}
beforeEach(() => {
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  rpc.mockReset().mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : {
    data: name === "mmhr_get_intake" ? detail : [], error: null,
  });
});
test("lists authorized records at AAL1 through a read-only GET", async () => {
  await expect(caller().list({ organizationId })).resolves.toEqual({ intakes: [], nextCursor: null });
  expect(rpc).toHaveBeenCalledWith("mmhr_get_intakes_page", { requested_organization_id: organizationId, after_id: null, page_size: 25 });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize")).toHaveLength(2);
});
test("loads only the requested organization and intake", async () => {
  await expect(caller().get({ organizationId, intakeId })).resolves.toEqual(detail);
  expect(rpc).toHaveBeenCalledWith("mmhr_get_intake", { requested_organization_id: organizationId, requested_intake_id: intakeId });
});

test("reads active requirements with a separate live workspace permission recheck", async () => {
  await expect(caller().requirements({ organizationId, intakeId })).resolves.toEqual({ requirements: [], nextCursor: null });
  expect(rpc).toHaveBeenCalledWith("mmhr_get_intake_requirements_page", {
    requested_organization_id: organizationId, requested_intake_id: intakeId, after_id: null, page_size: 25,
  });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize")).toHaveLength(2);
});

test("rejects requirement input with an actor, archive filter or invalid cursor", async () => {
  for (const extra of [{ actorIdentityId: identityId }, { status: "archived" }, { afterId: "bad" }]) {
    await expect(caller().requirements({ organizationId, intakeId, ...extra } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  expect(rpc).not.toHaveBeenCalled();
});

test("denies anonymous requirement reads and later permission loss", async () => {
  await expect(caller({ user: null }).requirements({ organizationId, intakeId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  rpc.mockResolvedValueOnce(authorization).mockResolvedValueOnce({ data: [], error: null });
  await expect(caller().requirements({ organizationId, intakeId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});

test("redacts requirement SQL validation and permission failures", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: null, error: { code: "42501", message: "private scope detail" } });
  await expect(caller().requirements({ organizationId, intakeId })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Requirements not available" });
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: null, error: { code: "22023", message: "private stored answer" } });
  await expect(caller().requirements({ organizationId, intakeId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Requirements could not be loaded" });
});
test.each([
  () => caller().list({ organizationId, actorIdentityId: identityId } as never),
  () => caller().list({ organizationId, pageSize: 51 }),
  () => caller().get({ organizationId, intakeId: "bad" }),
  () => caller().get({ organizationId, intakeId, status: "submitted" } as never),
])("rejects invalid or authority-bearing input before permission lookup %#", async (operation) => {
  await expect(operation()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test("denies anonymous callers", async () => {
  await expect(caller({ user: null }).list({ organizationId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(rpc).not.toHaveBeenCalled();
});
test("denies cross-organization authorization responses", async () => {
  rpc.mockResolvedValue({ data: [{ ...authorization.data[0], authorized_organization_id: subject }], error: null });
  await expect(caller().get({ organizationId, intakeId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("honors permission loss during the adapter recheck", async () => {
  rpc.mockResolvedValueOnce(authorization).mockResolvedValueOnce({ data: [], error: null });
  await expect(caller().list({ organizationId })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Intake not available" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("hides database rejection and transport details", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: null, error: { message: "private details" } });
  await expect(caller().get({ organizationId, intakeId })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Intake not available" });
  rpc.mockImplementation(async (name) => { if (name === "mmhr_authorize") return authorization; throw new Error("private details"); });
  await expect(caller().list({ organizationId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Intakes could not be loaded" });
});
test("rejects an intake response from another organization", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: { ...detail, organizationId: subject }, error: null });
  await expect(caller().get({ organizationId, intakeId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
});
