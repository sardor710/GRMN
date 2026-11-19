import { readFile, readdir, mkdir, writeFile, lstat, realpath, chmod } from "node:fs/promises";
import { resolve, relative, dirname, extname, posix, sep, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";
import { z } from "zod";
import { canonical, compareExact, sha256, redact, asObject, text, databaseText } from "./map.ts";
import type { Json, JsonObject } from "./map.ts";

const execute = promisify(execFile);
export interface Source { path: string; contents: string; bytes?: Buffer }
export interface Asset { path: string; sha256: string; bytes: number; invalidUtf8?: boolean }
export interface SourceRecord {
  entity: string; sourceKey: string; identity: string; source: string; resolvedSource: string;
  payload: JsonObject; recordChecksum: string; numberLexemes: Record<string, string>;
}
export interface Snapshot {
  version: 2; namespace: string; classification: "owner_confirmed_real" | "synthetic" | "unconfirmed";
  cmsMoney: "KZT-major" | null; sources: Asset[]; assets: Asset[]; records: SourceRecord[];
  redactions: string[]; sourceChecksum: string; artifactChecksum: string;
  // Task 24: the owner's reviewed dispositions (docs/backend/owner-dispositions.json), checksummed with
  // the archive so a replay always applies the same decisions. Absent in archives made before Task 24.
  decisions?: OwnerDecisions;
}
export interface OwnerDecisionRule { id: string; entity: string; keys?: string[]; action: "exclude" | "accept"; codes?: string[]; reason: string }
export interface OwnerDecisions { version: 1; approvedBy: string; approvedAt: string; rules: OwnerDecisionRule[] }
export interface ExtractOptions {
  namespace: string; classification: Snapshot["classification"]; cmsMoney: Snapshot["cmsMoney"];
  sources: Source[]; assets?: Asset[]; staticDefinitions?: string[]; decisions?: OwnerDecisions;
}

function evaluateDefinition(sources: Map<string, string>, path: string, name: string, visited = new Set<string>()): { value: Json; resolved: string } {
  const key = `${path}#${name}`, contents = sources.get(path);
  if (visited.has(key) || contents === undefined) return { value: { $unresolved: "missing_or_cyclic_definition" }, resolved: key };
  const next = new Set(visited).add(key), file = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) return { value: { $unresolved: "invalid_typescript_syntax", spans: diagnostics.map(item => ({ start: item.start ?? 0, length: item.length ?? 0, code: item.code })) }, resolved: key };
  const localPath = (specifier: string) => {
    const base = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : posix.normalize(posix.join(posix.dirname(path), specifier));
    return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(candidate => sources.has(candidate)) ?? base;
  };
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      const exported = statement.exportClause.elements.find(element => element.name.text === name);
      if (exported) return evaluateDefinition(sources, localPath(statement.moduleSpecifier.text), (exported.propertyName ?? exported.name).text, next);
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      const imported = statement.importClause.namedBindings.elements.find(element => element.name.text === name);
      if (imported) return evaluateDefinition(sources, localPath(statement.moduleSpecifier.text), (imported.propertyName ?? imported.name).text, next);
    }
  }
  const declarations = file.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []);
  const declaration = declarations.find(item => ts.isIdentifier(item.name) && item.name.text === name);
  const evaluate = (node: ts.Expression): Json => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) return evaluate(node.expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isIdentifier(node)) return evaluateDefinition(sources, path, node.text, next).value;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = evaluate(span.expression);
        if (typeof part !== "string" && typeof part !== "number") return { $unresolved: "template", at: node.pos };
        value += String(part) + span.literal.text;
      }
      return value;
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(item => ts.isSpreadElement(item) ? { $unresolved: "array_spread", at: item.pos } : evaluate(item));
    if (ts.isObjectLiteralExpression(node)) {
      const result: [string, Json][] = [];
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name))) result.push([property.name.text, evaluate(property.initializer)]);
        else if (ts.isShorthandPropertyAssignment(property)) result.push([property.name.text, evaluateDefinition(sources, path, property.name.text, next).value]);
        else result.push([`$unresolved_${property.pos}`, { $unresolved: "object_member", at: property.pos }]);
      }
      return Object.fromEntries(result);
    }
    // Never eval/transpile/import source: calls/getters can mutate CMS files.
    return { $unresolved: ts.SyntaxKind[node.kind], at: node.pos };
  };
  return { value: declaration?.initializer ? evaluate(declaration.initializer) : { $unresolved: "missing_initializer" }, resolved: key };
}

