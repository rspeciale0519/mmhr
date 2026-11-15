import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/server/auth/authorization";
import { openStaffCase, StaffSubmissionError } from "@/server/commands/staff-submissions";
import { openStaffCaseAction } from "./actions";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  forbidden: () => { throw new Error("FORBIDDEN"); },
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("@/server/commands/staff-submissions", async (original) => ({
  ...(await original<typeof import("@/server/commands/staff-submissions")>()), openStaffCase: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const intakeId = "ABCDEF01-2345-4678-9ABC-DEF012345678";
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const set = vi.fn();
function form(values: Record<string, string> = { intakeId, idempotencyKey }) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
  vi.mocked(cookies).mockReset().mockResolvedValue({ set } as never);
  vi.mocked(openStaffCase).mockReset().mockResolvedValue({
    intakeId: intakeId.toLowerCase(), organizationId, grantId: null, outcomeCode: "opened", correlationId: idempotencyKey,
  });
  vi.mocked(redirect).mockClear(); set.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

test("opens the case, selects the server-derived workspace, and shows the review", async () => {
  await expect(openStaffCaseAction(form())).rejects.toThrow(`REDIRECT /admin/evaluations?intake=${intakeId.toLowerCase()}`);
  expect(openStaffCase).toHaveBeenCalledExactlyOnceWith({
    intakeId: intakeId.toLowerCase(), idempotencyKey, correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(set).toHaveBeenCalledExactlyOnceWith("mmhr-organization-id", organizationId, {
    httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 28800,
  });
});

test.each([
  [{ intakeId: "bad", idempotencyKey }],
  [{ intakeId }],
  [{ intakeId: "00000000-0000-0000-0000-000000000000", idempotencyKey }],
])("rejects invalid input %j without a database call", async (values) => {
  await expect(openStaffCaseAction(form(values))).rejects.toThrow("FORBIDDEN");
  expect(openStaffCase).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
});

test("rejects duplicate intake values", async () => {
  const data = form(); data.append("intakeId", intakeId);
  await expect(openStaffCaseAction(data)).rejects.toThrow("FORBIDDEN");
  expect(openStaffCase).not.toHaveBeenCalled();
});

test("returns to the queue with a notice when access is denied", async () => {
  vi.mocked(openStaffCase).mockRejectedValue(new AuthorizationError());
  await expect(openStaffCaseAction(form())).rejects.toThrow("REDIRECT /admin/submissions?notice=denied");
  expect(set).not.toHaveBeenCalled();
});

test("does not hide other failures", async () => {
  vi.mocked(openStaffCase).mockRejectedValue(new StaffSubmissionError("UNAVAILABLE"));
  await expect(openStaffCaseAction(form())).rejects.toBeInstanceOf(StaffSubmissionError);
  expect(set).not.toHaveBeenCalled();
});

test.each([null, "https://untrusted.example"])("rejects untrusted origin %s before the command", async (origin) => {
  vi.mocked(headers).mockResolvedValue(new Headers(origin ? { origin } : {}) as never);
  await expect(openStaffCaseAction(form())).rejects.toThrow("Server Action request rejected");
  expect(openStaffCase).not.toHaveBeenCalled();
});
