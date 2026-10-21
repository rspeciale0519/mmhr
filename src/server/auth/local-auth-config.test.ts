import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

test("local email confirmation and reset are not throttled at one second", () => {
  const source = readFileSync(
    path.join(process.cwd(), "supabase/config.toml"),
    "utf8",
  );
  const email = source.split("[auth.email]")[1]?.split("[auth.sms]")[0] ?? "";

  expect(email).toMatch(/max_frequency = "60s"/);
  expect(email).not.toMatch(/max_frequency = "1s"/);
});