export function extractSources(options: ExtractOptions): Snapshot {
  if (!options.namespace.trim() || databaseText(options.namespace) !== options.namespace) throw new Error("Valid source namespace required");
  const sources = new Map(options.sources.map(source => [source.path, source.contents]));
  if (sources.size !== options.sources.length) throw new Error("Duplicate source file");
  const numericTokens = new WeakMap<object, Map<string, string>>();
  const records: SourceRecord[] = [], redactions: string[] = [];
  const append = (entity: string, values: Json, source: string, resolvedSource = source) => {
    const rows = Array.isArray(values) ? values : [values], occurrences = new Map<string, number>();
    for (const [index, row] of rows.entries()) {
      const object = row !== null && typeof row === "object" && !Array.isArray(row) ? row : { value: row };
      const identity = text(object.id) ?? text(object.slug) ?? text(object.key) ?? `row:${index}`;
      const occurrence = occurrences.get(identity) ?? 0; occurrences.set(identity, occurrence + 1);
      const sourceKey = JSON.stringify([identity, occurrence]);
      const payload = asObject(redact(object, `${entity}:${sourceKey}`, redactions));
      const numberLexemes: Record<string, string> = Object.create(null);
      const collect = (original: Json, sanitized: Json, prefix: string) => {
        if (!original || typeof original !== "object" || !sanitized || typeof sanitized !== "object") return;
        for (const [field, child] of Object.entries(sanitized)) {
          const path = Array.isArray(sanitized) ? `${prefix}[${field}]` : prefix ? `${prefix}.${field}` : field;
          const token = numericTokens.get(original)?.get(field);
          if (token !== undefined) numberLexemes[path] = token;
          collect((original as JsonObject)[field], child, path);
        }
      };
      collect(object, payload, "");
      records.push({ entity: databaseText(entity), sourceKey, identity, source, resolvedSource, payload, numberLexemes: Object.fromEntries(Object.entries(numberLexemes)), recordChecksum: sha256(canonical(payload)) });
    }
  };
  const cmsPath = "src/lib/cms/data.json", cmsText = sources.get(cmsPath);
  if (cmsText === undefined) throw new Error("Persisted CMS source missing");
  const cms: unknown = JSON.parse(cmsText, function (this: object, key: string, value: Json, context?: { source?: string }) {
    if (typeof value === "number" && context?.source) {
      if (!numericTokens.has(this)) numericTokens.set(this, new Map());
      numericTokens.get(this)!.set(key, context.source);
      if (!Number.isFinite(value)) return context.source;
    }
    return value;
  });
  if (cms === null || typeof cms !== "object" || Array.isArray(cms)) throw new Error("CMS root must be an object");
  for (const [entity, value] of Object.entries(cms).sort(([a], [b]) => compareExact(a, b))) append(entity, value as Json, cmsPath);
  const resolved = new Set<string>();
  for (const definition of [...(options.staticDefinitions ?? [])].sort()) {
    const split = definition.lastIndexOf("#"), path = definition.slice(0, split), name = definition.slice(split + 1);
    const result = evaluateDefinition(sources, path, name);
    if (resolved.has(result.resolved)) continue;
    resolved.add(result.resolved);
    append(`static:${definition}`, result.value, definition, result.resolved);
  }
  const metadata = options.sources.map(source => {
    const bytes = source.bytes ?? Buffer.from(source.contents), invalidUtf8 = !Buffer.from(bytes.toString("utf8")).equals(bytes);
    return { path: source.path, sha256: sha256(bytes), bytes: bytes.length, ...(invalidUtf8 ? { invalidUtf8: true } : {}) };
  }).sort((a, b) => compareExact(a.path, b.path));
  const body = { version: 2 as const, namespace: options.namespace, classification: options.classification, cmsMoney: options.cmsMoney,
    sources: metadata, assets: [...(options.assets ?? [])].sort((a, b) => compareExact(a.path, b.path)),
    records: records.sort((a, b) => compareExact(`${a.entity}:${a.sourceKey}`, `${b.entity}:${b.sourceKey}`)), redactions: redactions.sort(compareExact), sourceChecksum: sha256(canonical(metadata)),
    ...(options.decisions ? { decisions: parseOwnerDecisions(options.decisions) } : {}) };
  return { ...body, artifactChecksum: sha256(canonical(body)) };
}

