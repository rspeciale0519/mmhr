import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

import {
  entryPointInventory,
  renderEntryPointInventoryTable,
} from "@/server/auth/entry-point-inventory";

const root = process.cwd();
const httpMethods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
const conventionEntries = new Set([
  "page.tsx",
  "layout.tsx",
  "global-error.tsx",
  "error.tsx",
  "forbidden.tsx",
  "not-found.tsx",
  "loading.tsx",
  "default.tsx",
]);

function toProjectPath(file: string) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function isSourceFile(file: string) {
  return /\.(?:[cm]?[jt]sx?)$/.test(file) && !file.includes(".test.");
}

function parseSource(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return ts.canHaveModifiers(node)
    ? ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false
    : false;
}

function propertyName(name: ts.PropertyName | undefined): string | null {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (
    ts.isComputedPropertyName(name) &&
    ts.isStringLiteralLike(name.expression)
  ) {
    return name.expression.text;
  }
  return null;
}

function exportedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  for (const statement of source.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isVariableStatement(statement)) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if (statement.name) {
        names.add(statement.name.text);
      }
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) names.add(element.name.text);
      }
    }
  }

  return names;
}

function hasUseServerDirective(node: ts.SourceFile | ts.Block) {
  const first = node.statements[0];
  return Boolean(
    first &&
      ts.isExpressionStatement(first) &&
      ts.isStringLiteral(first.expression) &&
      first.expression.text === "use server",
  );
}

function functionBindingName(node: ts.FunctionLikeDeclaration): string | null {
  if (node.name) return propertyName(node.name);
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  return null;
}

function serverActionKeys(): string[] {
  const keys = new Set<string>();

  for (const file of walk(path.join(root, "src")).filter(isSourceFile)) {
    const projectPath = toProjectPath(file);
    const source = parseSource(file);

    if (hasUseServerDirective(source)) {
      for (const name of exportedNames(source)) {
        keys.add(`${projectPath}#${name}`);
      }
    }

    function visit(node: ts.Node) {
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isMethodDeclaration(node)) &&
        node.body &&
        ts.isBlock(node.body) &&
        hasUseServerDirective(node.body)
      ) {
        const name = functionBindingName(node);
        const location = source.getLineAndCharacterOfPosition(node.getStart());
        keys.add(
          `${projectPath}#${name ?? `inline@${location.line + 1}:${location.character + 1}`}`,
        );
      }
      ts.forEachChild(node, visit);
    }

    ts.forEachChild(source, visit);
  }

  return [...keys];
}

function appEntryKeys(): string[] {
  const keys: string[] = [];

  for (const file of walk(path.join(root, "src", "app")).filter(isSourceFile)) {
    const projectPath = toProjectPath(file);
    const name = path.basename(file);

    if (conventionEntries.has(name)) keys.push(`${projectPath}#default`);

    if (name === "route.ts" || name === "route.js") {
      for (const exportedName of exportedNames(parseSource(file))) {
        if (httpMethods.has(exportedName)) {
          keys.push(`${projectPath}#${exportedName}`);
        }
      }
    }
  }

  return keys;
}

function trpcEntryKeys(): string[] {
  const keys: string[] = [];

  for (const file of walk(
    path.join(root, "src", "server", "trpc", "routers"),
  ).filter(isSourceFile)) {
    const projectPath = toProjectPath(file);
    const source = parseSource(file);

    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["query", "mutation", "subscription"].includes(node.expression.name.text)
      ) {
        let owner: ts.Node | undefined = node.parent;
        while (owner && !ts.isPropertyAssignment(owner)) owner = owner.parent;
        const name = owner && propertyName(owner.name);
        if (!name) throw new Error(`Unclassifiable tRPC procedure in ${projectPath}`);
        keys.push(`${projectPath}#${name}`);
      }
      ts.forEachChild(node, visit);
    }

    ts.forEachChild(source, visit);
  }

  return keys;
}

function triggerEntryKeys(): string[] {
  const keys: string[] = [];

  for (const file of walk(path.join(root, "src", "trigger")).filter(
    isSourceFile,
  )) {
    const projectPath = toProjectPath(file);
    const source = parseSource(file);

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.arguments[0]) {
        const config = node.arguments[0];
        if (ts.isObjectLiteralExpression(config)) {
          const id = config.properties.find(
            (property): property is ts.PropertyAssignment =>
              ts.isPropertyAssignment(property) && propertyName(property.name) === "id",
          );
          if (id && ts.isStringLiteralLike(id.initializer)) {
            keys.push(`${projectPath}#${id.initializer.text}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    ts.forEachChild(source, visit);
  }

  return keys;
}

function frameworkHookKeys(): string[] {
  const keys: string[] = [];

  for (const relativePath of [
    "src/instrumentation.ts",
    "src/instrumentation-client.ts",
  ]) {
    const file = path.join(root, relativePath);
    if (!existsSync(file)) continue;
    if (relativePath.endsWith("instrumentation-client.ts")) {
      keys.push(`${relativePath}#module`);
    }
    for (const name of exportedNames(parseSource(file))) {
      keys.push(`${relativePath}#${name}`);
    }
  }

  return keys;
}

function commandEntryKeys(): string[] {
  return [path.join(root, "scripts"), path.join(root, "src", "server", "commands")]
    .flatMap(walk)
    .filter(isSourceFile)
    .map((file) => `${toProjectPath(file)}#command`);
}

function discoveredEntryKeys(): string[] {
  const keys = [
    ...appEntryKeys(),
    ...serverActionKeys(),
    ...trpcEntryKeys(),
    ...triggerEntryKeys(),
    ...frameworkHookKeys(),
    ...commandEntryKeys(),
  ];
  if (existsSync(path.join(root, "src", "middleware.ts"))) {
    keys.push("src/middleware.ts#middleware");
  }
  return [...new Set(keys)].sort();
}

describe("R1 authorization inventory", () => {
  test("matches every executable entry point in both directions", () => {
    const recorded = entryPointInventory.map((entry) => entry.key).sort();
    const discovered = discoveredEntryKeys();

    expect(new Set(recorded).size).toBe(recorded.length);
    expect(recorded).toEqual(discovered);
  });

  test("records every required authorization field", () => {
    for (const entry of entryPointInventory) {
      expect(entry).toMatchObject({
        key: expect.any(String),
        surface: expect.any(String),
        kind: expect.any(String),
        access: expect.any(String),
        permission: expect.any(String),
        scope: expect.any(String),
        dataPath: expect.any(String),
        denialEvidence: expect.any(String),
      });
      expect(Object.values(entry).every((value) => value.length > 0)).toBe(true);
    }
  });

  test("keeps every durable matrix field synchronized", () => {
    const matrix = readFileSync(
      path.join(root, "docs", "security", "r1-authorization-matrix.md"),
      "utf8",
    );

    expect(matrix).toContain(renderEntryPointInventoryTable());
  });

  test("has no tRPC mutation before permission and origin controls", () => {
    const routerSource = walk(
      path.join(root, "src", "server", "trpc", "routers"),
    )
      .filter(isSourceFile)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(routerSource).not.toMatch(/\.mutation\s*\(/);
  });
});
