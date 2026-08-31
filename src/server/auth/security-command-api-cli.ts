import { access, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

type Files = {
  executable: (target: string) => Promise<boolean>;
  realpath: (target: string) => Promise<string>;
  readText: (target: string) => Promise<string>;
};
const installedFiles: Files = {
  async executable(target) {
    try {
      await access(target, constants.X_OK);
      return (await stat(target)).isFile();
    } catch { return false; }
  },
  realpath,
  readText: (target) => readFile(target, "utf8"),
};

/** Resolve only an existing companion from the selected CLI installation. */
export async function resolveScratchGoCompanion(options: {
  platform?: NodeJS.Platform;
  searchPath?: string;
  files?: Files;
} = {}) {
  const windows = (options.platform ?? process.platform) === "win32";
  const paths = windows ? path.win32 : path.posix;
  const files = options.files ?? installedFiles;
  const shellName = windows ? "supabase.exe" : "supabase";
  const companionName = windows ? "supabase-go.exe" : "supabase-go";
  const directories = (options.searchPath ?? process.env.PATH ?? "").split(windows ? ";" : ":").filter(Boolean);
  let selected: string | null = null;
  for (const directory of directories) {
    const target = paths.resolve(directory, shellName);
    if (await files.executable(target)) { selected = target; break; }
  }
  if (!selected) throw new Error("The installed Supabase CLI was not found for the scratch API test");
  let resolved = await files.realpath(selected);
  let companion = paths.join(paths.dirname(resolved), companionName);
  if (!await files.executable(companion) && windows) {
    // Scoop keeps a small executable shim beside a plain-text target file.
    // Read that exact companion file. Never evaluate its contents as a command.
    let shim: string;
    try { shim = await files.readText(paths.join(paths.dirname(selected), "supabase.shim")); }
    catch { throw new Error("The selected Supabase installation has no Go companion"); }
    const target = shim.length < 4_096 ? shim.match(/^path = "([^"\r\n]+)"\r?$/m)?.[1] : undefined;
    if (!target || !paths.isAbsolute(target) || paths.basename(target).toLowerCase() !== shellName) {
      throw new Error("The Supabase shim does not identify its installed executable");
    }
    resolved = await files.realpath(target);
    companion = paths.join(paths.dirname(resolved), companionName);
  }
  if (!await files.executable(companion)) throw new Error("The selected Supabase installation has no Go companion");
  const goExecutable = await files.realpath(companion);
  if (paths.dirname(goExecutable) !== paths.dirname(resolved) || paths.basename(goExecutable) !== companionName) {
    throw new Error("The Supabase Go companion does not belong to the selected installation");
  }
  return { shellExecutable: selected, goExecutable };
}

export function assertScratchCliVersions(shellOutput: string, companionOutput: string) {
  const shell = shellOutput.trim();
  const companion = companionOutput.trim();
  if (!/^\d+\.\d+\.\d+$/.test(shell) || shell !== companion) {
    throw new Error("Scratch API tests require matching installed Supabase CLI versions");
  }
}

export function disableScratchSchemaCache(config: string) {
  let inSection = false;
  let sections = 0;
  let switches = 0;
  const result = config.split("\n").map((line) => {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?\r?$/);
    if (header) {
      inSection = header[1] === "experimental.pgdelta";
      if (inSection) sections++;
    }
    if (!inSection || !/^\s*enabled\s*=\s*(?:true|false)\s*(?:#.*)?\r?$/.test(line)) return line;
    switches++;
    return line.replace(/\b(?:true|false)\b/, "false");
  }).join("\n");
  if (sections !== 1 || switches !== 1) throw new Error("The scratch pg-delta cache setting was not found exactly once");
  return result;
}
