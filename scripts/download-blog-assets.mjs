// Downloads Garmin blog header images. Node 24+.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const BASE = "https://www.garmin.com";
const OUT = join(ROOT, "public", "images", "blog");

// [localName, remotePath]
const jobs = [
  ["hero", "/en-US/blog/wp-content/uploads/2026/07/blog-outdoor_recreation-desktop.jpg"],
  ["outdoor-maps-plus", "/en-US/blog/wp-content/uploads/2026/07/Outdoor-Maps-blog-header-image.jpg"],
  ["train-for-triathlon", "/en-US/blog/wp-content/uploads/2024/12/triathlon-update-header-image.jpg"],
  ["smartwatch-features-for-women", "/en-US/blog/wp-content/uploads/2024/03/Garmin-Smartwatch-Features-for-Women-header-image.jpg"],
  ["situational-awareness-water", "/en-US/blog/wp-content/uploads/2026/06/cropped-situational-awareness-header-image.jpg"],
  ["inreach-sailboat-rescue", "/en-US/blog/wp-content/uploads/2025/11/Sailboat-story_1.jpg"],
  ["smartwatches-work-with-phone", "/en-US/blog/wp-content/uploads/2022/09/cropped3-yes-smartwatches-work-with-your-phone-header-image.jpg"],
  ["what-does-your-boat-need", "/en-US/blog/wp-content/uploads/2021/08/20240429_Support_MRN_8005_RGB-1.jpg"],
  ["health-glimpse-biometrics", "/en-US/blog/wp-content/uploads/2026/06/mh-glimpse-header-image-1.jpg"],
  ["garmin-for-truck-drivers", "/en-US/blog/wp-content/uploads/2025/09/truck-driver-header-image.jpg"],
  ["which-smartwatch-is-right", "/en-US/blog/wp-content/uploads/2026/06/update-garmin-smartwatch-US-header-image-1.jpg"],
  ["chasing-outdoors-sidney-smith", "/en-US/blog/wp-content/uploads/2026/06/sidney-smith-header-image.jpg"],
  ["which-running-smartwatch", "/en-US/blog/wp-content/uploads/2022/11/running-watch-header-image.jpg"],
];

async function dl([name, path]) {
  const url = BASE + path;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return { url, ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = join(OUT, `${name}.jpg`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    return { name, ok: true, bytes: buf.length };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

await mkdir(OUT, { recursive: true });
const results = [];
for (let i = 0; i < jobs.length; i += 4) {
  results.push(...(await Promise.all(jobs.slice(i, i + 4).map(dl))));
}
const ok = results.filter((r) => r.ok);
console.log(`Downloaded ${ok.length}/${results.length}`);
results.filter((r) => !r.ok).forEach((r) => console.log(`  x ${r.url} — ${r.status || r.error}`));
