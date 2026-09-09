import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { getIntakeRequirementsPage } from "@/server/commands/requirement-read";
import { SavedRequirements } from "./requirement-views";

type RequirementPage = Awaited<ReturnType<typeof getIntakeRequirementsPage>>;
type Requirement = RequirementPage["requirements"][number];
const intakeId = "22222222-2222-4222-8222-222222222222";
const requirementId = "33333333-3333-4333-8333-333333333333";
const nextId = "44444444-4444-4444-8444-444444444444";

const requirement = (overrides: Partial<Requirement> = {}): Requirement => ({
  requirementId,
  organizationId: "11111111-1111-4111-8111-111111111111",
  intakeId,
  stableKey: "payroll",
  label: "Payroll platform",
  importance: "must" as const,
  weight: 100,
  response: "Yes",
  status: "active" as const,
  requirementType: "structured" as const,
  revision: 1,
  createdAt: "2026-09-08T10:00:00Z",
  updatedAt: "2026-09-08T11:00:00Z",
  ...overrides,
});

const page = (
  requirements: Requirement[] = [requirement()],
  nextCursor: string | null = null,
): RequirementPage => ({ requirements, nextCursor });

afterEach(cleanup);

test("renders active labels and every saved response value as escaped text", () => {
  const { container } = render(
    <SavedRequirements
      intakeId={intakeId}
      hasCursor={false}
      page={page([
        requirement({
          response: {
            emptyObject: {},
            emptyArray: [],
            nullValue: null,
            falseValue: false,
            trueValue: true,
            zeroValue: 0,
            emptyString: "",
            whitespaceOnly: "   ",
            paddedText: "  saved text  ",
            keyMarkup: { "<img src=x>": "<script>alert(1)</script>" },
            nested: { answer: ["first", { second: "value" }] },
          },
        }),
        requirement({
          requirementId: nextId,
          stableKey: "benefits",
          label: "Benefits",
          importance: "nice",
          weight: 25,
          requirementType: "custom",
        }),
        requirement({
          requirementId: "55555555-5555-4555-8555-555555555555",
          stableKey: "travel",
          label: "Travel",
          importance: "not_applicable",
          weight: 1,
        }),
      ])}
    />,
  );

  expect(screen.getByRole("heading", { name: "Active requirements" })).toBeInTheDocument();
  expect(screen.getAllByText("Active requirement")).toHaveLength(3);
  expect(screen.getAllByText("Standard requirement")).toHaveLength(2);
  expect(screen.getByText("Custom request")).toBeInTheDocument();
  expect(screen.getByText("Must have")).toBeInTheDocument();
  expect(screen.getByText("Nice to have")).toBeInTheDocument();
  expect(screen.getByText("Not applicable")).toBeInTheDocument();
  expect(screen.getByText("100")).toBeInTheDocument();
  expect(screen.getByText("25")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
  expect(screen.getByText("No answer saved")).toBeInTheDocument();
  expect(screen.getByText("No")).toBeInTheDocument();
  expect(screen.getAllByText("Yes")).toHaveLength(3);
  expect(screen.getByText("0", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Empty text saved")).toBeInTheDocument();
  expect(screen.getByText("No saved items")).toBeInTheDocument();
  expect(screen.getByText("No saved fields")).toBeInTheDocument();
  expect(container.textContent).toContain("  saved text  ");
  expect(container.textContent).toContain("   ");
  expect(screen.getByText("<img src=x>")).toBeInTheDocument();
  expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(container.querySelector("script,img")).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
});

test.each([
  [false, "There are no saved active requirements in this intake."],
  [true, "There are no more saved active requirements in this intake."],
])("distinguishes empty first and next pages: %s", (hasCursor, message) => {
  render(<SavedRequirements intakeId={intakeId} hasCursor={hasCursor} page={page([])} />);
  expect(screen.getByRole("status")).toHaveTextContent(message);
});

test("keeps pagination scoped to the intake and cursor", () => {
  render(
    <SavedRequirements
      intakeId={intakeId}
      hasCursor
      page={page([requirement()], nextId)}
    />,
  );

  expect(screen.getByRole("link", { name: "Back to first requirements page" })).toHaveAttribute(
    "href",
    "/customer?intake=" + intakeId,
  );
  expect(screen.getByRole("link", { name: "Next requirements page" })).toHaveAttribute(
    "href",
    "/customer?intake=" + intakeId + "&requirementsAfter=" + nextId,
  );
  expect(screen.queryByText("11111111-1111-4111-8111-111111111111")).not.toBeInTheDocument();
  expect(screen.queryByText("33333333-3333-4333-8333-333333333333")).not.toBeInTheDocument();
});
