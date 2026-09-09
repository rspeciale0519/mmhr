import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getIntake, getIntakesPage, IntakeReadError } from "@/server/commands/intake-read";
import CustomerHome from "./page";

vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));
vi.mock("@/server/commands/intake-read", async (original) => ({
  ...await original<typeof import("@/server/commands/intake-read")>(),
  getIntake: vi.fn(), getIntakesPage: vi.fn(),
}));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));

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
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue({
    identity: { id: otherId },
    authorization: { supabase, scope: { kind: "organization", organizationId }, identityId: intakeId, assurance: "aal1" },
  } as never);
  vi.mocked(getIntakesPage).mockReset().mockResolvedValue({ intakes: [summary], nextCursor: null });
  vi.mocked(getIntake).mockReset().mockResolvedValue({ ...summary, submittedAt: null, data: {} });
});
afterEach(cleanup);

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
  expect(screen.getAllByRole("region")).toHaveLength(7);
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
  expect(screen.getByText(/Requirements and customizations are not shown/)).toBeInTheDocument();
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
