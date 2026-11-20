#!/usr/bin/env node
// Task C-c evidence: catalogue compare mode with three products, garmin.com beside ours, at 1440 and 390.
//   node scripts/clone/catalogue-compare-shots.mjs [oursOrigin=http://localhost:3107]
// Writes docs/design-references/garmin-compare/catalogue-compare-{garmin,ours,side-by-side}-<w>.png.
// Before each capture it waits until the bar shows the three chosen slots (`li[title]`): our selection is seeded on
// the client after hydration, so a fixed settle time could capture the server render (empty bar). The dev server
// sometimes serves a chunk mid-rewrite (a SyntaxError in the page, no hydration): the page is then reloaded, at most
// three loads in all, before giving up.
import sharp from "sharp";
import { launch, sleep } from "./cdp.mjs";

const OUT = "docs/design-references/garmin-compare";
const ORIGIN = process.argv[2] || "http://localhost:3107";
const PAGES = [
  ["garmin", "https://www.garmin.com/en-US/c/wearables-smartwatches/?compare=1&compareProduct=1462801&compareProduct=1510465&compareProduct=1555457", ".compare-banner .compare-item img", ".product-card__compare-card"],
  ["ours", `${ORIGIN}/en/c/wearables-smartwatches?compare=1&item=marq-carbon-golfer&item=marq-adventurer-damascus&item=marq-captain`, "[data-compare-bar] li[title]", "[data-product-card]"],
];
const FREEZE = `document.head.insertAdjacentHTML('beforeend','<style>*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}</style>');document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager');`;

const b = await launch({});
const pageErrors = [];
b.on("Runtime.exceptionThrown", (e) => pageErrors.push(`${String(e.exceptionDetails.exception?.description || e.exceptionDetails.text).split("\n")[0]} @ ${e.exceptionDetails.url}`));

/** Loads the page until it shows three chosen products; reloads when it does not hydrate. Returns the load count. */
async function loadReady(who, w, url, ready) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    pageErrors.length = 0;
    await b.goto(url, 1500);
    for (let i = 0; i < 60; i++) {
      if ((await b.evaluate(`document.querySelectorAll(${JSON.stringify(ready)}).length`)) >= 3) return attempt;
      if (pageErrors.some((e) => e.startsWith("SyntaxError"))) break;
      await sleep(250);
    }
    console.log(`${who} ${w}: not ready on load ${attempt}${pageErrors.length ? ` (${pageErrors[0]})` : ""}, reloading`);
  }
  throw new Error(`${who} ${w}: the compare bar never showed three products`);
}

try {
  for (const w of [1440, 390]) {
    const files = [];
    for (const [who, url, ready, card] of PAGES) {
      await b.viewport(w);
      await loadReady(who, w, url, ready);
      await b.evaluate(FREEZE);
      await b.evaluate(`(async () => { document.querySelector(${JSON.stringify(card)}).scrollIntoView(); await new Promise(r => setTimeout(r, 400)); scrollBy(0, ${w >= 1024 ? -200 : -120}); await new Promise(r => setTimeout(r, 1200)); })()`);
      const { data } = await b.send("Page.captureScreenshot", { format: "png" });
      const file = `${OUT}/catalogue-compare-${who}-${w}.png`;
      await sharp(Buffer.from(data, "base64")).toFile(file);
      files.push(file);
    }
    const [a, c] = await Promise.all(files.map((f) => sharp(f).metadata()));
    await sharp({ create: { width: a.width + c.width + 16, height: Math.max(a.height, c.height), channels: 4, background: "#ff0040" } })
      .composite([{ input: files[0], left: 0, top: 0 }, { input: files[1], left: a.width + 16, top: 0 }])
      .png().toFile(`${OUT}/catalogue-compare-side-by-side-${w}.png`);
    console.log(`${w}: ${files.join(", ")}`);
  }
} finally {
  await b.close();
}
