// Download all MARQ minisite assets to public/marq/
// Usage: node scripts/download-marq-assets.mjs
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://www.garmin.com.sg/minisite/marq/";
const OUT = "public/marq/";

const images = [
  // foreground / baked text PNGs
  "images/marq-collection.png", "images/product-name.png",
  "images/marq-spec-captain.png", "images/marq-spec-carbon-golfer.png",
  "images/marq-spec-carbon-athlete.png", "images/marq-spec-golfer.png",
  "images/marq-spec-athlete.png", "images/marq-spec-adventurer.png",
  "images/marq-spec-aviator.png",
  // backgrounds & product renders
  "images/kv-bg.jpg", "images/kv-mountain.png", "images/cloud.jpg",
  "images/stone-bg.jpg", "images/damascus-bg-spark-2.png",
  "images/damascus-bg-spark.png", "images/damascus-bg.jpg",
  "images/marq2-product-captain.jpg", "images/marq2-product-carbon-golfer.jpg",
  "images/marq2-product-carbon-athlete.jpg", "images/marq2-product-golfer.jpg",
  "images/marq2-product-athlete.jpg", "images/marq2-product-adventurer.jpg",
  "images/marq2-product-aviator.jpg", "images/overview-bg-01.jpg",
  "images/material-bg-01.jpg", "images/material-bg-02.jpg",
  "images/material-bg-03.jpg", "images/marq-bands-bg.jpg",
  "images/marq-spec-bg.jpg",
  // lazy-loaded (discovered after scroll)
  "images/legacy.jpg", "images/marq-spec-damascus.png",
  "images/material-watch-01.png", "images/material-watch-02.png",
  "images/material-watch-03.png", "images/overview-bg-02.jpg",
  "images/sapphire.jpg", "images/kv-bg.jpg",
];
const videos = [
  "video/fire.mp4", "video/captain.mp4", "video/carbon-golfer.mp4",
  "video/carbon-athlete.mp4", "video/golfer.mp4", "video/athlete.mp4",
  "video/adventurer.mp4", "video/aviator.mp4", "video/damascus.mp4",
];
const all = [...images, ...videos];

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function download(rel) {
  const url = BASE + rel;
  const dest = join(OUT, rel);
  if (await exists(dest)) { return { rel, skipped: true }; }
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return { rel, bytes: buf.length };
}

async function run() {
  let ok = 0, fail = 0;
  for (let i = 0; i < all.length; i += 4) {
    const batch = all.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map(download));
    for (const r of results) {
      if (r.status === "fulfilled") {
        ok++;
        const v = r.value;
        console.log(v.skipped ? `skip  ${v.rel}` : `ok    ${v.rel} (${(v.bytes/1024).toFixed(0)}kb)`);
      } else { fail++; console.error(`FAIL  ${r.reason}`); }
    }
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed, of ${all.length}.`);
  if (fail) process.exit(1);
}
run();
