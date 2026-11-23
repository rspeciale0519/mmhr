// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { task } from "@trigger.dev/sdk";
import { z } from "zod";

const require = createRequire(import.meta.url);
const dependencyOf = (name: string) => createRequire(path.join(process.cwd(), "node_modules", name, "package.json"));

describe("security override compatibility", () => {
  test("preserves the archive extraction API used by giget", async () => {
    const tar = dependencyOf("giget")("tar") as {
      create: (options: { cwd: string; file: string }, files: string[]) => Promise<void>;
      extract: (options: { cwd: string; file: string; onentry: (entry: { path: string }) => void }) => Promise<void>;
    };
    const scratch = await mkdtemp(path.join(tmpdir(), "mmhr-dependency-"));
    try {
      const source = path.join(scratch, "source");
      const target = path.join(scratch, "target");
      await mkdir(path.join(source, "template"), { recursive: true });
      await mkdir(target);
      await writeFile(path.join(source, "template", "example.txt"), "MMHR test fixture");
      const file = path.join(scratch, "template.tar");
      await tar.create({ cwd: source, file }, ["template"]);
      await tar.extract({
        file, cwd: target,
        onentry(entry) { entry.path = entry.path.split("/").splice(1).join("/"); },
      });
      expect(await readFile(path.join(target, "example.txt"), "utf8")).toBe("MMHR test fixture");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  test.each(["@esbuild-kit/core-utils", "trigger.dev"])("preserves TypeScript transforms for %s", async (consumer) => {
    const esbuild = dependencyOf(consumer)("esbuild") as {
      transform: (source: string, options: { loader: string; format: string }) => Promise<{ code: string }>;
    };
    const result = await esbuild.transform("export const count: number = 42;", { loader: "ts", format: "esm" });
    expect(result.code).toContain("count = 42");
    expect(result.code).not.toContain(": number");
  });

  test("loads the job SDK with the patched tracing and socket dependencies", () => {
    expect(typeof task).toBe("function");
    const client = dependencyOf("@trigger.dev/core")("socket.io-client") as { io: unknown };
    expect(typeof client.io).toBe("function");
    const tracing = dependencyOf("@trigger.dev/core")("@opentelemetry/core") as { W3CBaggagePropagator: new () => { fields: () => string[] } };
    expect(new tracing.W3CBaggagePropagator().fields()).toEqual(["baggage"]);
    expect(typeof require("tar").extract).toBe("function");
  });

  test("shares the patched zod with trigger.dev CLI option validation", () => {
    expect(dependencyOf("trigger.dev").resolve("zod")).toBe(require.resolve("zod"));
    const { fromZodError } = dependencyOf("trigger.dev")("zod-validation-error") as {
      fromZodError: (error: z.ZodError) => { message: string };
    };
    const options = z.object({ logLevel: z.enum(["debug", "info", "log", "warn", "error", "none"]).default("log") });
    expect(options.parse({})).toEqual({ logLevel: "log" });
    const result = options.safeParse({ logLevel: "verbose" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fromZodError(result.error).message).toContain("logLevel");
  });

  // TODO: remove package.json overrides["effect@3"] once @trigger.dev/schema-to-json
  // requires effect >= 3.22.1 (GHSA-7589-6fvf-x4pw).
  test("pins effect to the patched 3.22.1+ for trigger.dev schema conversion", async () => {
    const pkg = JSON.parse(
      await readFile(dependencyOf("@trigger.dev/schema-to-json").resolve("effect/package.json"), "utf8"),
    ) as { name: string; version: string };
    expect(pkg.name).toBe("effect");
    const [major, minor, patch] = pkg.version.split(".").map(Number);
    const atLeast3221 =
      major > 3 || (major === 3 && (minor > 22 || (minor === 22 && patch >= 1)));
    expect(atLeast3221).toBe(true);
  });

  // TODO: remove package.json overrides["@hono/node-server"] once trigger.dev /
  // @modelcontextprotocol/sdk requires @hono/node-server >= 2.1.3.
  test("pins @hono/node-server to the patched 2.1.3+ for trigger.dev MCP", async () => {
    const entry = dependencyOf("@modelcontextprotocol/sdk").resolve("@hono/node-server");
    const pkg = JSON.parse(await readFile(path.join(path.dirname(entry), "..", "package.json"), "utf8")) as {
      name: string;
      version: string;
    };
    expect(pkg.name).toBe("@hono/node-server");
    const [major, minor, patch] = pkg.version.split(".").map(Number);
    const atLeast213 =
      major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 3)));
    expect(atLeast213).toBe(true);
  });
});
