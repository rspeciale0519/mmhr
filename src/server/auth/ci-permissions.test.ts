import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

test("CI grants the default token only repository contents read at the workflow level", () => {
  const source = readFileSync(
    path.join(process.cwd(), ".github/workflows/ci.yml"),
    "utf8",
  );

  // Anchored at column 0 so an indented job-level block cannot satisfy it.
  expect(source).toMatch(/^permissions:\r?\n {2}contents: read\r?$/m);
});
