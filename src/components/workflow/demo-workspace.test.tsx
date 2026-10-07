import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// These views belong to Launch Candidate B (owner decision D2).
beforeEach(() => { vi.stubEnv("MMHR_LAUNCH_CANDIDATE", "B"); });
import { DemoWorkspace } from "./demo-workspace";
import DemoError from "./demo-error";
import DemoLoading from "./demo-loading";
import { requirePagePermission, requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getDemoCoordination } from "@/server/commands/demo-coordination";

vi.mock("@/server/auth/page-guards", () => ({ requirePagePermission: vi.fn(), requireSelectedOrganizationPermission: vi.fn() }));
vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));
vi.mock("@/server/commands/demo-coordination", () => ({ getDemoCoordination: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("FORBIDDEN"); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./demo-plan-form", () => ({ DemoPlanForm: () => <p>Staff planning control</p> }));
vi.mock("./demo-history", () => ({ DemoHistory: ({ view }: { view: string }) => <p>{view} history</p> }));
vi.mock("./demo-controls", () => ({ DemoAvailabilityForm: () => <p>External availability control</p>, DemoConfirmationForm: () => <p>Staff confirmation control</p>,
  DemoOutcomeForm: () => <p>Staff outcome control</p>, DemoStateForm: () => <p>Staff status control</p> }));
const id = "11111111-1111-4111-8111-111111111111", supabase = {} as never;
const scope = { authorization: { scope: { kind: "organization", organizationId: id }, supabase } };
const row = { demoId: id, revision: 3, status: "requested", vendorName: "Synthetic vendor", customerName: "Synthetic customer", coordination: {
  plan: { round: 1, audience: "Payroll team", purpose: "Verify export", format: "remote", requiredTopics: ["Payroll exports"],
    participants: [{ name: "Synthetic attendee", role: "Payroll lead", organization: "customer" }] },
  customerAvailability: null, vendorAvailability: null, schedule: null, outcome: null, reason: null }, updatedAt: "2026-09-30T20:00:00Z" };
beforeEach(() => {
  vi.mocked(requirePagePermission).mockReset().mockResolvedValue({} as never);
  vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue(scope as never);
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue(scope as never);
  vi.mocked(getDemoCoordination).mockReset().mockResolvedValue({ organizationId: id, correlationId: id, choices: [], nextCursor: null, nextChoiceCursor: null, items: [row] } as never);
});
afterEach(cleanup);
test.each(["customer", "vendor"] as const)("%s uses its portal guard and has only external controls", async (view) => {
  render(await DemoWorkspace({ view, searchParams: Promise.resolve({}) }));
  expect(requirePortalPageAccess).toHaveBeenCalledWith(view);
  expect(requirePagePermission).not.toHaveBeenCalled();
  expect(getDemoCoordination).toHaveBeenCalledWith(expect.objectContaining({ view, organizationId: id }), { supabase });
  expect(screen.getByText("External availability control")).toBeInTheDocument();
  expect(screen.queryByText("Staff confirmation control")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View change history" })).toHaveAttribute("href", `/${view}/demos?demo=${id}`);
});
test("staff needs platform access and selected customer authority", async () => {
  render(await DemoWorkspace({ view: "staff", searchParams: Promise.resolve({}) }));
  expect(requirePagePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("rfp.approve");
  expect(screen.getByText("Staff planning control")).toBeInTheDocument(); expect(screen.getByText("Staff confirmation control")).toBeInTheDocument();
  expect(screen.queryByText("External availability control")).not.toBeInTheDocument();
});
test("denies lost portal access and malformed cursors before reading records", async () => {
  vi.mocked(requirePortalPageAccess).mockRejectedValueOnce(new Error("NOT_FOUND"));
  await expect(DemoWorkspace({ view: "customer", searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  for (const params of [{ after: "not-a-uuid" }, { choiceCandidate: id }, { afterRevision: "1" }]) {
    await expect(DemoWorkspace({ view: "customer", searchParams: Promise.resolve(params) })).rejects.toThrow("NOT_FOUND");
  }
  expect(getDemoCoordination).not.toHaveBeenCalled();
});
test("routes history through the same portal guard without reading unrelated plans", async () => {
  render(await DemoWorkspace({ view: "vendor", searchParams: Promise.resolve({ demo: id, afterRevision: "25" }) }));
  expect(screen.getByText("vendor history")).toBeInTheDocument(); expect(getDemoCoordination).not.toHaveBeenCalled();
  expect(requirePortalPageAccess).toHaveBeenCalledWith("vendor");
});
test("shows an empty workspace and generic recoverable loading and errors", async () => {
  vi.mocked(getDemoCoordination).mockResolvedValueOnce({ organizationId: id, correlationId: id, choices: [], nextCursor: null, nextChoiceCursor: null, items: [], checkedAt: "2026-09-30T20:00:00Z" });
  const workspace = render(await DemoWorkspace({ view: "customer", searchParams: Promise.resolve({}) }));
  expect(screen.getByText("No demo plans have been recorded in this workspace.")).toBeInTheDocument(); workspace.unmount();
  const reset = vi.fn(); render(<><DemoLoading /><DemoError reset={reset} /></>);
  fireEvent.click(screen.getByRole("button")); expect(reset).toHaveBeenCalledTimes(1);
});
