import { afterEach, describe, expect, test, vi } from "vitest";

import { getSiteMetadataBase } from "./site-metadata";

describe("site metadata origin", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("accepts a canonical HTTPS application origin", () => {
    expect(
      getSiteMetadataBase({ NEXT_PUBLIC_APP_URL: "https://app.example.test/" }),
    )?.toEqual(new URL("https://app.example.test"));
  });

  test("accepts the local HTTP development origin", () => {
    expect(
      getSiteMetadataBase({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
    )?.toEqual(new URL("http://localhost:3000"));
  });

  test.each([
    undefined,
    "https://app.example.test/path",
    "https://app.example.test/?preview=1",
    "http://app.example.test",
  ])("rejects an unsafe metadata origin: %s", (value) => {
    expect(getSiteMetadataBase({ NEXT_PUBLIC_APP_URL: value })).toBeUndefined();
  });
});
