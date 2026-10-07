import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminHome from "./page";
import { requirePagePermission } from "@/server/auth/page-guards";
import { staffAuditNavigation } from "@/server/audit/staff-audit-navigation";
import { auditAuthorization, auditClient, auditId } from "@/server/audit/staff-audit-test-fixture";
vi.mock("@/server/auth/page-guards", () => ({ requirePagePermission: vi.fn() }));
vi.mock("@/server/audit/staff-audit-navigation", () => ({ staffAuditNavigation: vi.fn() }));
const client = auditClient(() => ({ body: {} })).client;
beforeEach(() => {
  vi.mocked(requirePagePermission).mockReset().mockResolvedValue({ identity: { id: auditId(2) }, authorization: auditAuthorization(client, { kind: "platform" }) });
  vi.mocked(staffAuditNavigation).mockReset().mockResolvedValue(null);
});
test("requires the platform admin permission", async () => {
  const result = await AdminHome();
  expect(requirePagePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  expect(result).toMatchObject({ type: "main", props: { children: expect.arrayContaining([expect.anything()]) } });
});
test("does not show an audit link without current authorized navigation", async () => {
  render(await AdminHome()); expect(screen.queryByRole("link", { name: "Search audit events" })).not.toBeInTheDocument();
});
test("shows the authorized audit link and preserves existing workflow navigation", async () => {
  vi.mocked(staffAuditNavigation).mockResolvedValue("/admin/audit?scope=workspace"); render(await AdminHome());
  expect(screen.getByRole("link", { name: "Search audit events" })).toHaveAttribute("href", "/admin/audit?scope=workspace");
  expect(screen.getByRole("link", { name: "Review customer evaluations and RFPs" })).toHaveAttribute("href", "/admin/evaluations");
});

afterEach(cleanup);
