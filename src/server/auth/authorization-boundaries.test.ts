import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const poolFile = "src/server/db/index.ts";
const identityWorkerFile = "src/server/integrations/auth-admin/worker.ts";
const runtimeConfigFiles = new Set(["sentry.server.config.ts", "sentry.edge.config.ts"]);
const fixtureFiles = new Set([
  "src/server/db/test/migration-owner.ts",
  "src/server/db/r1-migration-rehearsal.ts",
  "src/server/db/r1-legacy-snapshot.ts",
  "src/server/db/r1-populated-security-cases.ts",
  "src/server/db/r1-permission-rehearsal-cases.ts",
  "src/server/db/r1-security-command-fixtures.ts",
  "src/server/db/r1-security-command-bootstrap-cases.ts",
  "src/server/db/r1-security-command-capacity-cases.ts",
  "src/server/db/r1-security-command-concurrency-cases.ts",
  "src/server/db/r1-security-command-migration-cases.ts",
  "src/server/db/r1-security-command-permission-fixtures.ts",
  "src/server/db/r1-security-command-override-cases.ts",
  "src/server/db/r1-security-command-delegation-cases.ts",
  "src/server/db/r1-security-command-administration-fixtures.ts",
  "src/server/db/r1-security-command-administration-cases.ts",
  "src/server/db/r1-security-command-read-cases.ts",
  "src/server/db/r1-security-command-identity-cases.ts",
  "src/server/db/r1-security-command-role-lifetime-cases.ts",
  "src/server/db/r1-security-command-role-source-cases.ts",
  "src/server/db/r1-security-command-deny-source-cases.ts",
  "src/server/db/r1-security-command-role-revocation-cases.ts",
  "src/server/db/r1-identity-intent-fixtures.ts",
  "src/server/db/r1-identity-intent-history-fixtures.ts",
  "src/server/db/r1-identity-intent-dispatch-cases.ts",
  "src/server/db/r1-identity-intent-result-cases.ts",
  "src/server/db/r1-identity-intent-reconciliation-cases.ts",
  "src/server/db/r1-identity-intent-concurrency-cases.ts",
  "src/server/db/r1-identity-intent-migration-cases.ts",
  "src/server/db/r1-identity-intent-adapter-cases.ts",
  "src/server/db/r1-recovery-command-fixtures.ts",
  "src/server/db/r1-recovery-command-presence-cases.ts",
  "src/server/db/r1-recovery-command-request-cases.ts",
  "src/server/db/r1-recovery-command-decision-cases.ts",
  "src/server/db/r1-recovery-command-end-cases.ts",
  "src/server/db/r1-recovery-command-atomic-cases.ts",
  "src/server/db/r1-recovery-command-access-cases.ts",
  "src/server/db/r1-recovery-command-concurrency-cases.ts",
  "src/server/db/r1-recovery-mfa-fixtures.ts",
  "src/server/db/r1-recovery-mfa-cases.ts",
  "src/server/db/r1-recovery-mfa-registration-cases.ts",
  "src/server/db/r1-recovery-mfa-reactivation-cases.ts",
  "src/server/db/r1-recovery-mfa-concurrency-cases.ts",
  "src/server/db/r1-recovery-mfa-migration-cases.ts",
  "src/server/db/r1-identity-worker-fixtures.ts",
  "src/server/db/r1-identity-worker-prefix.ts",
  "src/server/db/r1-identity-worker-candidate-cases.ts",
  "src/server/db/r1-identity-worker-race-cases.ts",
  "src/server/db/r1-identity-worker-access-cases.ts",
  "src/server/db/r1-identity-worker-migration-cases.ts",
  "src/server/db/r1-recovery-mfa-prefix.ts",
  "src/server/db/r1-recovery-mfa-api-fixtures.ts",
  "src/server/auth/permission-test-fixtures.ts",
  "src/server/auth/security-command-api-fixtures.ts",
  "src/server/auth/security-command-api-isolation.ts",
  "src/server/auth/security-command-api-docker-policy.ts",
  "src/server/auth/security-command-api-docker-guard.ts",
  "src/server/auth/security-command-api-cli.ts",
  "src/test/setup.ts",
]);
const directDatabaseFiles = new Set([
  poolFile,
  "src/server/db/test/migration-owner.ts",
  "src/server/db/r1-migration-rehearsal.ts",
  "src/server/db/r1-security-command-migration-cases.ts",
  "src/server/db/r1-security-command-fixtures.ts",
  "src/server/db/r1-identity-intent-migration-cases.ts",
  "src/server/db/db.integration.test.ts",
  "src/server/db/r1-recovery-mfa-prefix.ts",
  "src/server/auth/rls.integration.test.ts",
  "src/server/auth/r1-security.integration.test.ts",
  "src/server/db/r1-recovery-mfa-migration-cases.ts",
  "src/server/db/r1-identity-worker-fixtures.ts",
  "src/server/db/r1-identity-worker-prefix.ts",
  "src/server/db/r1-identity-worker-migration-cases.ts",
  "src/server/auth/permission-test-fixtures.ts",
]);
// These are existing test capabilities, not allowances for future adapters.
const credentialFiles: Record<string, readonly string[]> = {
  [poolFile]: ["DATABASE_URL"],
  [identityWorkerFile]: ["SUPABASE_SERVICE_ROLE_KEY"],
  "src/server/db/test/migration-owner.ts": ["TEST_MIGRATION_DATABASE_URL"],
  "src/server/db/db.integration.test.ts": ["TEST_MIGRATION_DATABASE_URL"],
  "src/server/auth/auth.integration.test.ts": ["SUPABASE_SERVICE_ROLE_KEY"],
  "src/server/auth/rls.integration.test.ts": [
    "SUPABASE_SERVICE_ROLE_KEY", "TEST_MIGRATION_DATABASE_URL",
  ],
  "src/server/auth/r1-security.integration.test.ts": [
    "TEST_MIGRATION_DATABASE_URL",
  ],
  "src/server/auth/permission-test-fixtures.ts": [
    "SUPABASE_SERVICE_ROLE_KEY", "TEST_MIGRATION_DATABASE_URL", "DATABASE_URL",
  ],
};
const codeExtension = /\.(?:[cm]?[jt]sx?)$/;
const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
type Sources = Map<string, string>;
type Violation = { file: string; line: number; rule: string; target: string };

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function isTestOnly(file: string): boolean {
  return /\.test\.[cm]?[jt]sx?$/.test(file) || fixtureFiles.has(file) ||
    file.startsWith("src/server/db/test/") || file.startsWith("src/test/");
}

