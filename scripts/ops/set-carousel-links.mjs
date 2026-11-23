// Owner 2026-11-23: point homepage carousel cards at pages on this store. Cards are matched by title (case,
// ® ™ and spacing ignored); only `href` changes; a new published homepage version is saved (author as in
// import-hero-banners.mjs). Unknown titles fail the run.
//   docker compose -p grmn -f deploy/compose.yml --env-file <env> run --rm -T -v <links.json>:/import/links.json:ro \
//     -v <this file>:/app/scripts/ops/set-carousel-links.mjs:ro ops node --conditions=react-server scripts/ops/set-carousel-links.mjs /import/links.json [--dry-run]
// links.json: { "<card title>": "<href>", ... }
import fs from "node:fs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { createCMSService } from "../../src/server/cms/service.ts";

const file = process.argv.find((arg) => arg.endsWith(".json"));
const dryRun = process.argv.includes("--dry-run");
if (!file) throw new Error("usage: set-carousel-links.mjs <links.json> [--dry-run]");
const norm = (text) => String(text ?? "").normalize("NFC").replace(/[®™]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const links = new Map(Object.entries(JSON.parse(fs.readFileSync(file, "utf8"))).map(([title, href]) => [norm(title), href]));
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
  const matched = new Set();
  const changes = [];
  const carousels = current.config.carousels.map((carousel) => ({
    ...carousel,
    items: carousel.items.map((item) => {
      const href = links.get(norm(item.title));
      if (href === undefined) return item;
      matched.add(norm(item.title));
      if (href === item.href) return item;
      changes.push({ carousel: carousel.title, title: item.title, from: item.href, to: href });
      return { ...item, href };
    }),
  }));
  const unknown = [...links.keys()].filter((title) => !matched.has(title));
  if (unknown.length) throw new Error(`No carousel card titled: ${unknown.join(", ")}`);
  if (!dryRun && changes.length) {
    const saved = await cms.saveHomepage(headers, { version: current.version, config: { ...current.config, carousels } });
    console.log(JSON.stringify({ dryRun, version: saved.version, changes }));
  } else console.log(JSON.stringify({ dryRun, version: current.version, changes }));
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.stack : error);
} finally {
  await database.close();
}
process.exitCode = failed ? 1 : 0;
