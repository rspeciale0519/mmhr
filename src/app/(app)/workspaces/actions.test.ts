import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authorizePermission } from "@/server/auth/authorization";
import { selectOrganizationAction } from "./actions";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  forbidden: () => { throw new Error("FORBIDDEN"); },
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
}));
vi.mock("@/server/auth/authorization", () => ({ authorizePermission: vi.fn() }));
const id = "ABCDEF01-2345-4678-9ABC-DEF012345678";
const scope = { kind: "organization", organizationId: id.toLowerCase() };
const set = vi.fn();
function form(value = id) {
  const data = new FormData(); data.set("organizationId", value); return data;
}
function grant(...permissions: string[]) {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permissions.includes(permission) ? { identityId: "application-identity" } as never : null);
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
  vi.mocked(cookies).mockReset().mockResolvedValue({ set } as never);
  vi.mocked(authorizePermission).mockReset();
  grant("workspace.access", "portal.customer.access");
  vi.mocked(redirect).mockClear(); set.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

test.each(["production", "development"])("sets a scoped HttpOnly cookie after authorization in %s", async (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  await expect(selectOrganizationAction(form())).rejects.toThrow("REDIRECT");
  expect(vi.mocked(authorizePermission).mock.calls[0]).toEqual(["workspace.access", scope, {}]);
  expect(set).toHaveBeenCalledExactlyOnceWith("mmhr-organization-id", id.toLowerCase(), {
    httpOnly: true, secure: mode === "production", sameSite: "lax", path: "/", maxAge: 28800,
  });
  expect(redirect).toHaveBeenCalledWith("/customer");
});

test.each([
  [["workspace.access", "portal.customer.access"], "/customer"],
  [["workspace.access", "portal.vendor.access"], "/vendor"],
  [["workspace.access"], "/home"],
])("opens the portal the selected workspace allows: %j", async (permissions, destination) => {
  grant(...permissions);
  await expect(selectOrganizationAction(form())).rejects.toThrow("REDIRECT");
  expect(redirect).toHaveBeenCalledExactlyOnceWith(destination);
  // Each portal decision uses the selected organization, never a client value.
  for (const call of vi.mocked(authorizePermission).mock.calls) expect(call[1]).toEqual(scope);
});

test.each(["", "bad-id", "00000000-0000-0000-0000-000000000000", "https://untrusted.example"])(
  "rejects invalid organization input %s without a database call", async (value) => {
    await expect(selectOrganizationAction(form(value))).rejects.toThrow("FORBIDDEN");
    expect(authorizePermission).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  },
);

test("rejects ambiguous duplicate organization inputs", async () => {
  const data = form(); data.append("organizationId", id);
  await expect(selectOrganizationAction(data)).rejects.toThrow("FORBIDDEN");
  expect(authorizePermission).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
});

test("denies revoked or cross-organization access without changing the existing selection", async () => {
  grant();
  await expect(selectOrganizationAction(form())).rejects.toThrow("FORBIDDEN");
  expect(cookies).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
});

test("does not set a cookie when permission evaluation fails", async () => {
  vi.mocked(authorizePermission).mockRejectedValue(new Error("Permission service unavailable"));
  await expect(selectOrganizationAction(form())).rejects.toThrow("Permission service unavailable");
  expect(set).not.toHaveBeenCalled();
});

test.each([null, "https://untrusted.example"])("rejects untrusted origin %s before authorization", async (origin) => {
  vi.mocked(headers).mockResolvedValue(new Headers(origin ? { origin } : {}) as never);
  await expect(selectOrganizationAction(form())).rejects.toThrow("Server Action request rejected");
  expect(authorizePermission).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
});
