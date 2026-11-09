import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "public", "homepage");
const entries = [
  ...[
    ["holiday", "2025-HOLIDAY/1-HOLIDAY-GIFT-GUIDE/HOLIDAY-GIFT-GUIDE", ["1-D", "2-T", "3-M"]],
    ["fenix9", "87582/87582", ["1-D", "2-T", "3-M"]],
    ["cirqa", "85883/85883", ["1-D", "2-T", "3-M"]],
    ["descent", "87964/87964", ["1-D", "2-T", "3-M"]],
    ["forerunner", "84290/84290", ["1-D", "2-T", "3-M"]],
    ["venu4", "77986/77986", ["1-D", "2-T", "3-M"]],
  ].flatMap(([name, path, variants]) => variants.map((variant) => [
    `hero/${name}-${variant}.jpg`,
    `https://res.garmin.com/homepage/${path}-${variant}.jpg`,
  ])),
  ["featured/holiday.jpg", "https://res.garmin.com/homepage/2025-HOLIDAY/1-HOLIDAY-GIFT-GUIDE/Phase-1-EDGE-TO-EDGE-FT.jpg"],
  ["featured/fenix9.jpg", "https://res.garmin.com/homepage/92958/92958-FP-V2-1.jpg"],
  ["featured/cirqa.jpg", "https://res.garmin.com/homepage/85883/85883-FT.jpg"],
  ["featured/descent.jpg", "https://res.garmin.com/homepage/87964/87964-FP.jpg"],
  ["featured/venu4.jpg", "https://res.garmin.com/homepage/77986/77986-FP.jpg"],
  ["featured/bounce2.jpg", "https://res.garmin.com/homepage/78738/en-US/78738-FEATURE.jpg"],
  ["featured/forerunner.jpg", "https://res.garmin.com/homepage/84290/84290-FP.jpg"],
  ["featured/approach.jpg", "https://res.garmin.com/homepage/74164/74164-FT.jpg"],
  ["featured/vivoactive.jpg", "https://res.garmin.com/homepage/MCJT-65125/en-US/2026/65125-vivoactive5.jpg"],
  ["featured/tacx.jpg", "https://res.garmin.com/static-images/gdc/home-page/featured/2023/63721-TACX-FP.jpg"],
  ["pods/forerunner.jpg", "https://res.garmin.com/homepage/90797/90797-PODS-THIRD-FORERUNNER.jpg"],
  ["pods/fenix9.jpg", "https://res.garmin.com/homepage/87582/87582-PODS-THIRD.jpg"],
  ["pods/bounce.jpg", "https://res.garmin.com/homepage/90797/90797-PODS-THIRD-BOUNCE.jpg"],
  ["pods/health.jpg", "https://res.garmin.com/homepage/90797/90797-POD-HALF-HEALTH.jpg"],
  ["pods/stories.jpg", "https://res.garmin.com/homepage/90797/90797-POD-HALF-STORIES.jpg"],
  ["categories/smartwatches.jpg", "https://res.garmin.com/homepage/74662/74662-smartwatch-pod.jpg"],
  ["categories/auto.jpg", "https://res.garmin.com/homepage/74662/74662-automotive-pod.jpg"],
  ["categories/sports.jpg", "https://res.garmin.com/homepage/74662/74662-sports-and-fitness-pod.jpg"],
  ["categories/outdoor.jpg", "https://res.garmin.com/homepage/MCJT-69482/46074-outdoor_recreation.jpg"],
  ["categories/marine.jpg", "https://res.garmin.com/homepage/74662/74662-marine-pod.jpg"],
  ["categories/aviation.jpg", "https://res.garmin.com/homepage/MCJT-69482/46074-aviation.jpg"],
  ["fonts/oswald.otf", "https://fonts.garmin.com/fonts/superscripts-oswald/Superscript-Oswald-Regular.otf"],
  ["fonts/roboto.otf", "https://fonts.garmin.com/fonts/superscripts-roboto/Superscript-Roboto-Regular.otf"],
];

let next = 0;
let failed = 0;
async function worker() {
  while (next < entries.length) {
    const [path, url] = entries[next++];
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const destination = join(root, path);
      await mkdir(join(destination, ".."), { recursive: true });
      const bytes = Buffer.from(await res.arrayBuffer());
      await writeFile(destination, bytes);
      console.log(`${path} ${bytes.length}`);
    } catch (error) {
      failed++;
      console.error(`${path}: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`Downloaded ${entries.length - failed}/${entries.length} homepage assets`);
if (failed) process.exitCode = 1;
