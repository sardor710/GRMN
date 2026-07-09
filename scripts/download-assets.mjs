// Downloads all Garmin homepage assets into public/. Node 24+ (global fetch).
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join, basename } from "node:path";

const ROOT = process.cwd();
const IMG_DIR = join(ROOT, "public", "images");
const SEO_DIR = join(ROOT, "public", "seo");

// [remoteUrl, localRelativePath]
const RES = "https://res.garmin.com";
const CDN = "https://static.garmincdn.com";

const resPaths = [
  "/homepage/90910/en_US/90910-TN.jpg",
  "/homepage/84290/84290-TN-NEW.jpg",
  "/homepage/82292/en-US/82292-TN-blank.jpg",
  "/homepage/82420/82420-TN-NEW.jpg",
  "/homepage/80687/80687-TN-NEW.jpg",
  "/homepage/85088/85088-TN-NEW.jpg",
  "/homepage/80687/SUBCAT/80687-1-D.jpg",
  "/homepage/84290/84290-1-D.jpg",
  "/homepage/86762/en_US/CatalystRadar-D.jpg",
  "/homepage/77986/77986-1-D.jpg",
  "/homepage/82420/82420-1-D.jpg",
  "/homepage/66948/66948-1-D.jpg",
  "/homepage/80687/80687-FP.jpg",
  "/subcategory/73456/73460-FP.jpg",
  "/homepage/90910/en_US/90910-Feature-Tile.jpg",
  "/homepage/74164/74164-FT.jpg",
  "/homepage/MCJT-65125/en-US/2026/65125-26-tread2.jpg",
  "/homepage/84290/84290-FP.jpg",
  "/homepage/66948/66948-FP.jpg",
  "/homepage/77986/77986-FP.jpg",
  "/homepage/82420/82420-FT.jpg",
  "/homepage/86762/en_US/CatalystRadar-FC.png",
  "/homepage/78850/78850-FT.jpg",
  "/homepage/75802/75802-FP.jpg",
  "/homepage/90797/90797-PODS-THIRD-FORERUNNER.jpg",
  "/homepage/90797/90797-PODS-THIRD-FENIX.jpg",
  "/homepage/90797/90797-PODS-THIRD-BOUNCE.jpg",
  "/homepage/90797/90797-POD-HALF-HEALTH.jpg",
  "/homepage/90797/90797-POD-HALF-STORIES.jpg",
  "/homepage/74662/74662-smartwatch-pod.jpg",
  "/homepage/74662/74662-automotive-pod.jpg",
  "/homepage/74662/74662-sports-and-fitness-pod.jpg",
  "/homepage/MCJT-69482/46074-outdoor_recreation.jpg",
  "/homepage/74662/74662-marine-pod.jpg",
  "/homepage/MCJT-69482/46074-aviation.jpg",
];
const cdnPaths = [
  "/gdc/home-page/featured-promo-box/2022/SALE-TN-600x525.jpg",
  "/gdc/home-page/products/2019/23647-new-arrivals-image-9afb5a41-9113-4731-a3f3-c4fe8aaceffc.png",
];
const favicons = [
  "/favicons/apple-touch-icon.png",
  "/favicons/favicon-32x32.png",
  "/favicons/favicon-16x16.png",
  "/favicons/safari-pinned-tab.svg",
];

// Flatten images to basename under public/images
const jobs = [
  ...resPaths.map((p) => [RES + p, join(IMG_DIR, basename(p))]),
  ...cdnPaths.map((p) => [CDN + p, join(IMG_DIR, basename(p))]),
  ...favicons.map((p) => [CDN + p, join(SEO_DIR, basename(p))]),
];

async function exists(f) {
  try { await access(f); return true; } catch { return false; }
}

async function download([url, dest]) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return { url, ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    return { url, ok: true, bytes: buf.length, dest };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

async function run() {
  await mkdir(IMG_DIR, { recursive: true });
  await mkdir(SEO_DIR, { recursive: true });
  const results = [];
  const BATCH = 4;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const chunk = jobs.slice(i, i + BATCH);
    results.push(...(await Promise.all(chunk.map(download))));
  }
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`Downloaded ${ok.length}/${results.length}`);
  ok.forEach((r) => console.log(`  ✓ ${basename(r.dest)} (${r.bytes} bytes)`));
  if (fail.length) {
    console.log(`FAILURES (${fail.length}):`);
    fail.forEach((r) => console.log(`  ✗ ${r.url} — ${r.status || r.error}`));
    process.exitCode = 1;
  }
}
run();
