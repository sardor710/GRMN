// Owner 2026-11-23: point hero banners at local product pages. Changes only `href` of the listed banner ids and
// saves a new published homepage version (author: earliest owner/super_admin, as import-hero-banners.mjs).
//   docker compose -p grmn -f deploy/compose.yml --env-file <env> run --rm -T -v <links.json>:/import/links.json:ro \
//     -v <this file>:/app/scripts/ops/set-hero-links.mjs:ro ops node --conditions=react-server scripts/ops/set-hero-links.mjs /import/links.json [--dry-run]
// links.json: { "<banner id>": "<href>", ... }
import fs from "node:fs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { createCMSService } from "../../src/server/cms/service.ts";

const file = process.argv.find((arg) => arg.endsWith(".json"));
const dryRun = process.argv.includes("--dry-run");
if (!file) throw new Error("usage: set-hero-links.mjs <links.json> [--dry-run]");
const links = JSON.parse(fs.readFileSync(file, "utf8"));
const database = createDatabase(parseServerEnv({ ...process.env, DATABASE_POOL_MAX: "2", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
let failed = false;
try {
  const author = (await database.pool.query(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
     WHERE r.code IN ('owner','super_admin') ORDER BY u.created_at LIMIT 1`)).rows[0]?.id;
  if (!author) throw new Error("No owner/super_admin account to record as the author");
  const cms = createCMSService({ pool: database.pool, authorize: async () => ({ userId: author, permissions: ["content:write"] }) });
  const headers = new Headers();
  const current = await cms.homepage(headers);
  if (!current.config) throw new Error("No published homepage");
  const missing = Object.keys(links).filter((id) => !current.config.heroBanners.some((b) => b.id === id));
  if (missing.length) throw new Error(`Unknown hero banner ids: ${missing.join(", ")}`);
  const changes = [];
  const heroBanners = current.config.heroBanners.map((banner) => {
    const href = links[banner.id];
    if (href === undefined || href === banner.href) return banner;
    changes.push({ id: banner.id, from: banner.href, to: href });
    return { ...banner, href };
  });
  if (!dryRun && changes.length) {
    const saved = await cms.saveHomepage(headers, { version: current.version, config: { ...current.config, heroBanners } });
    console.log(JSON.stringify({ dryRun, version: saved.version, changes }));
  } else console.log(JSON.stringify({ dryRun, version: current.version, changes }));
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.stack : error);
} finally {
  await database.close();
}
process.exitCode = failed ? 1 : 0;