function localTarget(file: string, specifier: string, sources: Sources): string | null {
  const clean = specifier.replaceAll("\\", "/").split(/[?#]/)[0];
  const base = clean.startsWith("@/")
    ? path.posix.normalize(`src/${clean.slice(2)}`)
    : clean.startsWith(".")
      ? path.posix.join(path.posix.dirname(file), clean)
      : null;
  if (!base) return null;
  const stem = base.replace(codeExtension, "");
  const candidates = [base, ...extensions.map((ext) => `${stem}${ext}`),
    ...extensions.map((ext) => `${base}/index${ext}`)];
  return candidates.find((candidate) => sources.has(candidate)) ?? base;
}

function isDirectDatabaseModule(specifier: string): boolean {
  return /^(?:postgres|pg|pg-pool)(?:\/|$)/.test(specifier) ||
    /^drizzle-orm\/(?:postgres-js|node-postgres|neon-http|neon-serverless|vercel-postgres|pglite|pg-proxy)(?:\/|$)/
      .test(specifier);
}

function isPrivilegedCredential(name: string): boolean {
  return /^(?:NEXT_PUBLIC_)?(?:DATABASE_URL|(?:TEST_)?MIGRATION_DATABASE_URL|SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY|SECRET_API_KEY|JWT_SECRET))$/
    .test(name);
}

function inspectSources(sources: Sources): Violation[] {
  const violations: Violation[] = [];
  for (const [file, text] of sources) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const environmentNames = new Set<string>();
    const processNames = new Set(["process"]);
    const variables: ts.VariableDeclaration[] = [];
    function prepare(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        variables.push(node);
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
        ["node:process", "process"].includes(node.moduleSpecifier.text)) {
        const clause = node.importClause;
        if (clause?.name) processNames.add(clause.name.text);
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) processNames.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const item of bindings.elements) {
            if ((item.propertyName ?? item.name).text === "env") environmentNames.add(item.name.text);
          }
        }
      }
      ts.forEachChild(node, prepare);
    }
    prepare(source);

    function literal(node: ts.Node | undefined): string | null {
      if (!node) return null;
      if (ts.isStringLiteralLike(node)) return node.text;
      // Resolving identifier text without lexical binding can confuse shadowed
      // constants. Only literal expressions are auditable at this boundary.
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = literal(node.left);
        const right = literal(node.right);
        return left !== null && right !== null ? left + right : null;
      }
      return null;
    }
    function member(node: ts.Node): string | null {
      if (ts.isPropertyAccessExpression(node)) return node.name.text;
      if (ts.isElementAccessExpression(node)) return literal(node.argumentExpression);
      return null;
    }
    function isEnvironment(node: ts.Expression): boolean {
      return ts.isIdentifier(node) ? environmentNames.has(node.text) :
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        member(node) === "env" && ts.isIdentifier(node.expression) && processNames.has(node.expression.text);
    }
    // Track simple aliases without executing source or reading environment values.
    for (let pass = 0; pass <= variables.length; pass++) {
      for (const variable of variables) {
        if (!ts.isIdentifier(variable.name) || !variable.initializer) continue;
        if (isEnvironment(variable.initializer)) environmentNames.add(variable.name.text);
        if (ts.isIdentifier(variable.initializer) && processNames.has(variable.initializer.text)) {
          processNames.add(variable.name.text);
        }
      }
    }
    function report(node: ts.Node, rule: string, target: string) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      violations.push({ file, line: line + 1, rule, target });
    }
    function checkImport(node: ts.Node, argument: ts.Node | undefined) {
      const specifier = literal(argument);
      if (specifier === null) {
        if (!isTestOnly(file)) report(node, "unclassified-module", "non-static module path");
        return;
      }
      const target = localTarget(file, specifier, sources);
      if (!isTestOnly(file) && target && !target.startsWith("src/") && !runtimeConfigFiles.has(target)) {
        report(node, "unclassified-module", target);
      }
      if (!isTestOnly(file) && target && isTestOnly(target)) {
        report(node, "test-fixture-import", target);
      }
      const fixedWorkerPoolImport = file === identityWorkerFile && target === poolFile;
      if (!directDatabaseFiles.has(file) && !fixedWorkerPoolImport &&
        (target === poolFile || isDirectDatabaseModule(specifier))) {
        report(node, "direct-database-import", target ?? specifier);
      }
    }
    function checkCredential(node: ts.Node, name: string | null) {
      if (name && isPrivilegedCredential(name) && !credentialFiles[file]?.includes(name)) {
        report(node, "privileged-credential", name);
      }
    }
    function visit(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        checkImport(node, node.moduleSpecifier);
      }
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        checkImport(node, node.moduleReference.expression);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        checkImport(node, node.argument.literal);
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) && callee.text === "require") ||
          ((ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
            ts.isIdentifier(callee.expression) &&
            ((callee.expression.text === "module" && member(callee) === "require") ||
              (callee.expression.text === "require" && member(callee) === "resolve")))) {
          checkImport(node, node.arguments[0]);
        }
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        checkCredential(node, member(node));
        if (isEnvironment(node.expression) && member(node) === null && !isTestOnly(file)) {
          report(node, "unclassified-credential", "non-static environment key");
        }
      }
      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
        const name = node.propertyName ?? node.name;
        checkCredential(node, ts.isIdentifier(name) ? name.text : literal(name));
      }
      if (ts.isStringLiteralLike(node) && /^sb_secret_[A-Za-z0-9_-]+$/.test(node.text)) {
        report(node, "privileged-credential", "Supabase secret key literal");
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return violations;
}

