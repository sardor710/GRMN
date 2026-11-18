import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : /\.[cm]?[jt]sx?$/.test(file) ? [file] : [];
  });
}

function dependencies(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && !node.importClause?.isTypeOnly) {
      const bindings = node.importClause?.namedBindings;
      const onlyNamedTypes = !node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((item) => item.isTypeOnly);
      if (!onlyNamedTypes) imports.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
      const onlyNamedTypes = node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((item) => item.isTypeOnly);
      if (!onlyNamedTypes) imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const client = source.statements.some((statement) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client");
  return { imports, client };
}

export function findServerBoundaryViolations(projectRoot) {
  const root = path.resolve(projectRoot);
  const files = filesUnder(path.join(root, "src"));
  const graph = new Map(files.map((file) => [file, dependencies(file)]));
  const violations = [];
  for (const [entry, metadata] of graph) {
    if (!metadata.client && !entry.startsWith(path.join(root, "src", "contracts") + path.sep)) continue;
    const visited = new Set();
    function inspect(file) {
      if (visited.has(file)) return;
      visited.add(file);
      for (const specifier of graph.get(file)?.imports ?? []) {
        if (/^(pg|drizzle-orm|better-auth|@better-auth\/[^/]+|server-only)(\/|$)/.test(specifier) || specifier.startsWith("node:")) {
          violations.push({ entry: path.relative(root, entry).replaceAll("\\", "/"), file: path.relative(root, file).replaceAll("\\", "/"), target: specifier });
          continue;
        }
        const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : null;
        if (!base) continue;
        const privateSources = ["data.json", "seed.ts", "store.ts"].map(name => path.join(root, "src", "lib", "cms", name));
        privateSources.push(path.join(root,"src","lib","public-products.ts"),path.join(root,"src","lib","blog.ts"));
        const privateTarget = [base, base + ".ts", base + ".json"].find(candidate => privateSources.includes(candidate));
        if (privateTarget) {
          violations.push({ entry: path.relative(root, entry).replaceAll("\\", "/"), file: path.relative(root, file).replaceAll("\\", "/"), target: path.relative(root, privateTarget).replaceAll("\\", "/") });
          continue;
        }
        const target = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs"].map((ext) => base + ext), path.join(base, "index.ts"), path.join(base, "index.tsx")].find((candidate) => graph.has(candidate));
        if (!target) continue;
        if (target.startsWith(path.join(root, "src", "server") + path.sep)) {
          violations.push({ entry: path.relative(root, entry).replaceAll("\\", "/"), file: path.relative(root, file).replaceAll("\\", "/"), target: path.relative(root, target).replaceAll("\\", "/") });
        } else inspect(target);
      }
    }
    inspect(entry);
  }
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = findServerBoundaryViolations(process.cwd());
  if (violations.length) {
    console.error(JSON.stringify(violations, null, 2));
    process.exitCode = 1;
  } else console.log("Server/client import boundaries passed");
}
