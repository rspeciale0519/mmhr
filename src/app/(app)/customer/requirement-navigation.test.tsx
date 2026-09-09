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
vi.mock("./requirement-form", () => ({
  CustomerRequirementForm: ({
    organizationId, intakeId, requirement, returnHref,
  }: {
    organizationId: string;
    intakeId: string;
    requirement?: { requirementId: string };
    returnHref: string;
  }) => <form aria-label="Customer requirement form"
    data-organization={organizationId} data-intake={intakeId}
    data-requirement={requirement?.requirementId} data-return-href={returnHref} />,
}));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const requirementId = "33333333-3333-4333-8333-333333333333";
const cursor = "10000000-0000-4000-8000-000000000000";
const nextCursor = "44444444-4444-4444-8444-444444444444";
const otherId = "55555555-5555-4555-8555-555555555555";
const supabase = { rpc: vi.fn() };
const query = (values: Record<string, string | string[] | undefined> = {}) =>
  CustomerHome({ searchParams: Promise.resolve(values) });
const summary = {
  organizationId, intakeId, status: "in_progress" as const, revision: 2,
  createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T12:00:00Z",
};
const requirement = {
  requirementId, organizationId, intakeId, stableKey: "payroll",
  label: "Payroll integration", importance: "must" as const, weight: 75,
  response: "Keep the current payroll system", status: "active" as const,
  requirementType: "custom" as const, revision: 1,
  createdAt: summary.createdAt, updatedAt: summary.updatedAt,
};
const detail = { ...summary, submittedAt: null, data: {} };
const page = (requirements = [requirement], nextCursor: string | null = null) => ({ requirements, nextCursor });

function allowRequirementSave() {
  vi.mocked(authorizePermission).mockImplementation(async (permission) => permission === "intake.requirement.save"
    ? { supabase, scope: { kind: "organization", organizationId }, identityId: intakeId,
      assurance: "aal1", correlationId: otherId } as never
    : null);
}

beforeEach(() => {
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue({
    identity: { id: otherId },
    authorization: { supabase, scope: { kind: "organization", organizationId }, identityId: intakeId, assurance: "aal1" },
  } as never);
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(getIntake).mockReset().mockResolvedValue(detail);
  vi.mocked(getIntakesPage).mockReset().mockResolvedValue({ intakes: [summary], nextCursor: null });
  vi.mocked(getIntakeRequirementsPage).mockReset().mockResolvedValue(page());
});

afterEach(cleanup);

test.each([
  { newRequirement: "1" },
  { intake: intakeId, newRequirement: "1", after: cursor },
  { intake: intakeId, newRequirement: "1", requirementsAfter: cursor },
  { intake: intakeId, newRequirement: "1", editRequirement: requirementId },
  { editRequirement: requirementId },
  { intake: intakeId, editRequirement: requirementId, after: cursor },
  { intake: intakeId, editRequirement: requirementId, newRequirement: "1" },
  { intake: intakeId, new: "1", newRequirement: "1" },
  { intake: intakeId, edit: "1", editRequirement: requirementId },
  { intake: intakeId, new: "1", editRequirement: requirementId },
  { intake: intakeId, edit: "1", newRequirement: "1" },
  { intake: [intakeId] },
  { intake: intakeId, editRequirement: [requirementId] },
  { intake: intakeId, newRequirement: ["1"] },
  { intake: intakeId, new: ["1"] },
  { intake: intakeId, edit: ["1"] },
  { intake: intakeId, editRequirement: requirementId, requirementsAfter: [cursor] },
  { requirementsAfter: cursor },
] as Array<Record<string, string | string[] | undefined>>)("rejects invalid requirement navigation after portal authorization: %j", async (values) => {
  render(await query(values));
  expect(requirePortalPageAccess).toHaveBeenCalledExactlyOnceWith("customer");
  expect(authorizePermission).not.toHaveBeenCalled();
  expect(getIntake).not.toHaveBeenCalled();
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
  expect(getIntakesPage).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("link is not valid");
});

test("loads a new requirement form with only requirement-save authority", async () => {
  allowRequirementSave();
  render(await query({ intake: intakeId, newRequirement: "1", organizationId: otherId, identityId: otherId }));
  expect(authorizePermission).toHaveBeenCalledWith(
    "intake.requirement.save", { kind: "organization", organizationId }, { supabase },
  );
  expect(authorizePermission).toHaveBeenCalledWith(
    "intake.draft.save", { kind: "organization", organizationId }, { supabase },
  );
  expect(getIntake).toHaveBeenCalledExactlyOnceWith({ organizationId, intakeId }, { supabase });
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
  expect(getIntakesPage).not.toHaveBeenCalled();
  expect(screen.getByRole("form")).toHaveAttribute("data-organization", organizationId);
  expect(screen.getByRole("form")).toHaveAttribute("data-intake", intakeId);
  expect(screen.getByRole("form")).not.toHaveAttribute("data-requirement");
  expect(screen.getByRole("form")).toHaveAttribute("data-return-href", `/customer?intake=${intakeId}`);
});

test.each(["draft", "in_progress"] as const)("loads a new requirement form for editable intake status %s", async (status) => {
  allowRequirementSave();
  vi.mocked(getIntake).mockResolvedValue({ ...detail, status });
  render(await query({ intake: intakeId, newRequirement: "1" }));
  expect(screen.getByRole("form")).toBeInTheDocument();
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
});

