import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function projectPath(file: string) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function executableFiles() {
  const sourceFiles = walk(path.join(root, "src")).filter(
    (file) => /\.(?:[cm]?[jt]sx?)$/.test(file) && !file.includes(".test."),
  );
  const commandFiles = [
    ...walk(path.join(root, "scripts")),
    ...walk(path.join(root, "src", "server", "commands")),
  ].filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file));
  const workflowFiles = walk(path.join(root, ".github", "workflows")).filter(
    (file) => /\.ya?ml$/.test(file),
  );
  const configuredFiles = [
    ".env.example",
    "package.json",
    "next.config.ts",
    "trigger.config.ts",
    "drizzle.config.ts",
    "vercel.json",
    "sentry.server.config.ts",
    "sentry.edge.config.ts",
    "supabase/config.toml",
  ]
    .map((file) => path.join(root, file))
    .filter(existsSync);

  return [...new Set([
    ...sourceFiles,
    ...commandFiles,
    ...workflowFiles,
    ...configuredFiles,
  ])].sort();
}

let executableSourceCache: string | undefined;

function executableSource() {
  executableSourceCache ??= executableFiles()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  return executableSourceCache;
}

describe("R1 source security contract", () => {
  test("scans each current executable configuration class", () => {
    const files = executableFiles().map(projectPath);

    expect(files).toEqual(
      expect.arrayContaining([
        ".env.example",
        ".github/workflows/ci.yml",
        "drizzle.config.ts",
        "next.config.ts",
        "package.json",
        "sentry.edge.config.ts",
        "sentry.server.config.ts",
        "supabase/config.toml",
        "trigger.config.ts",
        "vercel.json",
      ]),
    );
  });

  test("contains no impersonation entry point or actor override", () => {
    expect(executableSource()).not.toMatch(
      /impersonat|masquerad|act[_-]?as|as[_-]?user|switch[_-]?user|assume[_-]?identity|actor[_-]?override|user[_-]?override/i,
    );
  });

  test("contains no request-based actor override input", () => {
    expect(executableSource()).not.toMatch(
      /(?:headers?|searchParams)\s*\.\s*get\s*\(\s*["'](?:x-(?:user|actor|identity)[^"']*|(?:user|actor|identity)Id)["']/i,
    );
  });

  test("does not authorize from an unverified session", () => {
    expect(executableSource()).not.toMatch(/\.auth\.getSession\s*\(/);
  });

  test("does not add an extra Server Action origin", () => {
    const nextConfig = readFileSync(path.join(root, "next.config.ts"), "utf8");

    expect(nextConfig).not.toContain("allowedOrigins");
  });

  test("keeps the direct database pool outside request entry points", () => {
    const requestFiles = [
      ...walk(path.join(root, "src", "app")),
      ...walk(path.join(root, "src", "server", "trpc")),
      path.join(root, "src", "middleware.ts"),
    ].filter(
      (file) =>
        existsSync(file) &&
        /\.(?:[cm]?[jt]sx?)$/.test(file) &&
        !file.includes(".test."),
    );
    const requestSource = requestFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(requestSource).not.toMatch(
      /from\s+["']@\/server\/db(?:\/index)?["']/,
    );
  });
});
