import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AuditPage from "./page";
import AuditLoading from "./loading";
import AuditError from "./error";
import { requirePagePermission, readSelectedOrganizationId } from "@/server/auth/page-guards";
import { searchStaffAudit } from "@/server/audit/staff-audit-read";
import { AuthorizationError } from "@/server/auth/authorization";
import { auditAuthorization, auditClient, auditId, auditPage } from "@/server/audit/staff-audit-test-fixture";
import type { StaffAuditPage } from "@/lib/staff-audit";
vi.mock("@/server/auth/page-guards", () => ({ requirePagePermission: vi.fn(), readSelectedOrganizationId: vi.fn() }));
vi.mock("@/server/audit/staff-audit-read", () => ({ searchStaffAudit: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("forbidden"); }, notFound: () => { throw new Error("not found"); } }));
vi.mock("@/components/workflow/staff-audit-search", () => ({ StaffAuditSearch: (props: { organizationId: string | null; initialPage: StaffAuditPage }) =>
  <pre data-testid="safe-page">{JSON.stringify(props)}</pre> }));
const client = auditClient(() => ({ body: {} })).client;
beforeEach(() => {
  vi.mocked(requirePagePermission).mockReset().mockResolvedValue({ identity: { id: auditId(2) }, authorization: auditAuthorization(client, { kind: "platform" }) });
  vi.mocked(readSelectedOrganizationId).mockReset().mockResolvedValue(auditId(1));
  vi.mocked(searchStaffAudit).mockReset().mockResolvedValue(auditPage());
});
test("requires staff access and renders only the safe initial platform page", async () => {
  render(await AuditPage({ searchParams: Promise.resolve({}) }));
  expect(requirePagePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  expect(searchStaffAudit).toHaveBeenCalledWith({ organizationId: null }, { supabase: client });
  expect(screen.getByTestId("safe-page")).toHaveTextContent(JSON.stringify({ organizationId: null, initialPage: auditPage() }));
  expect(screen.getAllByRole("link").every(link => !link.getAttribute("href")?.includes("reference"))).toBe(true);
});
test("uses only the selected workspace for organization searches", async () => {
  vi.mocked(searchStaffAudit).mockResolvedValue(auditPage(auditId(1)));
  render(await AuditPage({ searchParams: Promise.resolve({ scope: "workspace" }) }));
  expect(searchStaffAudit).toHaveBeenCalledWith({ organizationId: auditId(1) }, { supabase: client });
});
test("denies workspace mode without a selected workspace", async () => {
  vi.mocked(readSelectedOrganizationId).mockResolvedValue(null);
  await expect(AuditPage({ searchParams: Promise.resolve({ scope: "workspace" }) })).rejects.toThrow("forbidden");
  expect(searchStaffAudit).not.toHaveBeenCalled();
});
test("denies forged search parameters before reading audit data", async () => {
  await expect(AuditPage({ searchParams: Promise.resolve({ scope: "platform", actorReference: "private" }) })).rejects.toThrow("not found");
  expect(searchStaffAudit).not.toHaveBeenCalled();
});
test("does not render events after authorization failure", async () => {
  vi.mocked(searchStaffAudit).mockRejectedValue(new AuthorizationError());
  await expect(AuditPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("forbidden");
});
test("shows a plain loading state", () => {
  render(<AuditLoading/>); expect(screen.getByRole("status")).toHaveTextContent("Loading audit events");
});
test("shows a fixed error message and invokes the installed retry callback", () => {
  const retry = vi.fn(); render(<AuditError retry={retry}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("Check your access");
  fireEvent.click(screen.getByRole("button", { name: "Retry audit read" })); expect(retry).toHaveBeenCalledTimes(1);
});

afterEach(cleanup);
