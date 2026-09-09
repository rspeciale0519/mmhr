import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { getIntake, IntakeReadError } from "@/server/commands/intake-read";
import { getCurrentEvaluationPublication } from "@/server/commands/current-evaluation-publication";
import { EvaluationPublicationError } from "@/server/commands/evaluation-publication";
import { EvaluationSelectionError, getInitialEvaluationSelections } from "@/server/commands/evaluation-selection";
import CustomerEvaluationPage from "./page";
import { EvaluationOptions } from "./evaluation-options";

const evaluationProps = vi.hoisted(() => [] as Array<{ canSelect: boolean; publication: { publicationId: string }; history: { initialCandidateCount: number } }>);

vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));
vi.mock("@/server/auth/authorization", async (original) => ({
  ...await original<typeof import("@/server/auth/authorization")>(), authorizePermission: vi.fn(),
}));
vi.mock("@/server/commands/intake-read", async (original) => ({
  ...await original<typeof import("@/server/commands/intake-read")>(), getIntake: vi.fn(),
}));
vi.mock("@/server/commands/current-evaluation-publication", async (original) => ({
  ...await original<typeof import("@/server/commands/current-evaluation-publication")>(), getCurrentEvaluationPublication: vi.fn(),
}));
vi.mock("@/server/commands/evaluation-selection", async (original) => ({
  ...await original<typeof import("@/server/commands/evaluation-selection")>(), getInitialEvaluationSelections: vi.fn(),
}));
vi.mock("./evaluation-options", () => ({
  EvaluationOptions: (props: { canSelect: boolean; publication: { publicationId: string }; history: { initialCandidateCount: number } }) => {
    evaluationProps.push(props);
    return <div data-testid="evaluation-options" data-can-select={String(props.canSelect)} data-publication={props.publication.publicationId} />;
  },
}));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const identityId = "44444444-4444-4444-8444-444444444444";
const publicationId = "55555555-5555-4555-8555-555555555555";
const correlationId = "66666666-6666-4666-8666-666666666666";
const supabase = { rpc: vi.fn() };
type Query = Record<string, string | string[] | undefined>;

const intake = {
  organizationId, intakeId, status: "submitted" as const, revision: 4,
  createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T12:00:00Z",
  submittedAt: "2026-09-08T13:00:00Z", data: {},
};
const history = {
  organizationId, intakeId, initialCandidateCount: 1, remainingInitialChoices: 4,
  items: [{ selectionId: otherId, publicationId, publicationSequence: 1, optionId: otherId,
    candidateId: otherId, ordinal: 1, maskedLabel: "Option 1", state: "active" as const,
    selectedAt: "2026-09-08T14:00:00Z" }], correlationId,
};
const publication = {
  publicationId, organizationId, intakeId, sequence: 1, configurationVersion: 1,
  state: "published" as const, inputDigest: "a".repeat(64), optionCount: 1,
  options: [{ optionId: otherId, ordinal: 1, maskedLabel: "Option 1", eligibility: "eligible" as const,
    deterministicScore: 10000, confidenceBasisPoints: 10000, fitReasons: ["fit"], limitations: [],
    evidenceFreshAt: "2026-09-08T12:00:00Z", validUntil: "2026-10-08T12:00:00Z" }],
  nextOrdinal: null, correlationId,
};

const load = (query: Query = {}) => CustomerEvaluationPage({ searchParams: Promise.resolve(query) });

beforeEach(() => {
  evaluationProps.length = 0;
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue({
    identity: { id: identityId },
    authorization: { supabase, scope: { kind: "organization", organizationId }, identityId, assurance: "aal1" },
  } as never);
  vi.mocked(getIntake).mockReset().mockResolvedValue(intake);
  vi.mocked(getInitialEvaluationSelections).mockReset().mockResolvedValue(history);
  vi.mocked(getCurrentEvaluationPublication).mockReset().mockResolvedValue({
    organizationId, intakeId, publication, correlationId,
  });
});
afterEach(cleanup);

test("checks portal access before parsing the URL or reading records", async () => {
  vi.mocked(requirePortalPageAccess).mockRejectedValue(new Error("Sign in required"));
  await expect(load({ intake: "bad" })).rejects.toThrow("Sign in required");
  expect(getIntake).not.toHaveBeenCalled();
  expect(getInitialEvaluationSelections).not.toHaveBeenCalled();
  expect(getCurrentEvaluationPublication).not.toHaveBeenCalled();
});

test.each<Query>([
  {}, { intake: "bad" }, { intake: [intakeId] }, { intake: [intakeId, otherId] },
])("rejects invalid or authority-bearing URL parameters before reads: %j", async (query) => {
  render(await load(query));
  expect(screen.getByRole("alert")).toHaveTextContent("link is not valid");
  expect(getIntake).not.toHaveBeenCalled();
  expect(getInitialEvaluationSelections).not.toHaveBeenCalled();
  expect(getCurrentEvaluationPublication).not.toHaveBeenCalled();
});

