import { notFound, redirect } from "next/navigation";
import { beforeEach, expect, test, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedAgentIdUser, isAgentIdSignInEnabled } from "@/server/auth/agentid";
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/agentid", () => ({ getVerifiedAgentIdUser: vi.fn(), isAgentIdSignInEnabled: vi.fn() }));
import Page from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(notFound).mockImplementation(() => { throw new Error("not-found"); });
  vi.mocked(redirect).mockImplementation(() => { throw new Error("redirect"); });
  vi.mocked(isAgentIdSignInEnabled).mockReturnValue(true);
  vi.mocked(createClient).mockResolvedValue({ auth: {} } as never);
  vi.mocked(getVerifiedAgentIdUser).mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", email: "agent@agentmail.to" });
});
test("does not read identity while disabled", async () => {
  vi.mocked(isAgentIdSignInEnabled).mockReturnValue(false);
  await expect(Page()).rejects.toThrow("not-found");
  expect(createClient).not.toHaveBeenCalled();
});
test("redirects unverified callers to sign-in", async () => {
  vi.mocked(getVerifiedAgentIdUser).mockRejectedValue(new Error("private-details"));
  await expect(Page()).rejects.toThrow("redirect");
  expect(redirect).toHaveBeenCalledExactlyOnceWith("/sign-in");
});
test("renders registration only after verified identity", async () => {
  const page = await Page();
  expect(page.type).toBe("main");
  expect(getVerifiedAgentIdUser).toHaveBeenCalledOnce();
  expect(notFound).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
