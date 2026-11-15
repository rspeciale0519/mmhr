import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createPublicReleaseBlockResponse,
  createPublicReleaseRobotsResponse,
  getPublicReleaseRobotsMetadata,
  isPublicIndexingBlocked,
  isPublicReleaseBlocked,
} from "@/lib/public-release";

describe("develop preview release flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("opens pages on a Vercel preview with the exact flag, but keeps indexing blocked", () => {
    const environment = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      MMHR_PREVIEW_RELEASE_ENABLED: "1",
    };

    expect(isPublicReleaseBlocked(environment)).toBe(false);
    expect(isPublicIndexingBlocked(environment)).toBe(true);
  });

  test.each([undefined, "", "true", "0", " 1", "1 ", "yes"])(
    "keeps a preview blocked when the flag is %j",
    (flag) => {
      expect(
        isPublicReleaseBlocked({
          NODE_ENV: "production",
          VERCEL_ENV: "preview",
          MMHR_PREVIEW_RELEASE_ENABLED: flag,
        }),
      ).toBe(true);
    },
  );

  test.each([undefined, "", "production", "development", "Preview", "staging"])(
    "keeps VERCEL_ENV %j blocked even with the flag set",
    (vercelEnvironment) => {
      const environment = {
        NODE_ENV: "production",
        VERCEL_ENV: vercelEnvironment,
        MMHR_PREVIEW_RELEASE_ENABLED: "1",
      };

      expect(isPublicReleaseBlocked(environment)).toBe(true);
      expect(isPublicIndexingBlocked(environment)).toBe(true);
    },
  );

  test("the flag cannot replace the checked-in production approval", () => {
    expect(
      isPublicReleaseBlocked(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "production",
          MMHR_PREVIEW_RELEASE_ENABLED: "1",
          PUBLIC_RELEASE_ENABLED: "1",
          PUBLIC_RELEASE_APPROVAL_ID: "unreviewed-release",
        },
        "r2a-approved",
      ),
    ).toBe(true);
  });

  test("does not change local development", () => {
    const environment = {
      NODE_ENV: "development",
      VERCEL_ENV: "preview",
      MMHR_PREVIEW_RELEASE_ENABLED: "0",
    };

    expect(isPublicReleaseBlocked(environment)).toBe(false);
    expect(isPublicIndexingBlocked(environment)).toBe(false);
  });

  test("page metadata stays no-index on an opened preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", "1");

    expect(isPublicReleaseBlocked()).toBe(false);
    expect(getPublicReleaseRobotsMetadata()).toEqual({
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    });
  });
});

describe("public release control", () => {
  test("does not block local development", () => {
    expect(
      isPublicReleaseBlocked({
        NODE_ENV: "development",
        PUBLIC_RELEASE_ENABLED: "0",
      }),
    ).toBe(false);
  });

  test("blocks production until environment and checked-in approvals match", () => {
    expect(isPublicReleaseBlocked({ NODE_ENV: "production" })).toBe(true);
    expect(
      isPublicReleaseBlocked({
        NODE_ENV: "production",
        PUBLIC_RELEASE_ENABLED: "1",
      }),
    ).toBe(true);
    expect(
      isPublicReleaseBlocked(
        {
          NODE_ENV: "production",
          PUBLIC_RELEASE_APPROVAL_ID: "r2a-approved",
          PUBLIC_RELEASE_ENABLED: "1",
        },
        "r2a-approved",
      ),
    ).toBe(false);
    expect(
      isPublicReleaseBlocked(
        {
          NODE_ENV: "production",
          PUBLIC_RELEASE_APPROVAL_ID: "wrong-release",
          PUBLIC_RELEASE_ENABLED: "1",
        },
        "r2a-approved",
      ),
    ).toBe(true);
  });

  test("keeps crawler metadata blocked until release approval", () => {
    expect(getPublicReleaseRobotsMetadata(true)).toEqual({
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    });
  });

  test("returns indexable crawler metadata after release approval", () => {
    expect(getPublicReleaseRobotsMetadata(false)).toEqual({
      index: true,
      follow: true,
    });
  });

  test("serves a crawler block while production is closed", async () => {
    const response = createPublicReleaseBlockResponse("/robots.txt");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  test("returns a no-store holding page for application routes", async () => {
    const response = createPublicReleaseBlockResponse("/");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noarchive");
    expect(await response.text()).toContain("This site is not available yet.");
  });

  test("uses an escaped configured brand on the holding page", async () => {
    const response = createPublicReleaseBlockResponse(
      "/",
      `Acme <People> & "Co's"`,
    );
    const html = await response.text();

    expect(html).toContain(
      "<title>Acme &lt;People&gt; &amp; &quot;Co&#39;s&quot;</title>",
    );
    expect(html).toContain(
      "<p>Acme &lt;People&gt; &amp; &quot;Co&#39;s&quot; is preparing a new release.</p>",
    );
    expect(html).not.toContain("<People>");
  });

  test("returns a machine-readable block for API routes", async () => {
    const response = createPublicReleaseBlockResponse("/api/trpc");

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "service_unavailable" });
  });

  test("keeps non-GET robots methods inside the release block", async () => {
    const response = createPublicReleaseBlockResponse(
      "/robots.txt",
      undefined,
      "POST",
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  test("allows indexing rules when the release is unlocked", async () => {
    const response = createPublicReleaseRobotsResponse(false);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(await response.text()).toBe("User-agent: *\nAllow: /\n");
  });
});
