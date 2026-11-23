// Owner 2026-11-23: append hero banners (e.g. from garmin.com.tr) to the published homepage. The current slides stay;
// images are stored like admin uploads (UPLOAD_DIR/homepage/<year>/); ru/kk text goes into the homepage overlays.
// Re-running adds nothing (ids are tr-<key>).
//   docker compose -p grmn -f deploy/compose.yml --env-file <env> run --rm -T -v <dir>:/import:ro ops \
//     node --conditions=react-server scripts/ops/import-hero-banners.mjs /import/manifest.json [--dry-run]
// manifest.json: { "banners": [{ "key", "file", "title", "subtitle", "href", "translations": { "ru": {...}, "kk": {...} } }] }
// The new version is written as the earliest owner/super_admin account (there is no system user).
import fs from "node:fs";
import path from "node:path";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { createCMSService } from "../../src/server/cms/service.ts";
import { saveImage, sniffImageType } from "../../src/lib/media/storage.js";
import { appendHeroBanners } from "../../src/lib/cms/hero-import.ts";

const manifestPath = process.argv.find((arg) => arg.endsWith(".json"));
const dryRun = process.argv.includes("--dry-run");
if (!manifestPath) throw new Error("usage: import-hero-banners.mjs <manifest.json> [--dry-run]");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const dir = path.dirname(manifestPath);

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
  if (!current.config) throw new Error("No published homepage to append to");

  // Read and check every image before storing any of them.
  const files = manifest.banners.map((banner) => {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, banner.file)));
    if (!sniffImageType(bytes)) throw new Error(`${banner.file} is not a JPEG, PNG, WebP or AVIF image`);
    return bytes;
  });
  const planned = appendHeroBanners(current.config, manifest.banners.map((banner) => ({ ...banner, image: "(pending)" })));
  const banners = [];
  for (const [index, banner] of manifest.banners.entries()) {
    const needed = planned.added.includes(`tr-${banner.key}`);
    const image = needed && !dryRun ? (await saveImage(files[index], { folder: "homepage" })).src : "(dry-run)";
    banners.push({ ...banner, image });
  }
  const { config, added, skipped } = appendHeroBanners(current.config, banners);
  if (!dryRun && added.length > 0) {
    const saved = await cms.saveHomepage(headers, { version: current.version, config });
    console.log(JSON.stringify({ dryRun, version: saved.version, added, skipped, images: config.heroBanners.filter((b) => added.includes(b.id)).map((b) => b.image) }));
  } else {
    console.log(JSON.stringify({ dryRun, version: current.version, added, skipped, slides: config.heroBanners.map((b) => `${b.order}. ${b.id} ${b.title}`) }));
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.stack : error);
} finally {
  await database.close();
}
process.exitCode = failed ? 1 : 0;
