import { describe, expect, test } from "vitest";

import {
  createPublicReleaseBlockResponse,
  isPublicReleaseBlocked,
} from "@/lib/public-release";

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

  test("returns a machine-readable block for API routes", async () => {
    const response = createPublicReleaseBlockResponse("/api/trpc");

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "service_unavailable" });
  });
});
