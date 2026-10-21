import { beforeEach, expect, test, vi } from "vitest";
import { authorizePermission } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { staffAuditNavigation } from "./staff-audit-navigation";
import { auditAuthorization, auditClient, auditId } from "./staff-audit-test-fixture";
vi.mock("@/server/auth/authorization", () => ({ authorizePermission: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: vi.fn() }));
const client = auditClient(() => ({ body: {} })).client;
const staff = auditAuthorization(client, { kind: "platform" });
beforeEach(() => {
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(readSelectedOrganizationId).mockReset().mockResolvedValue(auditId(1));
});
test("hides the link without current audit authority", async () => {
  expect(await staffAuditNavigation(staff)).toBeNull();
});
test("offers platform events only after platform audit authorization", async () => {
  vi.mocked(authorizePermission).mockResolvedValueOnce(staff);
  expect(await staffAuditNavigation(staff)).toBe("/admin/audit?scope=platform");
  expect(readSelectedOrganizationId).not.toHaveBeenCalled();
});
test("offers only selected workspace events when platform audit authority is absent", async () => {
  vi.mocked(authorizePermission).mockResolvedValueOnce(null).mockResolvedValueOnce(auditAuthorization(client,
    { kind: "organization", organizationId: auditId(1) }));
  expect(await staffAuditNavigation(staff)).toBe("/admin/audit?scope=workspace");
});
test("does not offer audit data to a lower-assurance or different actor", async () => {
  expect(await staffAuditNavigation({ ...staff, assurance: "aal1" })).toBeNull();
  vi.mocked(authorizePermission).mockResolvedValue(auditAuthorization(client, { kind: "platform" }, { identityId: auditId(42) }));
  expect(await staffAuditNavigation(staff)).toBeNull();
});
