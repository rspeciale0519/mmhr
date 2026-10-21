import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

test("next config disables the framework fingerprint and registers security headers", () => {
  const source = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

  expect(source).toContain("poweredByHeader: false");
  expect(source).toContain("APPLICATION_SECURITY_HEADERS");
  expect(source).toContain("async headers()");
});
