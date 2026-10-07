import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test, vi } from "vitest";

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

function parseSource(file: string, text = readFileSync(file, "utf8")) {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function createSnapshotParser(texts: ReadonlyMap<string, string>) {
  const parsed = new Map<string, ts.SourceFile>();
  return (file: string) => {
    const cached = parsed.get(file);
    if (cached) return cached;
    const text = texts.get(file);
    if (text === undefined) throw new Error(`Missing source snapshot: ${toProjectPath(file)}`);
    const source = parseSource(file, text);
    parsed.set(file, source);
    return source;
  };
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

function serverActionKeys(files: readonly string[], text: (file: string) => string,
  parse: (file: string) => ts.SourceFile): string[] {
  const keys = new Set<string>();

  for (const file of files) {
    const projectPath = toProjectPath(file);
    const content = text(file);
    // A decoded directive either has its plain spelling or contains an escape.
    // Retain AST inspection for every escape, including Unicode and continued lines.
    if (!content.includes("use server") && !content.includes("\\")) continue;
    const source = parse(file);

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

function appEntryKeys(files: readonly string[], parse: (file: string) => ts.SourceFile): string[] {
  const keys: string[] = [];

  for (const file of files.filter(file => toProjectPath(file).startsWith("src/app/"))) {
    const projectPath = toProjectPath(file);
    const name = path.basename(file);

    if (conventionEntries.has(name)) keys.push(`${projectPath}#default`);

    if (name === "route.ts" || name === "route.js") {
      for (const exportedName of exportedNames(parse(file))) {
        if (httpMethods.has(exportedName)) {
          keys.push(`${projectPath}#${exportedName}`);
        }
      }
    }
  }

  return keys;
}

function trpcEntryKeys(files: readonly string[], parse: (file: string) => ts.SourceFile): string[] {
  const keys: string[] = [];

  for (const file of files.filter(file => toProjectPath(file).startsWith("src/server/trpc/routers/"))) {
    const projectPath = toProjectPath(file);
    const source = parse(file);

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

function triggerEntryKeys(files: readonly string[], parse: (file: string) => ts.SourceFile): string[] {
  const keys: string[] = [];

  for (const file of files.filter(file => toProjectPath(file).startsWith("src/trigger/"))) {
    const projectPath = toProjectPath(file);
    const source = parse(file);

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

function frameworkHookKeys(files: readonly string[], parse: (file: string) => ts.SourceFile): string[] {
  const keys: string[] = [];

  for (const relativePath of [
    "src/instrumentation.ts",
    "src/instrumentation-client.ts",
  ]) {
    const file = path.join(root, relativePath);
    if (!files.includes(file)) continue;
    if (relativePath.endsWith("instrumentation-client.ts")) {
      keys.push(`${relativePath}#module`);
    }
    for (const name of exportedNames(parse(file))) {
      keys.push(`${relativePath}#${name}`);
    }
  }

  return keys;
}

function commandEntryKeys(files: readonly string[], scripts: readonly string[]): string[] {
  return [...scripts, ...files.filter(file => toProjectPath(file).startsWith("src/server/commands/"))]
    .map((file) => `${toProjectPath(file)}#command`);
}

async function discoveredEntryKeys(): Promise<string[]> {
  const files = walk(path.join(root, "src")).filter(isSourceFile);
  const scripts = walk(path.join(root, "scripts")).filter(isSourceFile);
  const texts = new Map<string, string>();
  // One complete source snapshot keeps each entry class consistent and avoids
  // repeated serial reads and parsing of the same route or procedure file.
  for (let offset = 0; offset < files.length; offset += 16) {
    const group = await Promise.all(files.slice(offset, offset + 16).map(async (file): Promise<[string, string]> =>
      [file, await readFile(file, "utf8")]));
    for (const [file, text] of group) texts.set(file, text);
  }
  const parse = createSnapshotParser(texts);
  const text = (file: string) => {
    const content = texts.get(file);
    if (content === undefined) throw new Error(`Missing source snapshot: ${toProjectPath(file)}`);
    return content;
  };
  const keys = [
    ...appEntryKeys(files, parse),
    ...serverActionKeys(files, text, parse),
    ...trpcEntryKeys(files, parse),
    ...triggerEntryKeys(files, parse),
    ...frameworkHookKeys(files, parse),
    ...commandEntryKeys(files, scripts),
  ];
  if (files.includes(path.join(root, "src", "proxy.ts"))) {
    keys.push("src/proxy.ts#proxy");
  }
  return [...new Set(keys)].sort();
}

describe("R1 authorization inventory", () => {
  test.each([
    ['"use server"; export async function action() {}', "action"],
    [String.raw`"use\u0020server"; export async function action() {}`, "action"],
    [String.raw`"\u0075se server"; export async function action() {}`, "action"],
    [String.raw`export const action = async () => { "use\x20server"; };`, "action"],
    ['export async function action() { "use\\\n server"; }', "action"],
    ['export async function action() { "use server"; }', "action"],
  ])("discovers plain and escaped server directives: %s", (content, name) => {
    const file = path.join(root, "src", "synthetic-action.ts");
    const parse = vi.fn(() => parseSource(file, content));
    expect(serverActionKeys([file], () => content, parse)).toEqual([`src/synthetic-action.ts#${name}`]);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  test.each([
    "// use server\nexport const ordinary = 1;",
    String.raw`export const ordinary = "unrelated\nvalue";`,
  ])("does not invent actions from comments or unrelated escapes: %s", content => {
    const file = path.join(root, "src", "synthetic-action.ts");
    const parse = vi.fn(() => parseSource(file, content));
    expect(serverActionKeys([file], () => content, parse)).toEqual([]);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  test("skips action AST work only when no directive spelling or escape exists", () => {
    const file = path.join(root, "src", "synthetic-action.ts");
    const parse = vi.fn(() => { throw new Error("Unneeded action parsing"); });
    expect(serverActionKeys([file], () => "export const ordinary = 1;", parse)).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  test("does not retain directive content across separate discovery snapshots", () => {
    const file = path.join(root, "src", "synthetic-action.ts");
    const first = '"use server"; export async function firstAction() {}';
    const second = '"use server"; export async function secondAction() {}';
    const firstParser = createSnapshotParser(new Map([[file, first]]));
    const secondParser = createSnapshotParser(new Map([[file, second]]));
    expect(firstParser(file)).toBe(firstParser(file));
    expect(serverActionKeys([file], () => first, firstParser)).toEqual(["src/synthetic-action.ts#firstAction"]);
    expect(serverActionKeys([file], () => second, secondParser)).toEqual(["src/synthetic-action.ts#secondAction"]);
  });

  test("matches every executable entry point in both directions", async () => {
    const recorded = entryPointInventory.map((entry) => entry.key).sort();
    const discovered = await discoveredEntryKeys();

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
    ).replaceAll("\r\n", "\n");

    expect(matrix).toContain(renderEntryPointInventoryTable());
  });

  test("requires a permission builder for every application tRPC mutation", () => {
    const files = walk(path.join(root, "src", "server", "trpc", "routers")).filter(isSourceFile);
    for (const file of files) {
      const source = parseSource(file);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === "mutation") {
          const builder = node.expression.expression;
          expect(ts.isCallExpression(builder), toProjectPath(file)).toBe(true);
          if (!ts.isCallExpression(builder)) return;
          expect(builder.expression.getText(source)).toBe("permissionProcedure");
          const options = builder.arguments[0];
          expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
          if (!options || !ts.isObjectLiteralExpression(options)) return;
          const keys = options.properties.map((property) => propertyName(property.name));
          expect(keys).toEqual(expect.arrayContaining(["permission", "input", "resolveScope"]));
          const imports = source.statements.filter(ts.isImportDeclaration);
          expect(imports.some((statement) => statement.moduleSpecifier.getText(source) === '"../trpc"'
            && statement.importClause?.namedBindings
            && ts.isNamedImports(statement.importClause.namedBindings)
            && statement.importClause.namedBindings.elements.some((element) =>
              element.name.text === "permissionProcedure" && !element.propertyName))).toBe(true);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  });
});