test("uses the portal organization and request client, never URL authority", async () => {
  render(await load({ intake: intakeId, organizationId: otherId, identityId: otherId }));
  expect(getIntake).toHaveBeenCalledExactlyOnceWith({ organizationId, intakeId }, { supabase });
  expect(getInitialEvaluationSelections).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, correlationId: expect.any(String) }, { supabase },
  );
  expect(getCurrentEvaluationPublication).toHaveBeenCalledExactlyOnceWith(
    { organizationId, intakeId, correlationId: expect.any(String) }, { supabase },
  );
  expect(screen.getByTestId("evaluation-options")).toBeInTheDocument();
});

test.each([
  { status: "submitted" as const, permission: { identityId, scope: { kind: "organization", organizationId } }, canSelect: true },
  { status: "submitted" as const, permission: { identityId: otherId, scope: { kind: "organization", organizationId } }, canSelect: false },
  { status: "submitted" as const, permission: { identityId, scope: { kind: "organization", organizationId: otherId } }, canSelect: false },
  { status: "in_progress" as const, permission: { identityId, scope: { kind: "organization", organizationId } }, canSelect: false },
])("passes selection only for the submitted, same-scope, same-identity permission: %j", async ({ status, permission, canSelect }) => {
  vi.mocked(getIntake).mockResolvedValue({ ...intake, status });
  vi.mocked(authorizePermission).mockResolvedValue({ ...permission, supabase, assurance: "aal1" } as never);
  render(await load({ intake: intakeId }));
  expect(authorizePermission).toHaveBeenCalledExactlyOnceWith("evaluation.select", { kind: "organization", organizationId }, { supabase });
  expect(screen.getByTestId("evaluation-options")).toHaveAttribute("data-can-select", String(canSelect));
});

test.each([
  new IntakeReadError("REJECTED"), new IntakeReadError("UNAVAILABLE"),
  new EvaluationSelectionError("REJECTED"), new AuthorizationError(),
])("redacts intake and history authorization failures without querying publication: %s", async (error) => {
  if (error instanceof IntakeReadError) vi.mocked(getIntake).mockRejectedValue(error);
  else vi.mocked(getInitialEvaluationSelections).mockRejectedValue(error);
  render(await load({ intake: intakeId }));
  expect(screen.getByRole("alert")).toHaveTextContent("not available");
  expect(getCurrentEvaluationPublication).not.toHaveBeenCalled();
  expect(screen.queryByTestId("evaluation-options")).not.toBeInTheDocument();
});

test("renders an empty publication state without exposing a selection control", async () => {
  vi.mocked(getCurrentEvaluationPublication).mockResolvedValue({ organizationId, intakeId, publication: null, correlationId });
  render(await load({ intake: intakeId }));
  expect(screen.getByRole("status")).toHaveTextContent("approved comparison");
  expect(screen.queryByTestId("evaluation-options")).not.toBeInTheDocument();
  expect(screen.getByText("1 of 5 initial choices used.")).toBeInTheDocument();
});

test("keeps masked saved history when the current publication is stale or unavailable", async () => {
  vi.mocked(getCurrentEvaluationPublication).mockRejectedValue(new EvaluationPublicationError("UNAVAILABLE"));
  render(await load({ intake: intakeId }));
  expect(screen.getByRole("alert")).toHaveTextContent("comparison or your access may have changed");
  expect(screen.getByText("Option 1")).toBeInTheDocument();
  expect(screen.queryByText(publicationId, { exact: false })).not.toBeInTheDocument();
});

test("shows the legacy count notice when old saved choices are not in the current page", async () => {
  vi.mocked(getInitialEvaluationSelections).mockResolvedValue({ ...history, initialCandidateCount: 3, remainingInitialChoices: 2, items: [history.items[0]] });
  render(await load({ intake: intakeId }));
  expect(screen.getByText("3 of 5 initial choices used.")).toBeInTheDocument();
  expect(screen.getByText(/Some choices came from an earlier review/)).toBeInTheDocument();
});

test("does not hide unexpected application defects", async () => {
  vi.mocked(getCurrentEvaluationPublication).mockRejectedValue(new Error("Unexpected defect"));
  await expect(load({ intake: intakeId })).rejects.toThrow("Unexpected defect");
});

test("uses publication, history count, and selection permission in the remount key", async () => {
  const page = await load({ intake: intakeId });
  const findEvaluation = (value: unknown): React.ReactElement | undefined => {
    if (!React.isValidElement(value)) return undefined;
    if (value.type === EvaluationOptions) return value;
    const children = (value.props as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const found = findEvaluation(child);
        if (found) return found;
      }
    }
    return findEvaluation(children);
  };
  const element = findEvaluation(page);
  expect(element).toBeDefined();
  expect(element?.key).toBe(`${organizationId}:${intakeId}:${publicationId}:1:false`);
  render(page);
  expect(evaluationProps).toHaveLength(1);
  expect(evaluationProps[0]).toMatchObject({ canSelect: false, publication: { publicationId }, history: { initialCandidateCount: 1 } });
});
