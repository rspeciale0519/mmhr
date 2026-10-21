import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getIntake, getIntakesPage, IntakeReadError } from "@/server/commands/intake-read";
import { getIntakeRequirementsPage, RequirementReadError } from "@/server/commands/requirement-read";
import CustomerHome from "./page";

vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));
vi.mock("@/server/auth/authorization", async (original) => ({
  ...await original<typeof import("@/server/auth/authorization")>(), authorizePermission: vi.fn(),
}));
vi.mock("@/server/commands/intake-read", async (original) => ({
  ...await original<typeof import("@/server/commands/intake-read")>(),
  getIntake: vi.fn(), getIntakesPage: vi.fn(),
}));
vi.mock("@/server/commands/requirement-read", async (original) => ({
  ...await original<typeof import("@/server/commands/requirement-read")>(),
  getIntakeRequirementsPage: vi.fn(),
}));
vi.mock("./intake-form", () => ({ CustomerIntakeForm: () => <form aria-label="Customer intake form" /> }));
vi.mock("./requirement-form", () => ({ CustomerRequirementForm: () => <form aria-label="Customer requirement form" /> }));
vi.mock("./intake-submit", () => ({
  CustomerIntakeSubmit: ({ organizationId, intakeId, expectedRevision }: {
    organizationId: string; intakeId: string; expectedRevision: number;
  }) => <div data-testid="customer-intake-submit" data-organization={organizationId}
    data-intake={intakeId} data-revision={expectedRevision} />,
}));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const supabase = { rpc: vi.fn() };
const summary = {
  organizationId, intakeId, status: "in_progress" as const, revision: 2,
  createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T12:00:00Z",
};
type Query = Record<string, string | string[] | undefined>;
const load = (query: Query = {}) => CustomerHome({ searchParams: Promise.resolve(query) });

function permissionContext(overrides: Record<string, unknown> = {}) {
  return {
    supabase, scope: { kind: "organization" as const, organizationId }, identityId: actorId,
    assurance: "aal1" as const, ...overrides,
  };
}

function allowSubmit() {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permission === "intake.submit" ? permissionContext() as never : null);
}

function allowEveryCustomerAction() {
  vi.mocked(authorizePermission).mockImplementation(async () => permissionContext() as never);
}

beforeEach(() => {
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue({
    identity: { id: actorId },
    authorization: { supabase, scope: { kind: "organization", organizationId }, identityId: actorId, assurance: "aal1" },
  } as never);
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(getIntake).mockReset().mockResolvedValue({ ...summary, submittedAt: null, data: {} });
  vi.mocked(getIntakesPage).mockReset().mockResolvedValue({ intakes: [summary], nextCursor: null });
  vi.mocked(getIntakeRequirementsPage).mockReset().mockResolvedValue({ requirements: [], nextCursor: null });
});

afterEach(cleanup);

test("renders submission only with matching action authority and trusted props", async () => {
  allowSubmit();
  render(await load({ intake: intakeId, organizationId: otherId, identityId: otherId }));
  const submit = screen.getByTestId("customer-intake-submit");
  expect(submit).toHaveAttribute("data-organization", organizationId);
  expect(submit).toHaveAttribute("data-intake", intakeId);
  expect(submit).toHaveAttribute("data-revision", "2");
  expect(authorizePermission).toHaveBeenCalledWith(
    "intake.submit", { kind: "organization", organizationId }, { supabase },
  );
});

test("renders submission for a draft intake", async () => {
  allowSubmit();
  vi.mocked(getIntake).mockResolvedValue({ ...summary, status: "draft", submittedAt: null, data: {} });
  render(await load({ intake: intakeId }));
  expect(screen.getByTestId("customer-intake-submit")).toHaveAttribute("data-revision", "2");
});

test.each([
  { name: "wrong identity", identityId: otherId, scope: { kind: "organization", organizationId } },
  { name: "wrong organization", identityId: actorId, scope: { kind: "organization", organizationId: otherId } },
  { name: "platform scope", identityId: actorId, scope: { kind: "platform" } },
] as const)("hides submission authority with $name", async ({ identityId, scope }) => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permission === "intake.submit" ? permissionContext({ identityId, scope }) as never : null);
  render(await load({ intake: intakeId }));
  expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
});

test("does not treat draft-save permission as submission permission", async () => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permission === "intake.draft.save" ? permissionContext() as never : null);
  render(await load({ intake: intakeId }));
  expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
  expect(authorizePermission).toHaveBeenCalledWith(
    "intake.submit", { kind: "organization", organizationId }, { supabase },
  );
});

test.each([
  {},
  { new: "1" },
  { intake: intakeId, edit: "1" },
  { intake: intakeId, newRequirement: "1" },
  { intake: intakeId, editRequirement: otherId },
] as Query[])("does not check or render submission on non-detail route %j", async (query) => {
  allowEveryCustomerAction();
  render(await load(query));
  expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
  expect(authorizePermission).not.toHaveBeenCalledWith(
    "intake.submit", { kind: "organization", organizationId }, { supabase },
  );
});

test.each(["submitted", "under_review", "completed", "archived"] as const)(
  "hides submission for locked intake status %s",
  async (status) => {
    allowSubmit();
    vi.mocked(getIntake).mockResolvedValue({ ...summary, status, submittedAt: summary.updatedAt, data: {} });
    render(await load({ intake: intakeId }));
    expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
  },
);

test("allows the largest revision that can still increment", async () => {
  allowSubmit();
  vi.mocked(getIntake).mockResolvedValue({ ...summary, revision: 2_147_483_646, submittedAt: null, data: {} });
  render(await load({ intake: intakeId }));
  expect(screen.getByTestId("customer-intake-submit")).toHaveAttribute("data-revision", "2147483646");
});

test("hides submission at the maximum revision", async () => {
  allowSubmit();
  vi.mocked(getIntake).mockResolvedValue({ ...summary, revision: 2_147_483_647, submittedAt: null, data: {} });
  render(await load({ intake: intakeId }));
  expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
});

test("keeps submission available when a later requirement page is empty", async () => {
  allowSubmit();
  vi.mocked(getIntakeRequirementsPage).mockResolvedValue({ requirements: [], nextCursor: null });
  render(await load({ intake: intakeId, requirementsAfter: otherId }));
  expect(screen.getByTestId("customer-intake-submit")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("no more saved active requirements");
  expect(getIntakeRequirementsPage).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, afterId: otherId }, { supabase },
  );
});

test("does not render submission after a scoped intake read error", async () => {
  allowSubmit();
  vi.mocked(getIntake).mockRejectedValue(new IntakeReadError("UNAVAILABLE"));
  render(await load({ intake: intakeId }));
  expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
});

test("does not render submission after authorization failure during the read", async () => {
  allowSubmit();
  vi.mocked(getIntake).mockRejectedValue(new AuthorizationError());
  render(await load({ intake: intakeId }));
  expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("access may have changed");
});

test("does not render submission after the requirement read fails", async () => {
  allowSubmit();
  vi.mocked(getIntakeRequirementsPage).mockRejectedValue(new RequirementReadError("UNAVAILABLE"));
  render(await load({ intake: intakeId }));
  expect(screen.queryByTestId("customer-intake-submit")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(getIntakeRequirementsPage).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, afterId: undefined }, { supabase },
  );
});
