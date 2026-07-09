// Downloads catalogue + product page assets. Node 24+.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const RES = "https://res.garmin.com";
const CDN = "https://static.garmincdn.com";

// Catalogue product card images: [id, skuPath]
const products = [
  ["1228429", "/en/products/010-02904-10/g/cf-lg.jpg"],
  ["1614061", "/en/products/010-03014-01/v/cf-lg.jpg"],
  ["1462801", "/en/products/010-02969-01/v/cf-lg.jpg"],
  ["1510465", "/en/products/010-02980-00/v/cf-lg.jpg"],
  ["1463821", "/en/products/010-02970-02/g/cf-lg.jpg"],
  ["1941179", "/en/products/010-04307-00/v/cf-lg.jpg"],
  ["1316397", "/en/products/010-02936-00/v/cf-lg.jpg"],
  ["1555457", "/en/products/010-02985-01/v/cf-lg.jpg"],
  ["1800201", "/en/products/010-03398-01/v/cf-lg.jpg"],
  ["1828641", "/en/products/010-03406-00/v/cf-lg.jpg"],
  ["851039", "/en/products/010-02751-00/g/cf-lg.jpg"],
  ["1196650", "/en/products/010-02891-00/v/cf-lg.jpg"],
  ["1815501", "/en/products/010-03399-00/v/cf-lg.jpg"],
  ["1908217", "/en/products/010-03898-00/g/cf-lg.jpg"],
  ["1765781", "/en/products/010-03393-30/g/cf-lg.jpg"],
  ["785411", "/en/products/010-02665-02/v/cf-lg.jpg"],
  ["847706", "/en/products/010-02746-02/g/cf-lg.jpg"],
];

// fenix 8 gallery views
const galleryViews = ["cf", "rf", "lf", "pd-01", "pd-02"];

// "Most popular" family PNGs
const families = [
  ["fenix", "/subcategory/67256/2-SMARTWATCH-PAGE-FENIX8.png"],
  ["venu", "/subcategory/78096/78096-smartwatch-hero-ven4.png"],
  ["forerunner", "/subcategory/80005/80005-FR970.png"],
  ["instinct", "/subcategory/68178/wearables-Instinct-3.png"],
  ["vivoactive", "/subcategory/74272/74272-60774-VA5.png"],
];

const overviewImgs = [
  ["fenix8-hero", RES + "/en/products/010-02903-00/g/66911-1-D.jpg"],
  ["fenix8-rugged", RES + "/en/products/010-02904-00/g/66912-1.jpg"],
];

const jobs = [
  ...products.map(([id, p]) => [RES + p, join(ROOT, "public/images/products", `${id}.jpg`)]),
  ...galleryViews.map((v) => [
    `${RES}/en/products/010-02904-10/v/${v}-lg.jpg`,
    join(ROOT, "public/images/products", `fenix8-${v}.jpg`),
  ]),
  ...families.map(([n, p]) => [RES + p, join(ROOT, "public/images/families", `${n}.png`)]),
  ...overviewImgs.map(([n, u]) => [u, join(ROOT, "public/images/products", `${n}.jpg`)]),
  // hero banner background — try both hosts
  [
    CDN + "/en_US/store/wearables/subcategory/2020/36340-wearables-banner-background.jpg",
    join(ROOT, "public/images", "wearables-banner-bg.jpg"),
  ],
];

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

const results = [];
for (let i = 0; i < jobs.length; i += 4) {
  results.push(...(await Promise.all(jobs.slice(i, i + 4).map(download))));
}
const ok = results.filter((r) => r.ok);
console.log(`Downloaded ${ok.length}/${results.length}`);
results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.url} — ${r.status || r.error}`));
