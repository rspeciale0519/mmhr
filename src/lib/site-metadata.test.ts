import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getMarketingPageMetadata,
  getSiteMetadataBase,
  getSiteSocialMetadata,
} from "./site-metadata";

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

describe("site social metadata", () => {
  test("uses the configured brand without adding unapproved claims", () => {
    expect(getSiteSocialMetadata("MatchMaker HR", "Buyer-side HRIS brokerage.")).toEqual({
      openGraph: {
        type: "website",
        title: "MatchMaker HR",
        description: "Buyer-side HRIS brokerage.",
        siteName: "MatchMaker HR",
      },
      twitter: {
        card: "summary",
        title: "MatchMaker HR",
        description: "Buyer-side HRIS brokerage.",
      },
    });
  });

  test("keeps canonical and social URLs scoped to each marketing route", () => {
    const metadata = getMarketingPageMetadata(
      "/resources/requirements-builder",
      "Requirements Builder — MatchMaker HR",
      "Build requirements before vendor demos.",
    );

    expect(metadata.alternates?.canonical).toBe(
      "/resources/requirements-builder",
    );
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "/resources/requirements-builder",
      title: "Requirements Builder — MatchMaker HR",
      siteName: "MatchMaker HR",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary",
      title: "Requirements Builder — MatchMaker HR",
    });
  });
});