const decisionText = z.string().trim().min(1).max(500);
const decisionsSchema = z.strictObject({
  version: z.literal(1), approvedBy: decisionText, approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rules: z.array(z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), entity: z.string().min(1).max(300), keys: z.array(z.string().min(1)).min(1).optional(),
    action: z.enum(["exclude", "accept"]), codes: z.array(z.string().regex(/^[A-Z_]+$/)).min(1).optional(), reason: decisionText,
  })).min(1),
}).superRefine((value, context) => {
  if (new Set(value.rules.map(rule => rule.id)).size !== value.rules.length) context.addIssue({ code: "custom", message: "duplicate rule id" });
  for (const rule of value.rules) if ((rule.action === "accept") !== (rule.codes !== undefined)) context.addIssue({ code: "custom", message: `rule ${rule.id}: accept needs codes; exclude takes none` });
});
export function parseOwnerDecisions(input: unknown): OwnerDecisions {
  const parsed = decisionsSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid owner decisions: ${parsed.error.issues.map(issue => issue.message).join("; ")}`);
  return parsed.data as OwnerDecisions;
}

const assetSchema = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative(), invalidUtf8: z.boolean().optional() }).strict();
const snapshotSchema = z.object({ version: z.literal(2), namespace: z.string().min(1), classification: z.enum(["owner_confirmed_real", "synthetic", "unconfirmed"]), cmsMoney: z.literal("KZT-major").nullable(),
  sources: z.array(assetSchema), assets: z.array(assetSchema), redactions: z.array(z.string()), sourceChecksum: z.string(), artifactChecksum: z.string(),
  records: z.array(z.object({ entity: z.string().min(1), sourceKey: z.string().min(1), identity: z.string().min(1), source: z.string(), resolvedSource: z.string(), payload: z.record(z.string(), z.json()), recordChecksum: z.string(), numberLexemes: z.record(z.string(), z.string()) }).strict()),
  decisions: decisionsSchema.optional(),
}).strict();

export function assertSnapshot(input: unknown): asserts input is Snapshot {
  const snapshot = snapshotSchema.parse(input) as Snapshot;
  if (databaseText(snapshot.namespace) !== snapshot.namespace) throw new Error("Invalid source namespace");
  const { artifactChecksum, ...body } = snapshot;
  if (sha256(canonical(body)) !== artifactChecksum || sha256(canonical(snapshot.sources)) !== snapshot.sourceChecksum) throw new Error("Archive checksum mismatch");
  const keys = new Set<string>();
  for (const record of snapshot.records) {
    const key = JSON.stringify([record.entity, record.sourceKey]);
    if (keys.has(key)) throw new Error("Duplicate archive identity");
    keys.add(key);
    const redactions: string[] = []; redact(record.payload, "", redactions);
    if (redactions.length || sha256(canonical(record.payload)) !== record.recordChecksum) throw new Error("Unsafe payload or record checksum mismatch");
  }
}

export async function secureDirectory(path: string): Promise<void> {
  const root = resolve("temp"), absolute = resolve(path);
  if (absolute === root || !absolute.startsWith(root + sep)) throw new Error("Private output must be inside workspace temp");
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (await realpath(root) !== root) throw new Error("Private root cannot be a symlink");
  const parts = relative(root, absolute).split(sep);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Private output cannot be a symlink");
  }
  await chmod(absolute, 0o700);
  if (process.platform === "win32") {
    const { stdout } = await execute("whoami", ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
    const sid = stdout.match(/S-1-[0-9-]+/)?.[0];
    if (!sid) throw new Error("Cannot establish private export owner");
    const quoted = absolute.replaceAll("'", "''");
    const script = `$p='${quoted}';$sid=[System.Security.Principal.SecurityIdentifier]::new('${sid}');if([System.IO.Directory]::GetAccessControl($p).GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Private directory owner mismatch'};$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule);[System.IO.Directory]::SetAccessControl($p,$acl)`;
    await execute("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
  }
}

export async function writePrivateExport(snapshot: Snapshot, directory: string, originals: Source[] = []): Promise<void> {
  assertSnapshot(snapshot);
  if (originals.length && (originals.length !== snapshot.sources.length || new Set(originals.map(source => source.path)).size !== originals.length)) throw new Error("Incomplete original inventory");
  if (snapshot.classification === "owner_confirmed_real" && originals.length !== snapshot.sources.length) throw new Error("Real export requires complete originals");
  for (const source of originals) if (!snapshot.sources.some(item => item.path === source.path && item.sha256 === sha256(source.bytes ?? Buffer.from(source.contents)))) throw new Error("Original source checksum mismatch");
  await secureDirectory(directory);
  if ((await readdir(directory)).length) throw new Error("Export directory must be empty");
  await writeFile(resolve(directory, "export.in-progress"), snapshot.artifactChecksum, { flag: "wx", mode: 0o600 });
  const secured = new Set<string>();
  for (const source of originals) {
    const destination = resolve(directory, "originals", `${source.path}.snapshot`);
    if (!destination.startsWith(resolve(directory, "originals") + sep)) throw new Error("Unsafe backup path");
    if (!secured.has(dirname(destination))) { await secureDirectory(dirname(destination)); secured.add(dirname(destination)); }
    await writeFile(destination, source.bytes ?? Buffer.from(source.contents), { flag: "wx", mode: 0o600 });
  }
  await writeFile(resolve(directory, "snapshot.json"), canonical(snapshot), { flag: "wx", mode: 0o600 });
  // Publication happens last; readers verify the complete original inventory.
  await writeFile(resolve(directory, "complete.json"), canonical({ artifactChecksum: snapshot.artifactChecksum, originals: originals.map(source => source.path).sort(compareExact) }), { flag: "wx", mode: 0o600 });
}

export async function readPrivateExport(directory: string): Promise<Snapshot> {
  const snapshot: unknown = JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8"));
  assertSnapshot(snapshot);
  const marker = z.object({ artifactChecksum: z.string(), originals: z.array(z.string()) }).strict().parse(JSON.parse(await readFile(resolve(directory, "complete.json"), "utf8")));
  if (marker.artifactChecksum !== snapshot.artifactChecksum || (marker.originals.length !== 0 && marker.originals.length !== snapshot.sources.length) || (snapshot.classification === "owner_confirmed_real" && marker.originals.length !== snapshot.sources.length)) throw new Error("Incomplete export");
  for (const source of snapshot.sources.filter(source => marker.originals.includes(source.path))) {
    const path = resolve(directory, "originals", `${source.path}.snapshot`);
    if (!path.startsWith(resolve(directory, "originals") + sep) || (await lstat(path)).isSymbolicLink() || sha256(await readFile(path)) !== source.sha256) throw new Error("Original backup integrity failure");
  }
  return snapshot;
}

export async function collectCurrentSources(root = process.cwd()): Promise<{ sources: Source[]; assets: Asset[]; staticDefinitions: string[]; decisions?: OwnerDecisions }> {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(resolve(root, directory), { withFileTypes: true });
    const children = await Promise.all(entries.map(async entry => {
      const path = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("Source symlinks require explicit review");
      return entry.isDirectory() ? walk(path) : [path];
    }));
    return children.flat().sort();
  };
  const paths = (await walk("src")).filter(path => [".ts", ".tsx", ".js", ".json"].includes(extname(path)));
  const sources = await Promise.all(paths.map(async path => { const bytes = await readFile(resolve(root, path)); return { path, contents: bytes.toString("utf8"), bytes }; }));
  const assets = await Promise.all((await walk("public")).map(async path => { const bytes = await readFile(resolve(root, path)); return { path, bytes: bytes.length, sha256: sha256(bytes) }; }));
  const inventory = JSON.parse(await readFile(resolve(root, "docs/backend/source-inventory.json"), "utf8")) as { staticDefinitions: Record<string, unknown> };
  let decisions: OwnerDecisions | undefined;
  try { decisions = parseOwnerDecisions(JSON.parse(await readFile(resolve(root, "docs/backend/owner-dispositions.json"), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return { sources, assets, staticDefinitions: [...Object.keys(inventory.staticDefinitions), "src/lib/cms/seed.ts#BASE_PRODUCTS"], ...(decisions ? { decisions } : {}) };
}
