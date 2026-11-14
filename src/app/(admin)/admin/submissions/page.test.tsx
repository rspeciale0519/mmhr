import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import SubmissionsPage from "./page";
import SubmissionsLoading from "./loading";
import SubmissionsError from "./error";
import { requirePagePermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getStaffSubmissionQueue } from "@/server/commands/staff-submissions";

vi.mock("@/server/auth/page-guards", () => ({ requirePagePermission: vi.fn() }));
vi.mock("@/server/commands/staff-submissions", () => ({ getStaffSubmissionQueue: vi.fn() }));
vi.mock("./actions", () => ({ openStaffCaseAction: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("forbidden"); }, notFound: () => { throw new Error("not found"); } }));

const supabase = { rpc: vi.fn() };
const first = {
  intakeId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222",
  organizationName: "Northwind Payroll", status: "submitted" as const, submittedAt: "2026-11-14T10:00:00.000000Z",
  callerHasAccess: false, staffWithAccess: 0,
};
const second = {
  ...first, intakeId: "33333333-3333-4333-8333-333333333333", organizationId: "44444444-4444-4444-8444-444444444444",
  organizationName: "Contoso Retail", status: "under_review" as const, callerHasAccess: true, staffWithAccess: 2,
};
beforeEach(() => {
  vi.mocked(requirePagePermission).mockReset().mockResolvedValue({ identity: {}, authorization: { supabase } } as never);
  vi.mocked(getStaffSubmissionQueue).mockReset().mockResolvedValue({ items: [first, second], nextCursor: null });
});
afterEach(cleanup);

test("requires platform staff access and lists intakes from several customers", async () => {
  render(await SubmissionsPage({ searchParams: Promise.resolve({}) }));
  expect(requirePagePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  expect(getStaffSubmissionQueue).toHaveBeenCalledWith({ after: undefined }, { supabase });
  const rows = within(screen.getByRole("list", { name: "Submitted intakes" })).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("Northwind Payroll");
  expect(rows[0]).toHaveTextContent("No staff member has opened this case.");
  expect(within(rows[0]!).getByRole("button")).toHaveTextContent("Open case");
  expect(rows[1]).toHaveTextContent("Under review");
  expect(rows[1]).toHaveTextContent("You have access to this case.");
  expect(within(rows[1]!).getByRole("button")).toHaveTextContent("Continue review");
});

test("posts only the intake reference and a fresh idempotency key", async () => {
  const { container } = render(await SubmissionsPage({ searchParams: Promise.resolve({}) }));
  const form = container.querySelector("form")!;
  const fields = [...form.querySelectorAll("input")].map((input) => input.name);
  expect(fields).toEqual(["intakeId", "idempotencyKey"]);
  expect(form.querySelector<HTMLInputElement>("input[name=intakeId]")!.value).toBe(first.intakeId);
});

test("shows an empty state", async () => {
  vi.mocked(getStaffSubmissionQueue).mockResolvedValue({ items: [], nextCursor: null });
  render(await SubmissionsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("status")).toHaveTextContent("No submitted intakes need work now.");
});

test("passes a cursor and links to older intakes", async () => {
  const after = { submittedAt: "2026-11-15T10:00:00.000000Z", intakeId: first.intakeId };
  vi.mocked(getStaffSubmissionQueue).mockResolvedValue({ items: [first], nextCursor: { submittedAt: first.submittedAt, intakeId: first.intakeId } });
  render(await SubmissionsPage({ searchParams: Promise.resolve({ afterSubmittedAt: after.submittedAt, afterIntake: after.intakeId }) }));
  expect(getStaffSubmissionQueue).toHaveBeenCalledWith({ after }, { supabase });
  expect(screen.getByRole("link", { name: "Older intakes" })).toHaveAttribute("href",
    `/admin/submissions?afterSubmittedAt=${encodeURIComponent(first.submittedAt)}&afterIntake=${first.intakeId}`);
});

test("shows the denial notice", async () => {
  render(await SubmissionsPage({ searchParams: Promise.resolve({ notice: "denied" }) }));
  expect(screen.getByRole("alert")).toHaveTextContent("The case could not be opened.");
});

test.each([{ afterIntake: first.intakeId }, { organizationId: first.organizationId }, { notice: "other" }])(
  "rejects forged search parameters %j before reading data", async (params) => {
    await expect(SubmissionsPage({ searchParams: Promise.resolve(params) })).rejects.toThrow("not found");
    expect(getStaffSubmissionQueue).not.toHaveBeenCalled();
  },
);

test("renders nothing after an authorization failure", async () => {
  vi.mocked(getStaffSubmissionQueue).mockRejectedValue(new AuthorizationError());
  await expect(SubmissionsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("forbidden");
});

test("shows plain loading and error states", () => {
  render(<SubmissionsLoading/>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading submitted customer intakes");
  cleanup();
  const retry = vi.fn(); render(<SubmissionsError retry={retry}/>);
  fireEvent.click(screen.getByRole("button", { name: "Reload submitted intakes" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
