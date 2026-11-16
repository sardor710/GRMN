import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectCurrentSources, extractSources, readPrivateExport, writePrivateExport } from "./extract.ts";
import { safeReport, validateSnapshot } from "./validate.ts";

export async function runDryRun(args: string[]): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!["--archive", "--output"].includes(key) || !value || value.startsWith("--") || options.has(key)) throw new Error("Invalid dry-run arguments");
    options.set(key, value);
  }
  if (options.has("--archive") && options.has("--output")) throw new Error("Choose archive replay or a new export");
  let snapshot;
  if (options.has("--archive")) snapshot = await readPrivateExport(options.get("--archive")!);
  else {
    const current = await collectCurrentSources();
    snapshot = extractSources({ ...current, namespace: "garmin-legacy-v1", classification: "owner_confirmed_real", cmsMoney: "KZT-major" });
    await mkdir(resolve("temp/backend-migration"), { recursive: true, mode: 0o700 });
    const directory = options.get("--output") ?? await mkdtemp(resolve("temp/backend-migration/dry-run-"));
    await writePrivateExport(snapshot, directory, current.sources);
  }
  const report = safeReport(validateSnapshot(snapshot));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ready ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await runDryRun(process.argv.slice(2)); }
  catch { process.stderr.write("Dry run failed; no target database was accessed. Check arguments and private archive integrity.\n"); process.exitCode = 1; }
}
