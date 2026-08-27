import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { config, middleware } from "@/middleware";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

describe("public-release middleware", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");
    vi.stubEnv("PUBLIC_RELEASE_APPROVAL_ID", "");
    vi.mocked(createServerClient).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each(["/", "/sign-up", "/admin", "/report.png?download=1"])(
    "blocks the application route %s before session work",
    async (path) => {
      const response = await middleware(
        new NextRequest(`https://mmhr.test${path}`),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  test("blocks HEAD requests", async () => {
    const response = await middleware(
      new NextRequest("https://mmhr.test/", { method: "HEAD" }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-robots-tag")).toContain("nosnippet");
  });

  test("serves robots.txt without starting a session", async () => {
    const response = await middleware(
      new NextRequest("https://mmhr.test/robots.txt?cache=miss"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Disallow: /");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("returns JSON for blocked API routes", async () => {
    const response = await middleware(
      new NextRequest("https://mmhr.test/api/trpc/example"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "service_unavailable" });
  });

  test("an environment flag cannot bypass the checked-in release gate", async () => {
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "1");
    vi.stubEnv("PUBLIC_RELEASE_APPROVAL_ID", "unreviewed-release");

    const response = await middleware(new NextRequest("https://mmhr.test/"));

    expect(response.status).toBe(503);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("matches image-like application paths", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico).*)",
    ]);
  });
});
