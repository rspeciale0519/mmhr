import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { beforeEach, expect, test, vi } from "vitest";
import { createClient } from "./server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
const set = vi.fn();
const getAll = vi.fn();
const writes = [{ name: "test-session", value: "test-value", options: { httpOnly: true, path: "/" } }];

function cookieAdapter() {
  const adapter = vi.mocked(createServerClient).mock.calls[0]?.[2]?.cookies;
  if (!adapter || !("setAll" in adapter) || !adapter.setAll) throw new Error("Missing cookie adapter");
  return adapter;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.mocked(createServerClient).mockReset().mockReturnValue({} as never);
  set.mockReset();
  getAll.mockReset().mockReturnValue([{ name: "test-session", value: "saved-test-value" }]);
  vi.mocked(cookies).mockReset().mockResolvedValue({ set, getAll } as never);
});

test("strict action clients surface cookie write failures", async () => {
  set.mockImplementation(() => { throw new Error("Cookie write rejected"); });
  await createClient({ requireCookieWrites: true });
  expect(() => cookieAdapter().setAll!(writes, {})).toThrow("Cookie write rejected");
});

test("default Server Component clients preserve read-only cookie behavior", async () => {
  set.mockImplementation(() => { throw new Error("Server Component cannot write cookies"); });
  await createClient();
  expect(() => cookieAdapter().setAll!(writes, {})).not.toThrow();
});

test.each([false, true])("reads and writes cookies with their original options: %s", async (requireCookieWrites) => {
  await createClient({ requireCookieWrites });
  expect(await cookieAdapter().getAll()).toEqual([{ name: "test-session", value: "saved-test-value" }]);
  cookieAdapter().setAll!(writes, {});
  expect(set).toHaveBeenCalledExactlyOnceWith("test-session", "test-value", { httpOnly: true, path: "/" });
});
