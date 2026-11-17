#!/usr/bin/env node
// Visual QA: pixel diff + text-anchored style diff between target and clone.
//   node scripts/clone/diff.mjs <targetUrl> <cloneUrl> [sel] [--clone-sel=..] [--w=1440,390] [--threshold=24] [--name=..]
// Writes docs/design-references/qa/<name>-<w>-diff.png and docs/research/qa/<name>.json.
// Exit code 2 if any width exceeds --max (default 3% mismatch).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { launch } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let argv = process.argv.slice(2);
if (argv[0] === "diff") argv = argv.slice(1);
const flags = Object.fromEntries(argv.filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const [target, clone, sel = "body"] = argv.filter((a) => !a.startsWith("--"));
if (!target || !clone) { console.log("usage: diff.mjs <targetUrl> <cloneUrl> [sel] [--clone-sel=..] [--w=1440,390]"); process.exit(1); }
const cloneSel = flags["clone-sel"] || sel;
const widths = (flags.w || "1440,390").split(",").map(Number);
const threshold = +(flags.threshold || 24);
const name = flags.name || sel.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "page";
const EXTRACT = await readFile(join(HERE, "extract.js"), "utf8");
await mkdir("docs/design-references/qa", { recursive: true });
await mkdir("docs/research/qa", { recursive: true });

async function capture(b, url, s, w) {
  await b.viewport(w);
  await b.goto(url, +(flags.settle || 1500));
  await b.evaluate(EXTRACT);
  // Freeze motion so diffs measure layout, not animation phase.
  await b.evaluate(`document.head.insertAdjacentHTML('beforeend','<style>*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}</style>');
    document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); document.querySelectorAll('video').forEach(v => v.pause())`);
  const clip = await b.evaluate(`(async () => {
    const el = document.querySelector(${JSON.stringify(s)}); if (!el) return null;
    el.scrollIntoView(); await new Promise(r => setTimeout(r, 700)); scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
    const r = el.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: Math.min(r.width, innerWidth), height: Math.min(r.height, 6000), scale: 1 };
  })()`);
  if (!clip) throw new Error(`selector not found on ${url}: ${s}`);
  const { data } = await b.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
  return { png: Buffer.from(data, "base64"), clip, text: await b.evaluate(`__cx.textmap(${JSON.stringify(s)})`) };
}

async function pixels(a, b, w) {
  const [ra, rb] = await Promise.all([a, b].map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const W = Math.min(ra.info.width, rb.info.width), H = Math.min(ra.info.height, rb.info.height);
  const out = Buffer.alloc(W * H * 4);
  const bandH = 40, bands = new Array(Math.ceil(H / bandH)).fill(0);
  let bad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ia = (y * ra.info.width + x) * 4, ib = (y * rb.info.width + x) * 4, io = (y * W + x) * 4;
    const d = Math.max(Math.abs(ra.data[ia] - rb.data[ib]), Math.abs(ra.data[ia + 1] - rb.data[ib + 1]), Math.abs(ra.data[ia + 2] - rb.data[ib + 2]));
    if (d > threshold) { bad++; bands[Math.floor(y / bandH)]++; out.set([255, 0, 64, 255], io); }
    else { const g = (ra.data[ia] + ra.data[ia + 1] + ra.data[ia + 2]) / 3; const v = 200 + g / 255 * 55; out.set([v, v, v, 255], io); }
  }
  const file = `docs/design-references/qa/${name}-${w}-diff.png`;
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
  const hot = bands.map((n, i) => ({ y: `${i * bandH}-${Math.min(H, (i + 1) * bandH)}`, pct: +(n / (W * Math.min(bandH, H - i * bandH)) * 100).toFixed(1) }))
    .filter((b) => b.pct >= 2).sort((a, b) => b.pct - a.pct).slice(0, 6);
  return { mismatchPct: +(bad / (W * H) * 100).toFixed(2), size: { target: [ra.info.width, ra.info.height], clone: [rb.info.width, rb.info.height] }, hotBands: hot, file };
}

function textDiff(ta, tb) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const pool = new Map();
  tb.forEach((e) => { const k = norm(e.t); (pool.get(k) || pool.set(k, []).get(k)).push(e); });
  const issues = [], missing = [];
  for (const a of ta) {
    const b = pool.get(norm(a.t))?.shift();
    if (!b) { missing.push(a.t); continue; }
    const d = {};
    for (const k of ["ff", "fs", "fw", "lh", "ls", "c", "tt"]) if (a[k] !== b[k]) d[k] = `${a[k]} → ${b[k]}`;
    if (Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2) d.pos = `${a.x},${a.y} → ${b.x},${b.y}`;
    if (Math.abs(a.w - b.w) > 2 || Math.abs(a.h - b.h) > 2) d.size = `${a.w}×${a.h} → ${b.w}×${b.h}`;
    if (Object.keys(d).length) issues.push({ t: a.t.slice(0, 40), ...d });
  }
  return { matched: ta.length - missing.length, of: ta.length, issues: issues.slice(0, 60), missing: missing.slice(0, 20) };
}

const b = await launch({ headed: !!flags.headed });
const report = { target, clone, sel, cloneSel, widths: {} };
let worst = 0;
try {
  for (const w of widths) {
    const A = await capture(b, target, sel, w);
    const B = await capture(b, clone, cloneSel, w);
    const px = await pixels(A.png, B.png, w);
    const tx = textDiff(A.text, B.text);
    report.widths[w] = { ...px, text: tx };
    worst = Math.max(worst, px.mismatchPct);
    const hd = px.size.clone[1] - px.size.target[1];
    console.log(`${w}px: ${px.mismatchPct}% pixels differ, height ${hd ? `${hd > 0 ? "+" : ""}${hd}px` : "equal"} | text ${tx.matched}/${tx.of} matched, ${tx.issues.length} style issues → ${px.file}`);
    if (px.hotBands.length) console.log(`  hot bands (y px): ${px.hotBands.map((h) => `${h.y} ${h.pct}%`).join(", ")}`);
    tx.issues.slice(0, 8).forEach((i) => console.log(`  "${i.t}": ${Object.entries(i).filter(([k]) => k !== "t").map(([k, v]) => `${k} ${v}`).join("; ")}`));
    if (tx.missing.length) console.log(`  missing text: ${tx.missing.slice(0, 6).map((t) => `"${t.slice(0, 30)}"`).join(", ")}`);
  }
  const p = `docs/research/qa/${name}.json`;
  await writeFile(p, JSON.stringify(report, null, 1));
  console.log(`report → ${p}`);
} finally {
  await b.close();
}
process.exitCode = worst > +(flags.max || 3) ? 2 : 0;
