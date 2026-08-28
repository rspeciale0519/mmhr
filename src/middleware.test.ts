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

describe("session refresh middleware", () => {
  const getClaims = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GALLERY_ONLY", "0");
    vi.mocked(createServerClient).mockReset();
    getClaims.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("updates request cookies, response cookies, and cache headers", async () => {
    let downstreamCookie = "";

    vi.mocked(createServerClient).mockImplementation(
      (_url, _key, options) => {
        getClaims.mockImplementation(async () => {
          options.cookies.setAll!(
            [
              {
                name: "sb-access-token",
                value: "refreshed-token",
                options: { httpOnly: true, path: "/" },
              },
            ],
            {
              "cache-control":
                "private, no-cache, no-store, must-revalidate, max-age=0",
              expires: "0",
              pragma: "no-cache",
            },
          );
          const requestCookies = await options.cookies.getAll!();
          downstreamCookie =
            requestCookies?.find(
              (cookie) => cookie.name === "sb-access-token",
            )?.value ?? "";
          return { data: { claims: { sub: "user-123" } }, error: null };
        });

        return { auth: { getClaims } } as never;
      },
    );

    const response = await middleware(
      new NextRequest("https://mmhr.test/home", {
        headers: { cookie: "sb-access-token=stale-token" },
      }),
    );

    expect(downstreamCookie).toBe("refreshed-token");
    expect(response.headers.get("set-cookie")).toContain(
      "sb-access-token=refreshed-token",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  test("passes invalid claims to the entry point without an identity", async () => {
    getClaims.mockResolvedValue({
      data: { claims: null },
      error: new Error("JWT expired"),
    });
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getClaims },
    } as never);

    const response = await middleware(
      new NextRequest("https://mmhr.test/admin"),
    );

    expect(response.status).toBe(200);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  test.each(["/designs", "/home"])(
    "keeps GALLERY_ONLY session-free for %s",
    async (path) => {
      vi.stubEnv("GALLERY_ONLY", "1");

      const response = await middleware(
        new NextRequest(`https://mmhr.test${path}`),
      );

      expect(createServerClient).not.toHaveBeenCalled();
      if (path === "/home") {
        expect(response.headers.get("location")).toBe(
          "https://mmhr.test/designs",
        );
      } else {
        expect(response.headers.get("location")).toBeNull();
      }
    },
  );
});

describe("Server Action request middleware", () => {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: null },
    error: null,
  });

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GALLERY_ONLY", "0");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getClaims },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createServerClient).mockReset();
    getClaims.mockClear();
  });

  test.each([
    ["GET", "http://localhost:3000"],
    ["PUT", "http://localhost:3000"],
    ["POST", null],
    ["POST", "https://evil.example"],
  ])("returns 403 for an unsafe %s action request from %s", async (method, origin) => {
    const requestHeaders = new Headers({ "next-action": "action-id" });
    if (origin) requestHeaders.set("origin", origin);

    const response = await middleware(
      new NextRequest("http://localhost:3000/sign-in", {
        method,
        headers: requestHeaders,
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("passes an exact-origin POST action request", async () => {
    const response = await middleware(
      new NextRequest("http://localhost:3000/sign-in", {
        method: "POST",
        headers: {
          "next-action": "action-id",
          origin: "http://localhost:3000",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });
});
