// @vitest-environment node
import { describe, expect, test } from "vitest";

import { assertScratchCliVersions, disableScratchSchemaCache, disableScratchService, resolveScratchGoCompanion } from "./security-command-api-cli";

function files(executables: string[], targets: Record<string, string> = {}, texts: Record<string, string> = {}) {
  return {
    executable: async (target: string) => executables.includes(target),
    realpath: async (target: string) => targets[target] ?? target,
    readText: async (target: string) => {
      if (!(target in texts)) throw new Error("missing fixture file");
      return texts[target]!;
    },
  };
}

describe("installed Supabase companion selection", () => {
  test("uses the selected Unix installation after resolving its symlink", async () => {
    const actual = await resolveScratchGoCompanion({
      platform: "linux", searchPath: "/usr/local/bin:/usr/bin",
      files: files(["/usr/local/bin/supabase", "/opt/supabase/supabase-go"], { "/usr/local/bin/supabase": "/opt/supabase/supabase" }),
    });
    expect(actual).toEqual({ shellExecutable: "/opt/supabase/supabase", goExecutable: "/opt/supabase/supabase-go" });
  });

  test("resolves an installed Scoop shim without executing its contents", async () => {
    const actual = await resolveScratchGoCompanion({
      platform: "win32", searchPath: "C:\\tools\\shims;C:\\Windows",
      files: files(["C:\\tools\\shims\\supabase.exe", "C:\\tools\\apps\\supabase-go.exe"], {}, {
        "C:\\tools\\shims\\supabase.shim": 'path = "C:\\tools\\apps\\supabase.exe"\r\n',
      }),
    });
    expect(actual.goExecutable).toBe("C:\\tools\\apps\\supabase-go.exe");
  });

  test.each(['path = "..\\other\\supabase.exe"', 'path = "C:\\tools\\other.exe"', 'run = "C:\\tools\\supabase.exe"'])(
    "rejects an invalid shim target (%#)", async (shim) => {
      await expect(resolveScratchGoCompanion({
        platform: "win32", searchPath: "C:\\tools\\shims",
        files: files(["C:\\tools\\shims\\supabase.exe"], {}, { "C:\\tools\\shims\\supabase.shim": shim }),
      })).rejects.toThrow("does not identify");
    },
  );

  test("does not substitute a different installation when the selected companion is absent", async () => {
    await expect(resolveScratchGoCompanion({
      platform: "linux", searchPath: "/first:/second",
      files: files(["/first/supabase", "/second/supabase", "/second/supabase-go"]),
    })).rejects.toThrow("no Go companion");
  });

  test("rejects a companion symlink outside the selected installation", async () => {
    await expect(resolveScratchGoCompanion({
      platform: "linux", searchPath: "/first",
      files: files(["/first/supabase", "/first/supabase-go"], { "/first/supabase-go": "/other/supabase-go" }),
    })).rejects.toThrow("does not belong");
  });

  test("requires two matching stable versions without relying on an error payload", () => {
    expect(() => assertScratchCliVersions("2.111.0\n", "2.111.0\n")).not.toThrow();
    expect(() => assertScratchCliVersions("2.111.0", "2.110.0")).toThrow("matching installed");
    expect(() => assertScratchCliVersions("unknown", "unknown")).toThrow("matching installed");
  });

  test("disables only the optional catalog cache in the scratch configuration", () => {
    const original = "[auth]\r\nenabled = true\r\n[experimental.pgdelta]\r\nenabled = true # cache\r\n[api]\r\nenabled = true\r\n";
    const expected = original.replace("enabled = true # cache", "enabled = false # cache");
    expect(disableScratchSchemaCache(original)).toBe(expected);
    expect(disableScratchSchemaCache(expected)).toBe(expected);
  });

  test.each(["[auth]\nenabled = true", "[experimental.pgdelta]\n# no switch", "[experimental.pgdelta]\nenabled = true\nenabled = false"])(
    "refuses an absent or ambiguous scratch cache switch (%#)", (config) => {
      expect(() => disableScratchSchemaCache(config)).toThrow("not found exactly once");
    },
  );

  test("disables one optional scratch service without changing another section", () => {
    const original = "[realtime]\r\nenabled = true\r\n[studio]\r\nenabled = true\r\n";
    expect(disableScratchService(original, "realtime")).toBe(
      "[realtime]\r\nenabled = false\r\n[studio]\r\nenabled = true\r\n",
    );
  });

  test.each(["[studio]\nenabled = true", "[realtime]\n# no switch", "[realtime]\nenabled = true\nenabled = false"])(
    "refuses an absent or ambiguous scratch service switch (%#)", (config) => {
      expect(() => disableScratchService(config, "realtime")).toThrow("not found exactly once");
    },
  );
});
