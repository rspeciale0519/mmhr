import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { getIntake, getIntakesPage, IntakeReadError } from "@/server/commands/intake-read";
import { getIntakeRequirementsPage, RequirementReadError } from "@/server/commands/requirement-read";
import CustomerHome from "./page";

vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));
vi.mock("@/server/auth/authorization", async (original) => ({
  ...await original<typeof import("@/server/auth/authorization")>(), authorizePermission: vi.fn(),
}));
vi.mock("./intake-form", () => ({
  CustomerIntakeForm: ({ organizationId, intake }: { organizationId: string; intake?: { intakeId: string; revision: number } }) =>
    <form aria-label="Customer intake form" data-organization={organizationId}
      data-intake={intake?.intakeId} data-revision={intake?.revision} />,
}));
vi.mock("./requirement-form", () => ({ CustomerRequirementForm: () => <form aria-label="Customer requirement form" /> }));
vi.mock("./intake-submit", () => ({
  CustomerIntakeSubmit: ({ organizationId, intakeId, expectedRevision }: {
    organizationId: string; intakeId: string; expectedRevision: number;
  }) => <div data-testid="customer-intake-submit" data-organization={organizationId}
    data-intake={intakeId} data-revision={expectedRevision} />,
}));
vi.mock("@/server/commands/intake-read", async (original) => ({
  ...await original<typeof import("@/server/commands/intake-read")>(),
  getIntake: vi.fn(), getIntakesPage: vi.fn(),
}));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));
vi.mock("@/server/commands/requirement-read", async (original) => ({
  ...await original<typeof import("@/server/commands/requirement-read")>(),
  getIntakeRequirementsPage: vi.fn(),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const supabase = { rpc: vi.fn() };
const summary = {
  organizationId, intakeId, status: "in_progress" as const, revision: 2,
  createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T12:00:00Z",
};
type Query = Record<string, string | string[] | undefined>;
const load = (query: Query = {}) => CustomerHome({ searchParams: Promise.resolve(query) });

beforeEach(() => {
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue({
    identity: { id: otherId },
    authorization: { supabase, scope: { kind: "organization", organizationId }, identityId: intakeId, assurance: "aal1" },
  } as never);
  vi.mocked(getIntakesPage).mockReset().mockResolvedValue({ intakes: [summary], nextCursor: null });
  vi.mocked(getIntake).mockReset().mockResolvedValue({ ...summary, submittedAt: null, data: {} });
  vi.mocked(getIntakeRequirementsPage).mockReset().mockResolvedValue({ requirements: [], nextCursor: null });
});
afterEach(cleanup);
afterEach(() => {
  if (!vi.mocked(getIntake).mock.calls.length) expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
});

test("uses the selected organization and its request client, never URL authority", async () => {
  render(await load({ organizationId: otherId, identityId: otherId, pageSize: "500" }));
  expect(requirePortalPageAccess).toHaveBeenCalledExactlyOnceWith("customer");
  expect(getIntakesPage).toHaveBeenCalledExactlyOnceWith(
    { organizationId, afterId: undefined }, { supabase },
  );
  expect(getIntake).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Your software needs" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: `View intake ${intakeId}` })).toHaveAttribute("href", `/customer?intake=${intakeId}`);
  expect(screen.getByText("In progress")).toBeInTheDocument();
  expect(screen.queryByText(organizationId, { exact: false })).not.toBeInTheDocument();
  expect(screen.queryByText(otherId, { exact: false })).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("propagates the portal denial before reading records or parsing a bad link", async () => {
  vi.mocked(requirePortalPageAccess).mockRejectedValue(new Error("Sign in required"));
  await expect(load({ intake: "bad" })).rejects.toThrow("Sign in required");
  expect(getIntake).not.toHaveBeenCalled();
  expect(getIntakesPage).not.toHaveBeenCalled();
});

test("rejects a non-organization authorization scope before any read", async () => {
  vi.mocked(requirePortalPageAccess).mockResolvedValue({ authorization: { scope: { kind: "platform" } } } as never);
  await expect(load()).rejects.toThrow("Forbidden");
  expect(getIntakesPage).not.toHaveBeenCalled();
  expect(getIntake).not.toHaveBeenCalled();
});

test.each<Query>([
  { intake: "bad" }, { intake: "" }, { after: "bad" }, { after: "" },
  { intake: [intakeId] }, { after: [intakeId, otherId] },
  { intake: intakeId, after: otherId }, { intake: "javascript:alert(1)" },
  { requirementsAfter: otherId }, { after: intakeId, requirementsAfter: otherId },
  { intake: intakeId, requirementsAfter: "bad" }, { intake: intakeId, requirementsAfter: "" },
  { intake: intakeId, requirementsAfter: [otherId] },
  { intake: intakeId, after: otherId, requirementsAfter: otherId },
  { new: "0" }, { new: ["1"] }, { new: "1", intake: intakeId }, { new: "1", after: otherId },
  { new: "1", requirementsAfter: otherId }, { new: "1", edit: "1" },
  { edit: "1" }, { edit: "0", intake: intakeId }, { edit: ["1"], intake: intakeId },
  { edit: "1", intake: intakeId, after: otherId }, { edit: "1", intake: intakeId, requirementsAfter: otherId },
])("rejects malformed or ambiguous intake navigation: %j", async (query) => {
  render(await load(query));
  expect(screen.getByRole("alert")).toHaveTextContent("link is not valid");
  expect(screen.getByRole("link", { name: "Return to saved intakes" })).toHaveAttribute("href", "/customer");
  expect(getIntakesPage).not.toHaveBeenCalled();
  expect(getIntake).not.toHaveBeenCalled();
});

test("uses a bounded cursor and makes links without carrying caller query fields", async () => {
  vi.mocked(getIntakesPage).mockResolvedValue({ intakes: [summary], nextCursor: intakeId });
  render(await load({ after: otherId, organizationId: otherId }));
  expect(getIntakesPage).toHaveBeenCalledWith({ organizationId, afterId: otherId }, { supabase });
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", `/customer?after=${intakeId}`);
  expect(screen.getByRole("link", { name: "Back to first page" })).toHaveAttribute("href", "/customer");
});

test.each([false, true])("distinguishes an empty workspace from an empty cursor page: %s", async (hasCursor) => {
  vi.mocked(getIntakesPage).mockResolvedValue({ intakes: [], nextCursor: null });
  render(await load(hasCursor ? { after: intakeId } : {}));
  expect(screen.getByRole("status")).toHaveTextContent(hasCursor ? "no more saved intakes" : "no saved intakes in this workspace");
  expect(screen.queryByRole("link", { name: "Next page" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Back to first page" }) !== null).toBe(hasCursor);
});

test("reads one scoped intake and renders all seven saved sections", async () => {
  vi.mocked(getIntake).mockResolvedValue({ ...summary, submittedAt: "2026-09-08T13:00:00Z", data: {
    companyContext: { Employees: 0, Remote: false, Public: true, Notes: "" },
    currentSystems: ["  System A  ", "  System A  "], complianceNeeds: ["Requirement A"],
    budget: { Limit: 0 }, timeline: { Target: "Next year" }, stakeholders: ["Operations"], decisionProcess: { Approval: "Team review" },
  } });
  render(await load({ intake: intakeId, organizationId: otherId }));
  expect(getIntake).toHaveBeenCalledExactlyOnceWith({ organizationId, intakeId }, { supabase });
  expect(getIntakesPage).not.toHaveBeenCalled();
  expect(screen.getAllByRole("region")).toHaveLength(8);
  expect(getIntakeRequirementsPage).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, afterId: undefined }, { supabase },
  );
  const company = within(screen.getByRole("region", { name: "Company context" }));
  expect(company.getByText("0")).toBeInTheDocument();
  expect(company.getByText("No")).toBeInTheDocument();
  expect(company.getByText("Yes")).toBeInTheDocument();
  expect(company.getByText("Not provided")).toBeInTheDocument();
  const systems = within(screen.getByRole("region", { name: "Current systems" })).getAllByRole("listitem");
  expect(systems).toHaveLength(2);
  expect(systems[0].textContent).toBe("  System A  ");
  const submittedTime = screen.getByText("Sep 8, 2026, 1:00 PM UTC");
  expect(submittedTime).toHaveAttribute("datetime", "2026-09-08T13:00:00Z");
  expect(submittedTime.parentElement).toHaveTextContent("Submitted Sep 8, 2026, 1:00 PM UTC");
  expect(screen.getByText(/Provider recommendations are not available/)).toBeInTheDocument();
  expect(screen.queryByText(organizationId, { exact: false })).not.toBeInTheDocument();
  expect(screen.queryByText(otherId, { exact: false })).not.toBeInTheDocument();
});

test("normalizes uppercase query UUIDs without changing the selected scope", async () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  vi.mocked(getIntake).mockResolvedValue({ ...summary, intakeId: id, submittedAt: null, data: {} });
  render(await load({ intake: id.toUpperCase() }));
  expect(getIntake).toHaveBeenCalledWith({ organizationId, intakeId: id }, { supabase });
});

test("shows omitted and empty saved sections without inventing answers", async () => {
  vi.mocked(getIntake).mockResolvedValue({ ...summary, submittedAt: null, data: { companyContext: {}, currentSystems: [] } });
  render(await load({ intake: intakeId }));
  expect(screen.getAllByText("Not provided")).toHaveLength(7);
});

test("renders untrusted values as text, not markup or external links", async () => {
  vi.mocked(getIntake).mockResolvedValue({ ...summary, submittedAt: null, data: {
    companyContext: { '<img src=x onerror="alert(1)">': "<script>alert(1)</script>" }, currentSystems: ["javascript:alert(1)"],
  } });
  const { container } = render(await load({ intake: intakeId }));
  expect(container.querySelector("script,img")).toBeNull();
  expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
});

test.each(["REJECTED", "UNAVAILABLE", "INVALID_RESPONSE"] as const)("redacts list failure %s without showing an empty workspace", async (code) => {
  vi.mocked(getIntakesPage).mockRejectedValue(new IntakeReadError(code));
  render(await load());
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(code)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: `View intake ${intakeId}` })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Saved intakes" })).not.toBeInTheDocument();
});

test("does not show list records after workspace read permission is revoked", async () => {
  vi.mocked(getIntakesPage).mockRejectedValue(new AuthorizationError());
  render(await load());
  expect(screen.getByRole("alert")).toHaveTextContent("your access may have changed");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Saved intakes" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: `View intake ${intakeId}` })).not.toBeInTheDocument();
});

test("treats revoked workspace read access as unavailable, not successful portal access", async () => {
  vi.mocked(getIntake).mockRejectedValue(new AuthorizationError());
  render(await load({ intake: otherId }));
  expect(screen.getByRole("alert")).toHaveTextContent("your access may have changed");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

test("does not hide unexpected application defects", async () => {
  vi.mocked(getIntake).mockRejectedValue(new Error("Unexpected defect"));
  await expect(load({ intake: intakeId })).rejects.toThrow("Unexpected defect");
});

test("reads requirements with a normalized cursor and only the selected workspace authority", async () => {
  const cursor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  render(await load({ intake: intakeId, requirementsAfter: cursor.toUpperCase(), organizationId: otherId, pageSize: "500" }));
  expect(getIntakeRequirementsPage).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, afterId: cursor }, { supabase },
  );
  expect(getIntakesPage).not.toHaveBeenCalled();
  expect(vi.mocked(getIntake).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(getIntakeRequirementsPage).mock.invocationCallOrder[0]!,
  );
});

test("connects saved custom answers and pagination to the selected intake detail", async () => {
  vi.mocked(getIntakeRequirementsPage).mockResolvedValue({ requirements: [{
    requirementId: otherId, organizationId, intakeId, stableKey: "payroll",
    label: "Payroll integration", importance: "must", weight: 75, response: "Keep the current payroll system",
    status: "active", requirementType: "custom", revision: 1,
    createdAt: summary.createdAt, updatedAt: summary.updatedAt,
  }], nextCursor: otherId });
  render(await load({ intake: intakeId, requirementsAfter: intakeId, organizationId: otherId, identityId: otherId }));
  const requirements = within(screen.getByRole("region", { name: "Active requirements" }));
  expect(requirements.getByRole("heading", { name: "Payroll integration" })).toBeInTheDocument();
  expect(requirements.getByText("Custom request")).toBeInTheDocument();
  expect(requirements.getByText("Keep the current payroll system")).toBeInTheDocument();
  expect(requirements.getByRole("link", { name: "Next requirements page" })).toHaveAttribute(
    "href", `/customer?intake=${intakeId}&requirementsAfter=${otherId}`,
  );
  expect(requirements.getByRole("link", { name: "Back to first requirements page" })).toHaveAttribute(
    "href", `/customer?intake=${intakeId}`,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test.each(["REJECTED", "UNAVAILABLE", "INVALID_RESPONSE"] as const)("hides all details after requirement failure %s", async (code) => {
  vi.mocked(getIntakeRequirementsPage).mockRejectedValue(new RequirementReadError(code));
  render(await load({ intake: intakeId }));
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(screen.queryByText(code)).not.toBeInTheDocument();
});

test("hides earlier intake data when the requirement permission check denies access", async () => {
  vi.mocked(getIntakeRequirementsPage).mockRejectedValue(new AuthorizationError());
  render(await load({ intake: intakeId }));
  expect(screen.getByRole("alert")).toHaveTextContent("your access may have changed");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

test("does not read requirements when the parent intake is unavailable", async () => {
  vi.mocked(getIntake).mockRejectedValue(new IntakeReadError("REJECTED"));
  render(await load({ intake: intakeId }));
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
});

test("does not hide unexpected requirement defects", async () => {
  vi.mocked(getIntakeRequirementsPage).mockRejectedValue(new Error("Unexpected requirement defect"));
  await expect(load({ intake: intakeId })).rejects.toThrow("Unexpected requirement defect");
});

function allowDraftSave() {
  vi.mocked(authorizePermission).mockResolvedValue({
    supabase, scope: { kind: "organization", organizationId }, identityId: intakeId, assurance: "aal1",
  } as never);
}

test("shows the create link only with the scoped draft action", async () => {
  allowDraftSave();
  render(await load());
  expect(authorizePermission).toHaveBeenCalledExactlyOnceWith(
    "intake.draft.save", { kind: "organization", organizationId }, { supabase },
  );
  expect(screen.getByRole("link", { name: "Start an intake" })).toHaveAttribute("href", "/customer?new=1");
});

test("creates only in the selected authorized workspace without reading unrelated records", async () => {
  allowDraftSave();
  render(await load({ new: "1", organizationId: otherId, identityId: otherId }));
  expect(screen.getByRole("form")).toHaveAttribute("data-organization", organizationId);
  expect(screen.getByRole("form")).not.toHaveAttribute("data-intake");
  expect(getIntake).not.toHaveBeenCalled();
  expect(getIntakesPage).not.toHaveBeenCalled();
});

test.each([{}, { new: "1" }, { intake: intakeId, edit: "1" }] as Query[])("does not expose changes without action permission: %j", async (query) => {
  render(await load(query));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Start an intake" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Edit intake answers" })).not.toBeInTheDocument();
  if (query.new || query.edit) {
    expect(screen.getByRole("alert")).toHaveTextContent("form is not available");
    expect(getIntake).not.toHaveBeenCalled();
    expect(getIntakesPage).not.toHaveBeenCalled();
  }
});

test.each([
  { identityId: otherId, scope: { kind: "organization", organizationId } },
  { identityId: intakeId, scope: { kind: "organization", organizationId: otherId } },
  { identityId: intakeId, scope: { kind: "platform" } },
])("rejects mismatched draft authorization: %j", async (context) => {
  vi.mocked(authorizePermission).mockResolvedValue({ ...context, supabase, assurance: "aal1" } as never);
  render(await load({ new: "1" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("form is not available");
});

test.each(["draft", "in_progress"] as const)("loads current scoped answers for editable status %s", async (status) => {
  allowDraftSave();
  vi.mocked(getIntake).mockResolvedValue({ ...summary, status, data: {}, submittedAt: null });
  render(await load({ intake: intakeId, edit: "1" }));
  expect(getIntake).toHaveBeenCalledExactlyOnceWith({ organizationId, intakeId }, { supabase });
  expect(screen.getByRole("form")).toHaveAttribute("data-intake", intakeId);
  expect(screen.getByRole("form")).toHaveAttribute("data-revision", "2");
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
  expect(getIntakesPage).not.toHaveBeenCalled();
});

test.each(["submitted", "under_review", "completed", "archived"] as const)("does not edit locked status %s", async (status) => {
  allowDraftSave();
  vi.mocked(getIntake).mockResolvedValue({ ...summary, status, data: {}, submittedAt: summary.updatedAt });
  render(await load({ intake: intakeId, edit: "1" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("form is not available");
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
});

test("adds a fixed edit link to an editable detail", async () => {
  allowDraftSave();
  render(await load({ intake: intakeId, organizationId: otherId }));
  expect(screen.getByRole("link", { name: "Edit intake answers" })).toHaveAttribute("href", `/customer?intake=${intakeId}&edit=1`);
});

test("does not mount an edit form after the authorized read fails", async () => {
  allowDraftSave();
  vi.mocked(getIntake).mockRejectedValue(new AuthorizationError());
  render(await load({ intake: intakeId, edit: "1" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
});
