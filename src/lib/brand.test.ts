import { expect, test } from "vitest";
import { brand } from "@/lib/brand";

// The brand name is deliberately indirected (decision D8): the working name may
// change before launch, so nothing should hardcode it.
test("brand exposes a non-empty name", () => {
  expect(brand.name.length).toBeGreaterThan(0);
});

test("brand name falls back when the env var is unset", () => {
  expect(brand.name).toBe(process.env.NEXT_PUBLIC_BRAND_NAME ?? "MatchMaker HR");
});