test("denies a new requirement form for a submitted intake", async () => {
  allowRequirementSave();
  vi.mocked(getIntake).mockResolvedValue({ ...detail, status: "submitted" });
  render(await query({ intake: intakeId, newRequirement: "1" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("not available");
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
});

test("denies a new requirement form without matching identity or scope authority", async () => {
  vi.mocked(authorizePermission).mockResolvedValue({
    supabase, scope: { kind: "organization", organizationId: otherId }, identityId: otherId, assurance: "aal1",
  } as never);
  render(await query({ intake: intakeId, newRequirement: "1" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(getIntake).not.toHaveBeenCalled();
});

test.each([
  { name: "wrong identity", identityId: otherId, scope: { kind: "organization", organizationId } },
  { name: "wrong organization", identityId: intakeId, scope: { kind: "organization", organizationId: otherId } },
  { name: "platform scope", identityId: intakeId, scope: { kind: "platform" } },
] as const)("rejects requirement form authority with $name", async ({ identityId, scope }) => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) => permission === "intake.requirement.save"
    ? { supabase, scope, identityId, assurance: "aal1", correlationId: otherId } as never
    : null);
  render(await query({ intake: intakeId, newRequirement: "1" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("not available");
  expect(getIntake).not.toHaveBeenCalled();
});

test.each([
  { intake: intakeId, newRequirement: "1" },
  { intake: intakeId, editRequirement: requirementId },
] as const)("does not treat draft-only authority as requirement-save authority: %j", async (values) => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) => permission === "intake.draft.save"
    ? { supabase, scope: { kind: "organization", organizationId }, identityId: intakeId,
      assurance: "aal1", correlationId: otherId } as never
    : null);
  render(await query(values));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("not available");
  expect(getIntake).not.toHaveBeenCalled();
});

test("loads an edit form from only the current bounded requirement page", async () => {
  allowRequirementSave();
  vi.mocked(getIntakeRequirementsPage).mockResolvedValue(page([requirement], nextCursor));
  render(await query({ intake: intakeId, editRequirement: requirementId, requirementsAfter: cursor.toUpperCase(),
    organizationId: otherId, identityId: otherId, pageSize: "500" }));
  expect(getIntake).toHaveBeenCalledExactlyOnceWith({ organizationId, intakeId }, { supabase });
  expect(getIntakeRequirementsPage).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, afterId: cursor }, { supabase },
  );
  expect(getIntakesPage).not.toHaveBeenCalled();
  expect(screen.getByRole("form")).toHaveAttribute("data-requirement", requirementId);
  expect(screen.getByRole("form")).toHaveAttribute("data-return-href",
    `/customer?intake=${intakeId}&requirementsAfter=${cursor}`);
});

test("does not scan another requirement page when the edit target is absent", async () => {
  allowRequirementSave();
  vi.mocked(getIntakeRequirementsPage).mockResolvedValue(page([], nextCursor));
  render(await query({ intake: intakeId, editRequirement: requirementId, requirementsAfter: cursor }));
  expect(getIntakeRequirementsPage).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, afterId: cursor }, { supabase },
  );
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("not available");
});

test("denies editing a noneditable parent before reading requirements", async () => {
  allowRequirementSave();
  vi.mocked(getIntake).mockResolvedValue({ ...detail, status: "completed" });
  render(await query({ intake: intakeId, editRequirement: requirementId }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
});

test.each(["submitted", "under_review", "completed", "archived"] as const)(
  "denies new requirement navigation for locked intake status %s",
  async (status) => {
    allowRequirementSave();
    vi.mocked(getIntake).mockResolvedValue({ ...detail, status });
    render(await query({ intake: intakeId, newRequirement: "1" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
  },
);

test.each(["submitted", "under_review", "completed", "archived"] as const)(
  "denies edit requirement navigation for locked intake status %s",
  async (status) => {
    allowRequirementSave();
    vi.mocked(getIntake).mockResolvedValue({ ...detail, status });
    render(await query({ intake: intakeId, editRequirement: requirementId, requirementsAfter: cursor }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(getIntakeRequirementsPage).not.toHaveBeenCalled();
  },
);

test("shows trusted add and edit links only when requirement authority and intake status allow them", async () => {
  allowRequirementSave();
  vi.mocked(getIntakeRequirementsPage).mockResolvedValue(page([requirement], nextCursor));
  render(await query({ intake: intakeId, requirementsAfter: cursor, organizationId: otherId, identityId: otherId }));
  expect(screen.getByRole("link", { name: "Add requirement" })).toHaveAttribute(
    "href", `/customer?intake=${intakeId}&newRequirement=1`,
  );
  expect(screen.getByRole("link", { name: "Edit requirement Payroll integration" })).toHaveAttribute(
    "href", `/customer?intake=${intakeId}&requirementsAfter=${cursor}&editRequirement=${requirementId}`,
  );
  const links = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "").join(" ");
  expect(links).not.toContain(organizationId);
  expect(links).not.toContain(otherId);
});

test("hides requirement change links without requirement-save authority", async () => {
  vi.mocked(getIntakeRequirementsPage).mockResolvedValue(page([requirement], nextCursor));
  render(await query({ intake: intakeId, requirementsAfter: cursor }));
  expect(screen.queryByRole("link", { name: "Add requirement" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Edit requirement Payroll integration" })).not.toBeInTheDocument();
});

test.each([
  new IntakeReadError("REJECTED"), new RequirementReadError("UNAVAILABLE"), new AuthorizationError(),
])("redacts requirement navigation read failures", async (error) => {
  allowRequirementSave();
  if (error instanceof IntakeReadError || error instanceof AuthorizationError) vi.mocked(getIntake).mockRejectedValue(error);
  else vi.mocked(getIntakeRequirementsPage).mockRejectedValue(error);
  render(await query({ intake: intakeId, editRequirement: requirementId }));
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.queryByText(/REJECTED|UNAVAILABLE/)).not.toBeInTheDocument();
});
