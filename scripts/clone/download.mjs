#!/usr/bin/env node
// Download every asset found by `inspect.mjs recon` and write a remote→local map.
//   node scripts/clone/download.mjs docs/research/<host>/recon.json [--all-srcset]
// images/bgs/posters/videos → public/images/<host>/, fonts → public/fonts/<host>/, icons/og → public/seo/
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const allSrcset = process.argv.includes("--all-srcset");
if (!file) { console.log("usage: download.mjs docs/research/<host>/recon.json [--all-srcset]"); process.exit(1); }
const recon = JSON.parse(await readFile(file, "utf8"));
const r = recon[Object.keys(recon)[0]];
const origin = r.assets.images[0]?.src ? new URL(r.assets.images[0].src).origin : "";
const host = dirname(file).split(/[\\/]/).pop();

const srcsetUrls = (s) => (s || "").split(/,\s+(?=\S)/).map((c) => c.trim().split(/\s+/)).filter((c) => c[0]);
const largest = (s) => srcsetUrls(s).sort((a, b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0))[0]?.[0];
const jobs = new Map(); // url -> dir
const add = (u, dir) => { if (!u || u.startsWith("data:") || u.startsWith("blob:")) return; try { jobs.set(new URL(u, origin || undefined).href, dir); } catch {} };

const IMG = join("public", "images", host), FONT = join("public", "fonts", host), SEO = join("public", "seo");
for (const i of r.assets.images) {
  add(i.src, IMG);
  const sets = [i.srcset, ...(i.sources || []).map((s) => s.srcset)];
  sets.forEach((s) => (allSrcset ? srcsetUrls(s).forEach((c) => add(c[0], IMG)) : add(largest(s), IMG)));
}
r.assets.backgrounds.forEach((bg) => bg.urls.forEach((u) => add(u, IMG)));
r.assets.videos.forEach((v) => { add(v.src, IMG); add(v.poster, IMG); v.sources.forEach((s) => add(s.src, IMG)); });
r.assets.icons.forEach((i) => add(i.href, SEO));
["og:image", "twitter:image"].forEach((k) => add(r.assets.meta[k], SEO));
// One file per font face: prefer woff2.
r.css.fontFaces.forEach((f) => add((f.urls.find((u) => /woff2/.test(u.format || u.url)) || f.urls[0])?.url, FONT));

const map = {};
const used = new Set();
const localName = (u, dir) => {
  const p = new URL(u);
  let base = decodeURIComponent(p.pathname.split("/").filter(Boolean).slice(-2).join("-")) || "index";
  base = base.replace(/[^\w.-]+/g, "-");
  if (!extname(base)) base += ".bin";
  let out = join(dir, base), n = 1;
  while (used.has(out)) out = join(dir, base.replace(/(\.\w+)$/, `-${n++}$1`));
  used.add(out);
  return out;
};
const list = [...jobs];
let ok = 0, fail = [];
const worker = async () => {
  while (list.length) {
    const [u, dir] = list.shift();
    try {
      const res = await fetch(u, { headers: { Referer: origin + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" } });
      if (!res.ok) throw new Error(res.status);
      let out = localName(u, dir);
      const type = res.headers.get("content-type") || "";
      if (out.endsWith(".bin")) out = out.replace(/\.bin$/, `.${(type.split("/")[1] || "bin").split(";")[0].replace("svg+xml", "svg").replace("jpeg", "jpg")}`);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, Buffer.from(await res.arrayBuffer()));
      map[u] = "/" + out.split(/[\\/]/).slice(1).join("/");
      ok++;
    } catch (e) { fail.push(`${u} (${e.message})`); }
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
const mapFile = join(dirname(file), "assets-map.json");
await writeFile(mapFile, JSON.stringify(map, null, 1));
console.log(`downloaded ${ok}/${jobs.size} → public/ ; map → ${mapFile}`);
if (fail.length) console.log(`failed ${fail.length}:\n  ${fail.slice(0, 15).join("\n  ")}`);
