import { beforeEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { forbidden } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePageIdentity } from "@/server/auth/page-guards";
import PendingAccessPage from "./page";

vi.mock("next/navigation", () => ({ forbidden: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ requirePageIdentity: vi.fn() }));

const identityId = "abcdef01-2345-4678-9abc-def012345678";
const authSubjectId = "fedcba98-7654-4321-8fed-cba987654321";

beforeEach(() => {
  vi.mocked(forbidden).mockReset().mockImplementation(() => {
    throw new Error("NEXT_FORBIDDEN");
  });
  vi.mocked(requirePageIdentity).mockReset().mockResolvedValue({ id: authSubjectId });
  vi.mocked(createClient).mockReset();
});

test("shows email confirmation guidance for a pending identity", async () => {
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ data: [{ id: identityId, status: "pending", email_verified_at: null }], error: null }),
  } as never);

  const page = await PendingAccessPage();
  expect(page).toMatchObject({ type: "main" });
  expect(JSON.stringify(page)).toContain("Confirm your email");
});

test("trusts the caller-bound application identity when Auth uses a different subject ID", async () => {
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ data: [{ id: identityId, status: "active", email_verified_at: "2026-09-03T00:00:00.000Z" }], error: null }),
  } as never);

  await expect(PendingAccessPage()).resolves.toMatchObject({ type: "main" });
});

test("shows access guidance for a verified active identity", async () => {
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ data: [{ id: identityId, status: "active", email_verified_at: "2026-09-03T00:00:00.000Z" }], error: null }),
  } as never);

  const page = await PendingAccessPage();
  expect(page).toMatchObject({ type: "main" });
  const children = Array.isArray(page.props.children) ? page.props.children : [page.props.children];
  expect(children.some((child: { props?: { children?: unknown } } | null) => child?.props?.children === "Review pending invitations")).toBe(true);
});

test("accepts the full RPC shape without rendering the email", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{
    id: identityId,
    status: "active",
    normalized_email: "synthetic-pending-page@example.com",
    email_verified_at: "2026-09-03T00:00:00.000Z",
  }], error: null });
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);

  const page = await PendingAccessPage();
  expect(rpc).toHaveBeenCalledWith("mmhr_get_my_account_setup");
  const markup = renderToStaticMarkup(page);
  expect(markup).toContain("Access pending");
  expect(markup).not.toContain("synthetic-pending-page@example.com");
});

test.each([
  { data: [], error: null },
  { data: null, error: { message: "Unavailable" } },
  { data: [{ id: "invalid", status: "active", email_verified_at: null }], error: null },
  { data: [{ id: identityId, status: "active" }], error: null },
  { data: [
    { id: identityId, status: "active", email_verified_at: null },
    { id: identityId, status: "active", email_verified_at: null },
  ], error: null },
])("denies invalid or ambiguous identity responses %#", async (response) => {
  vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue(response) } as never);
  await expect(PendingAccessPage()).rejects.toThrow("NEXT_FORBIDDEN");
});

test("rejects anonymous access before reading the database", async () => {
  vi.mocked(requirePageIdentity).mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(PendingAccessPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(createClient).not.toHaveBeenCalled();
});

test.each(["recovery_pending", "suspended", "archived"])("denies %s identities", async (status) => {
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ data: [{ id: identityId, status, email_verified_at: "2026-09-03T00:00:00.000Z" }], error: null }),
  } as never);

  await expect(PendingAccessPage()).rejects.toThrow("NEXT_FORBIDDEN");
});