function synthetic(source: string, file = "src/server/auth/ordinary-service.ts"): Sources {
  return new Map([
    ...[...fixtureFiles, poolFile].map((name): [string, string] => [name, "export {};"]),
    [file, source],
  ]);
}

describe("R1 authorization architecture boundaries", () => {
  test("keeps all production sources outside fixture, pool, and service-credential boundaries", () => {
    // The only current source imports outside src are these runtime configs.
    // Scan them too, so moving a forbidden import into one does not hide it.
    const files = [...walk(path.join(root, "src")), ...[...runtimeConfigFiles].map((file) => path.join(root, file))];
    const sources = new Map(files.filter((file) => codeExtension.test(file))
      .map((file): [string, string] => [path.relative(root, file).replaceAll("\\", "/"), readFileSync(file, "utf8")]));
    expect([...sources.keys()]).toEqual(expect.arrayContaining([
      ...fixtureFiles, ...directDatabaseFiles, ...Object.keys(credentialFiles),
      "src/server/auth/authorization.ts", "src/server/trpc/trpc.ts",
      "src/app/api/trpc/[trpc]/route.ts", "src/components/ui/button.tsx",
    ]));
    expect(inspectSources(sources)).toEqual([]);
  }, 30_000);

  test.each([
    'import { owner } from "@/server/db/test/migration-owner";',
    'export * from "../db/r1-migration-rehearsal";',
    'export { snapshot } from "../db/r1-legacy-snapshot.js";',
    'void import("@/server/db/r1-populated-security-cases");',
    'const fixture = require("../db/r1-permission-rehearsal-cases");',
    'import type { Principal } from "./permission-test-fixtures";',
    'type Principal = import("./permission-test-fixtures").Principal;',
    'void import(`@/server/db/test/migration-owner`);',
    'import fixture = require("./permission-test-fixtures");',
    'void module.require("./permission-test-fixtures");',
    'void require.resolve("./permission-test-fixtures");',
    'import "./auth.integration.test";',
    'import "@/test/setup";',
  ])("detects forbidden fixture imports: %s", (source) => {
    const sources = synthetic(source);
    sources.set("src/server/auth/auth.integration.test.ts", "export {};");
    expect(inspectSources(sources)).toEqual([
      expect.objectContaining({ rule: "test-fixture-import" }),
    ]);
  });

  test.each([
    'import { db } from "@/server/db";',
    'export * from "../db/index.js";',
    'const database = require("postgres");',
    'void import("postgres/src/index.js");',
    'void import("drizzle-orm/postgres-js");',
    'import { drizzle } from "drizzle-orm/node-postgres";',
  ])("detects direct database imports: %s", (source) => {
    expect(inspectSources(synthetic(source))).toEqual([
      expect.objectContaining({ rule: "direct-database-import" }),
    ]);
  });

  test.each([
    "src/app/(app)/home/page.tsx", "src/components/member-list.tsx",
    "src/server/trpc/routers/members.ts", "src/server/services/members.ts",
    "src/server/auth/adapters/future-provider.ts",
  ])("does not grant database access by source location: %s", (file) => {
    expect(inspectSources(synthetic('import { db } from "@/server/db";', file)))
      .toEqual([expect.objectContaining({ file, rule: "direct-database-import" })]);
  });

  test("detects a pool import hidden behind a service barrel", () => {
    const sources = synthetic('export { db } from "@/server/db";', "src/server/services/index.ts");
    sources.set("src/app/page.tsx", 'import { db } from "@/server/services";');
    expect(inspectSources(sources)).toEqual([
      expect.objectContaining({ file: "src/server/services/index.ts", rule: "direct-database-import" }),
    ]);
  });

  test("allows only the fixed pool and identity key in the worker composition root", () => {
    const sources = synthetic([
      'void import("@/server/db");',
      'type Executor = typeof import("@/server/db")["db"];',
      "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    ].join("\n"), identityWorkerFile);
    expect(inspectSources(sources)).toEqual([]);
    sources.set(identityWorkerFile, [
      'import postgres from "postgres";',
      "const owner = process.env.MIGRATION_DATABASE_URL;",
      "const connection = process.env.DATABASE_URL;",
    ].join("\n"));
    expect(inspectSources(sources)).toEqual([
      expect.objectContaining({ rule: "direct-database-import" }),
      expect.objectContaining({ rule: "privileged-credential", target: "MIGRATION_DATABASE_URL" }),
      expect.objectContaining({ rule: "privileged-credential", target: "DATABASE_URL" }),
    ]);
  });

  test.each(["src/server/integrations/auth-admin/other-worker.ts", "src/trigger/identity-admin-intents.ts"])(
    "does not extend worker capabilities to adjacent files: %s", (file) => {
      expect(inspectSources(synthetic([
        'void import("@/server/db");', "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
      ].join("\n"), file))).toEqual([
        expect.objectContaining({ file, rule: "direct-database-import" }),
        expect.objectContaining({ file, rule: "privileged-credential" }),
      ]);
    },
  );

  test("cannot move a forbidden import outside the scanned source tree", () => {
    expect(inspectSources(synthetic('import { db } from "../../../scripts/hidden-pool";')))
      .toEqual([expect.objectContaining({ rule: "unclassified-module", target: "scripts/hidden-pool" })]);
    const sources = synthetic('void import("../sentry.server.config");', "src/instrumentation.ts");
    sources.set("sentry.server.config.ts", 'export { db } from "@/server/db";');
    expect(inspectSources(sources)).toEqual([
      expect.objectContaining({ file: "sentry.server.config.ts", rule: "direct-database-import" }),
    ]);
  });

  test.each(['void import(moduleName);', 'const client = require(moduleName);'])
    ("fails closed for unclassifiable module loading: %s", (source) => {
      expect(inspectSources(synthetic(source))).toEqual([
        expect.objectContaining({ rule: "unclassified-module" }),
      ]);
    });

  test.each([
    "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    'const key = process["env"]["SUPABASE_SERVICE_ROLE_KEY"];',
    "const { SUPABASE_SERVICE_ROLE_KEY: key } = process.env;",
    'const key = process.env["SUPABASE_" + "SERVICE_ROLE_KEY"];',
    'import { env as settings } from "node:process"; const key = settings.SUPABASE_SECRET_KEY;',
    "const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;",
    "const connection = process.env.TEST_MIGRATION_DATABASE_URL;",
    "const connection = process.env.MIGRATION_DATABASE_URL;",
    "const connection = process.env.DATABASE_URL;",
    'const key = "sb_secret_synthetic_fixture";',
  ])("detects privileged credential usage: %s", (source) => {
    expect(inspectSources(synthetic(source))).toEqual([
      expect.objectContaining({ rule: "privileged-credential" }),
    ]);
  });

  test("does not grant new integration tests automatic credential access", () => {
    expect(inspectSources(synthetic("const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
      "src/server/auth/new.integration.test.ts"))).toEqual([
      expect.objectContaining({ rule: "privileged-credential" }),
    ]);
  });

  test("rejects a dynamic environment key through an alias", () => {
    expect(inspectSources(synthetic("const environment = process.env; const key = environment[keyName];")))
      .toEqual([expect.objectContaining({ rule: "unclassified-credential" })]);
  });

  test("cannot hide a credential behind a shadowed constant name", () => {
    expect(inspectSources(synthetic([
      'const keyName = "SUPABASE_SERVICE_ROLE_KEY";',
      'function unrelated() { const keyName = "NEXT_PUBLIC_SUPABASE_ANON_KEY"; }',
      "const key = process.env[keyName];",
    ].join("\n")))).not.toEqual([]);
  });

  test("retains exact fixture and restricted-pool capabilities", () => {
    const sources = synthetic('import postgres from "postgres"; const url = process.env.DATABASE_URL;', poolFile);
    sources.set("src/server/auth/permission-test-fixtures.ts", [
      'import postgres from "postgres";',
      "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
      "const owner = process.env.TEST_MIGRATION_DATABASE_URL;",
    ].join("\n"));
    sources.set("src/server/auth/permissions.integration.test.ts", 'import { fixtures } from "./permission-test-fixtures";');
    expect(inspectSources(sources)).toEqual([]);
    sources.set(poolFile, "const owner = process.env.MIGRATION_DATABASE_URL;");
    expect(inspectSources(sources)).toEqual([
      expect.objectContaining({ file: poolFile, rule: "privileged-credential" }),
    ]);
  });

  test("permits schema helpers, public clients, and inert security documentation", () => {
    expect(inspectSources(synthetic([
      'import { sql } from "drizzle-orm";',
      'import { pgTable } from "drizzle-orm/pg-core";',
      'import { permissions } from "@/server/db/schema/permissions";',
      'import { createClient } from "@/lib/supabase/server";',
      "const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;",
      '// Do not import "@/server/db" or use process.env.SUPABASE_SERVICE_ROLE_KEY.',
      'const help = \'import postgres from "postgres";\';',
    ].join("\n")))).toEqual([]);
  });
});
