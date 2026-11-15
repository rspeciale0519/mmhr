import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { config, proxy } from "@/proxy";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

describe("public-release middleware", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");
    vi.stubEnv("PUBLIC_RELEASE_APPROVAL_ID", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", "");
    vi.mocked(createServerClient).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each(["/", "/sign-up", "/admin", "/report.png?download=1"])(
    "blocks the application route %s before session work",
    async (path) => {
      const response = await proxy(
        new NextRequest(`https://mmhr.test${path}`),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
      // The holding page keeps its own, stricter policy.
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  test("blocks HEAD requests", async () => {
    const response = await proxy(
      new NextRequest("https://mmhr.test/", { method: "HEAD" }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-robots-tag")).toContain("nosnippet");
  });

  test.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "blocks %s requests before action or session work",
    async (method) => {
      const response = await proxy(
        new NextRequest("https://mmhr.test/", {
          method,
          headers: method === "POST" ? { "next-action": "action-id" } : {},
        }),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      // Stricter than the application baseline, and the baseline must not replace it.
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  test("serves robots.txt without starting a session", async () => {
    const response = await proxy(
      new NextRequest("https://mmhr.test/robots.txt?cache=miss"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Disallow: /");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("returns JSON for blocked API routes", async () => {
    const response = await proxy(
      new NextRequest("https://mmhr.test/api/trpc/example"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.json()).toEqual({ error: "service_unavailable" });
  });

  test("does not redirect the preview home page to the archived gallery", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    const home = await proxy(new NextRequest("https://mmhr.test/?_vercel_share=x"));
    expect(home.status).toBe(503);
    expect(home.headers.get("location")).toBeNull();
    expect(home.headers.get("x-frame-options")).toBe("DENY");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test.each([
    ["GET", "/gallery"],
    ["GET", "/gallery/lumen"],
    ["GET", "/gallery-previews/stack.jpg"],
    ["POST", "/api/gallery/feedback"],
    ["POST", "/api/gallery/recipes"],
  ])("no longer passes %s %s through the release gate on a preview", async (method, path) => {
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = await proxy(new NextRequest(`https://mmhr.test${path}`, { method }));
    expect(response.status).toBe(503);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("an environment flag cannot bypass the checked-in release gate", async () => {
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "1");
    vi.stubEnv("PUBLIC_RELEASE_APPROVAL_ID", "unreviewed-release");

    const response = await proxy(new NextRequest("https://mmhr.test/"));

    expect(response.status).toBe(503);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("opens pages on a develop preview with the exact flag and keeps no-index", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", "1");
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getClaims: vi.fn().mockResolvedValue({ data: null, error: null }) },
    } as never);

    const response = await proxy(new NextRequest("https://mmhr.test/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive, nosnippet",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(createServerClient).toHaveBeenCalledTimes(1);
  });

  test("keeps launch-hidden pages hidden and no-index on an opened preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", "1");
    vi.stubEnv("MMHR_LAUNCH_CANDIDATE", "");

    const response = await proxy(new NextRequest("https://mmhr.test/admin/finance/invoices"));

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://mmhr.test/__not-in-launch");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test.each([
    ["preview", ""],
    ["preview", "true"],
    ["preview", "0"],
    ["production", "1"],
    ["", "1"],
  ])("keeps VERCEL_ENV=%j with flag %j behind the release gate", async (vercelEnvironment, flag) => {
    vi.stubEnv("VERCEL_ENV", vercelEnvironment);
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", flag);

    const response = await proxy(new NextRequest("https://mmhr.test/"));

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("This site is not available yet.");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("keeps the preview flag from opening a deployment with VERCEL_ENV removed", async () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", "1");

    const response = await proxy(new NextRequest("https://mmhr.test/"));

    expect(response.status).toBe(503);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("matches image-like application paths", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$).*)",
    ]);
  });

  test("does not let asset-like prefixes bypass the release matcher", () => {
    const matcher = new RegExp(`^${config.matcher[0]}`);

    expect(matcher.test("/favicon.ico/hidden")).toBe(true);
    expect(matcher.test("/_next/static-attacker/page")).toBe(true);
    expect(matcher.test("/_next/image-proxy/page")).toBe(true);
    expect(matcher.test("/_next/static/chunk.js")).toBe(false);
    expect(matcher.test("/_next/image")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);
  });
});

describe("session refresh middleware", () => {
  const getClaims = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
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
                options: { path: "/" },
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

    const response = await proxy(
      new NextRequest("https://mmhr.test/home", {
        headers: { cookie: "sb-access-token=stale-token" },
      }),
    );

    expect(downstreamCookie).toBe("refreshed-token");
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("sb-access-token=refreshed-token");
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Secure/i);
    // The browser Supabase client reads this cookie for MFA, so it must stay
    // readable from document.cookie.
    expect(setCookie).not.toMatch(/HttpOnly/i);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  test("keeps local HTTP session cookies usable without the Secure flag", async () => {
    vi.mocked(createServerClient).mockImplementation(
      (_url, _key, options) => {
        getClaims.mockImplementation(async () => {
          options.cookies.setAll!(
            [{ name: "sb-access-token", value: "local-token", options: { path: "/" } }],
            {},
          );
          return { data: { claims: { sub: "user-123" } }, error: null };
        });

        return { auth: { getClaims } } as never;
      },
    );

    const response = await proxy(
      new NextRequest("http://localhost:3000/home", {
        headers: { cookie: "sb-access-token=stale-token" },
      }),
    );

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("sb-access-token=local-token");
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
  });

  test("passes invalid claims to the entry point without an identity", async () => {
    getClaims.mockResolvedValue({
      data: { claims: null },
      error: new Error("JWT expired"),
    });
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getClaims },
    } as never);

    const response = await proxy(
      new NextRequest("https://mmhr.test/admin"),
    );

    expect(response.status).toBe(200);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });
});

describe("Server Action request middleware", () => {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: null },
    error: null,
  });

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.mocked(createServerClient).mockReset();
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

    const response = await proxy(
      new NextRequest("http://localhost:3000/sign-in", {
        method,
        headers: requestHeaders,
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("passes an exact-origin POST action request", async () => {
    const response = await proxy(
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

describe("launch surface proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MMHR_LAUNCH_CANDIDATE", "");
    vi.mocked(createServerClient).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each(["/admin/finance/invoices", "/documents", "/customer/demos", "/admin/contracts"])(
    "renders not-found for the hidden page %s without session work",
    async (path) => {
      const response = await proxy(new NextRequest(`https://mmhr.test${path}`));

      expect(response.headers.get("x-middleware-rewrite")).toBe("https://mmhr.test/__not-in-launch");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  test.each(["/api/finance/invoices/originals", "/api/documents/access", "/api/trpc/intakes.read,managedFinance.list"])(
    "returns a private 404 for the hidden API %s",
    async (path) => {
      const response = await proxy(new NextRequest(`https://mmhr.test${path}`, { method: "POST" }));

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(await response.json()).toEqual({ error: "not_found" });
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  test.each([
    "/about",
    "/blog",
    "/blog/some-post",
    "/broker-model",
    "/case-studies",
    "/case-studies/some-study",
    "/faq",
    "/partners/brokers-consultants",
    "/partners/pe-vc",
    "/partners/software-vendors",
    "/platform",
    "/resources",
    "/resources/hris-landscape-report",
    "/resources/partner-finder",
    "/resources/requirements-builder",
    "/services",
    "/transparency",
  ])("renders not-found for the unapproved marketing page %s in both candidates", async (path) => {
    for (const candidate of ["A", "B"]) {
      vi.stubEnv("MMHR_LAUNCH_CANDIDATE", candidate);
      const response = await proxy(new NextRequest(`https://mmhr.test${path}`));

      expect(response.headers.get("x-middleware-rewrite"), candidate).toBe("https://mmhr.test/__not-in-launch");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    }
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test.each(["/", "/contact", "/privacy", "/terms", "/platformx", "/blogging"])(
    "passes the launch path %s through to session work",
    async (path) => {
      vi.mocked(createServerClient).mockReturnValue({
        auth: { getClaims: vi.fn().mockResolvedValue({ data: null, error: null }) },
      } as never);

      const response = await proxy(new NextRequest(`https://mmhr.test${path}`));

      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
      // Local development keeps its indexable state.
      expect(response.headers.get("x-robots-tag")).toBeNull();
      expect(createServerClient).toHaveBeenCalledTimes(1);
    },
  );

  test("shows Candidate B pages only when Candidate B is selected", async () => {
    vi.stubEnv("MMHR_LAUNCH_CANDIDATE", "B");
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getClaims: vi.fn().mockResolvedValue({ data: null, error: null }) },
    } as never);

    const response = await proxy(new NextRequest("https://mmhr.test/customer/demos"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(createServerClient).toHaveBeenCalledTimes(1);
  });
});
