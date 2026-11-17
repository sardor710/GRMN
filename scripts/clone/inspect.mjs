#!/usr/bin/env node
// Clone inspector: headless Chrome + extract.js. Writes full JSON to disk, prints a short summary.
//
//   node scripts/clone/inspect.mjs <cmd> <url> [args] [--w=1440] [--out=docs/research/<host>] [--headed]
//
//   recon   <url>                    tokens, fonts(+@font-face files), breakpoints, keyframes, layers,
//                                    libs, assets, topology, scroll/IO hooks, section screenshots
//   section <url> <sel> [name]       style tree + svgs + screenshot of one section, at each --w
//   states  <url> <sel> [name]       :hover/:focus-visible/:active diffs (CSS-forced) + JS-hover diffs
//   scroll  <url> <sel> [y,y,..]     style diff of <sel> after scrolling to each y (default 0,120,600)
//   responsive <url> <sel> [name]    layout-only diffs across --w (default 1440,1024,768,390)
//   shot    <url> <sel|page> [name]  clipped screenshot(s)
//   diff    <targetUrl> <cloneUrl> [sel] [--clone-sel=..]   pixel + text-style diff (see diff.mjs)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const [cmd, url, a1, a2] = argv.filter((a) => !a.startsWith("--"));
if (!cmd || !url) { console.log((await readFile(fileURLToPath(import.meta.url), "utf8")).split("\n").slice(1, 14).join("\n")); process.exit(1); }
if (cmd === "diff") { await import("./diff.mjs"); process.exit(0); }

const host = new URL(url).hostname.replace(/^www\./, "") || "local";
const OUT = flags.out || join("docs", "research", host);
const SHOTS = join("docs", "design-references", host);
await mkdir(OUT, { recursive: true });
await mkdir(SHOTS, { recursive: true });
const widths = (flags.w || (cmd === "responsive" ? "1440,1024,768,390" : "1440")).split(",").map(Number);
const slug = (s) => s.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "page";
const save = async (name, data) => { const p = join(OUT, `${name}.json`); await writeFile(p, JSON.stringify(data, null, 1)); return p; };
const kb = (o) => `${(JSON.stringify(o).length / 1024).toFixed(1)}KB`;

const EXTRACT = await readFile(join(HERE, "extract.js"), "utf8");
// Logs IntersectionObserver / scroll listeners / rAF-driven scroll code before page scripts run.
const HOOKS = `(() => {
  const log = (window.__cxHooks = { io: [], scroll: 0, wheel: 0, resizeObs: 0 });
  const IO = window.IntersectionObserver;
  if (IO) window.IntersectionObserver = class extends IO {
    constructor(cb, o = {}) { super(cb, o); this.__e = { rootMargin: o.rootMargin || "0px", threshold: o.threshold ?? 0, targets: [] }; log.io.push(this.__e); }
    observe(t) { if (this.__e.targets.length < 6) this.__e.targets.push(t); return super.observe(t); }
  };
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (type === "scroll") log.scroll++; if (type === "wheel") log.wheel++;
    return add.call(this, type, ...rest);
  };
})();`;

const b = await launch({ headed: !!flags.headed });
const sheets = [];
b.on("CSS.styleSheetAdded", ({ header }) => sheets.push(header));
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: HOOKS });

const open = async (width, target = url) => {
  sheets.length = 0;
  await b.viewport(width);
  await b.goto(target, +(flags.settle || 1500));
  await b.evaluate(EXTRACT);
  await b.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')");
};
const cx = (expr) => b.evaluate(`(() => { const r = __cx.${expr}; return r; })()`);

async function shot(selector, file) {
  const clip = await b.evaluate(`(async () => {
    const el = ${selector === "page" ? "document.documentElement" : `document.querySelector(${JSON.stringify(selector)})`};
    if (!el) return null;
    el.scrollIntoView({ block: "start" }); await new Promise(r => setTimeout(r, 600)); scrollTo(0, 0); await new Promise(r => setTimeout(r, 150));
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x + scrollX), y: Math.max(0, r.y + scrollY), width: Math.min(r.width, innerWidth), height: Math.min(${selector === "page" ? "document.documentElement.scrollHeight" : "r.height"}, 6000), scale: 1 };
  })()`);
  if (!clip || !clip.width || !clip.height) return null;
  const { data } = await b.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}

// All stylesheets (incl. cross-origin) via CDP: breakpoints, keyframes, @font-face with absolute URLs.
async function cssFacts() {
  const media = {}, keyframes = {}, fontFaces = [];
  for (const h of sheets) {
    let text = "";
    try { ({ text } = await b.send("CSS.getStyleSheetText", { styleSheetId: h.styleSheetId })); } catch { continue; }
    const base = h.sourceURL || url;
    for (const m of text.matchAll(/@media([^{]+)\{/g)) { const q = m[1].trim().replace(/\s+/g, " "); media[q] = (media[q] || 0) + 1; }
    for (const m of text.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) keyframes[m[1]] ||= m[2].replace(/\s+/g, " ").trim().slice(0, 600);
    for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const body = m[1]; const get = (p) => body.match(new RegExp(`${p}\\s*:\\s*([^;]+)`, "i"))?.[1].trim();
      const urls = [...body.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/g)].map((u) => { try { return { url: new URL(u[1], base).href, format: u[2] }; } catch { return null; } }).filter(Boolean);
      fontFaces.push({ family: get("font-family")?.replace(/['"]/g, ""), weight: get("font-weight"), style: get("font-style"), display: get("font-display"),
        unicodeRange: get("unicode-range"), features: get("font-feature-settings"), urls });
    }
  }
  const px = {};
  for (const [q, n] of Object.entries(media)) for (const m of q.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
    const v = m[3] === "px" ? +m[2] : +m[2] * 16; const k = `${m[1]} ${v}`; px[k] = (px[k] || 0) + n;
  }
  const breakpoints = Object.entries(px).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, n]) => `${k}px ×${n}`);
  const other = Object.keys(media).filter((q) => !/width/.test(q)).slice(0, 12);
  return { breakpoints, otherMedia: other, keyframes, fontFaces };
}

try {
  if (cmd === "recon") {
    const out = {};
    for (const w of widths) {
      await open(w);
      const r = { topology: await cx("topology()"), layers: await cx("layers()") };
      if (w === widths[0]) {
        Object.assign(r, { tokens: await cx("tokens()"), fonts: await cx("fonts()"), css: await cssFacts(), libs: await cx("libs()"),
          assets: await cx("assets()"), animations: await cx("animations()") });
        r.hooks = await b.evaluate(`(() => { const h = window.__cxHooks || {}; return { ...h, io: (h.io || []).map(e => ({ ...e, targets: e.targets.map(t => __cx.sel(t)) })) }; })()`);
        await shot("page", join(SHOTS, `page-${w}.png`));
        // Section screenshots, not full-page dumps for review.
        for (const [i, s] of r.topology.entries()) await shot(s.sel, join(SHOTS, `s${String(i).padStart(2, "0")}-${slug(s.h || s.tag)}-${w}.png`));
      }
      out[w] = r;
    }
    const first = out[widths[0]];
    const p = await save("recon", out);
    console.log(`recon → ${p} (${kb(out)}); shots → ${SHOTS}`);
    console.log(`sections: ${first.topology.map((s, i) => `s${i} ${s.tag}${s.pos !== "static" ? `[${s.pos}]` : ""} "${(s.h || "").slice(0, 24)}" ${s.r[3]}px`).join(" | ")}`);
    console.log(`fonts: ${[...new Set(first.css.fontFaces.map((f) => `${f.family} ${f.weight || ""}`))].join(", ") || first.fonts.map((f) => f.family).join(", ")}`);
    console.log(`breakpoints: ${first.css.breakpoints.join(", ")}`);
    console.log(`keyframes: ${Object.keys(first.css.keyframes).join(", ") || "none"} | libs: ${Object.keys(first.libs).join(", ") || "none"}`);
    console.log(`IO observers: ${first.hooks.io.length}, scroll listeners: ${first.hooks.scroll} | layers: ${first.layers.length} | images: ${first.assets.images.length}, bgs: ${first.assets.backgrounds.length}, videos: ${first.assets.videos.length}`);
  }

  else if (cmd === "section" || cmd === "shot") {
    if (!a1) throw new Error("selector required");
    const name = slug(a2 || a1);
    for (const w of widths) {
      await open(w);
      const file = await shot(a1, join(SHOTS, `${name}-${w}.png`));
      if (cmd === "shot") { console.log(file || `not found: ${a1}`); continue; }
      const data = await cx(`section(${JSON.stringify(a1)}, ${+(flags.depth || 10)})`);
      if (data.error) throw new Error(data.error);
      data.animations = await cx("animations()");
      const p = await save(`section-${name}-${w}`, data);
      const count = (n) => 1 + (n.c || []).reduce((s, c) => s + count(c), 0);
      console.log(`${w}: ${p} (${kb(data)}, ${count(data.tree)} nodes, ${data.svgs.length} svgs) shot ${file}`);
    }
  }

  else if (cmd === "states") {
    if (!a1) throw new Error("selector required");
    await open(widths[0]);
    const items = await cx(`interactive(${JSON.stringify(a1)}, ${+(flags.max || 30)})`);
    await b.evaluate(`document.head.insertAdjacentHTML('beforeend', '<style id=cx-nt>*,*::before,*::after{transition:none!important;animation-play-state:paused!important}</style>')`);
    const { root } = await b.send("DOM.getDocument", { depth: 0 });
    const results = [];
    for (const it of items) {
      const { nodeId } = await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: it.sel }).catch(() => ({}));
      if (!nodeId) continue;
      const S = JSON.stringify(it.sel);
      const base = await cx(`snap(${S}, 2)`);
      const r = { sel: it.sel, label: it.label, transition: it.transition !== "all 0s ease 0s" ? it.transition : undefined };
      for (const st of ["hover", "focus-visible", "active"]) {
        await b.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [st] });
        await sleep(30);
        const d = await b.evaluate(`__cx.diff(${JSON.stringify(base)}, __cx.snap(${S}, 2))`);
        if (Object.keys(d).length) r[st] = d;
      }
      await b.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      // Real pointer hover catches JS-driven menus/tooltips that :hover forcing misses.
      const pt = await b.evaluate(`(() => { const e = document.querySelector(${S}); e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
      const region = await cx(`snap(${JSON.stringify(a1)}, 6)`);
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt[0], y: pt[1] });
      await sleep(+(flags.wait || 450));
      const jd = await b.evaluate(`(() => { const d = __cx.diff(${JSON.stringify(region)}, __cx.snap(${JSON.stringify(a1)}, 6)); return Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith(${S}))); })()`);
      if (Object.keys(jd).length) r.jsHover = jd;
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
      await sleep(150);
      results.push(r);
    }
    const name = slug(a2 || a1);
    const p = await save(`states-${name}`, results);
    console.log(`states → ${p} (${kb(results)}); ${results.length} controls`);
    for (const r of results) console.log(`  ${r.label.slice(0, 28).padEnd(28)} ${["hover", "focus-visible", "active", "jsHover"].filter((k) => r[k]).map((k) => `${k}:${Object.keys(r[k]).length}`).join(" ") || "no change"}${r.transition ? ` | ${r.transition.slice(0, 60)}` : ""}`);
  }

  else if (cmd === "scroll") {
    if (!a1) throw new Error("selector required");
    const ys = (a2 || "0,120,600").split(",").map(Number);
    await open(widths[0]);
    const S = JSON.stringify(a1);
    await b.evaluate("scrollTo(0, 0)"); await sleep(400);
    const base = await cx(`snap(${S}, 3, true)`);
    const out = { sel: a1, steps: {} };
    for (const y of ys.filter((v) => v > 0)) {
      await b.evaluate(`scrollTo(0, ${y})`);
      await sleep(+(flags.wait || 700));
      // Rects of fixed/sticky elements are viewport-relative: compare without page offset noise.
      out.steps[y] = await b.evaluate(`__cx.diff(${JSON.stringify(base)}, __cx.snap(${S}, 3, true))`);
    }
    out.hooks = await b.evaluate("window.__cxHooks && { io: __cxHooks.io.length, scroll: __cxHooks.scroll }");
    const p = await save(`scroll-${slug(a1)}`, out);
    console.log(`scroll → ${p} (${kb(out)})`);
    for (const [y, d] of Object.entries(out.steps)) console.log(`  y=${y}: ${Object.keys(d).length} elements changed${Object.keys(d).length ? ` e.g. ${JSON.stringify(Object.values(d)[0]).slice(0, 140)}` : ""}`);
  }

  else if (cmd === "responsive") {
    if (!a1) throw new Error("selector required");
    const S = JSON.stringify(a1);
    const snaps = {};
    for (const w of widths) { await open(w); snaps[w] = await cx(`snap(${S}, 4)`); }
    await open(widths[0]);
    const out = { sel: a1, base: widths[0], css: await cssFacts().then((c) => c.breakpoints), diffs: {} };
    for (const w of widths.slice(1)) out.diffs[w] = await b.evaluate(`__cx.diff(${JSON.stringify(snaps[widths[0]])}, ${JSON.stringify(snaps[w])}, true)`);
    const p = await save(`responsive-${slug(a2 || a1)}`, out);
    console.log(`responsive → ${p} (${kb(out)}); css breakpoints: ${out.css.slice(0, 8).join(", ")}`);
    for (const [w, d] of Object.entries(out.diffs)) console.log(`  ${w}: ${Object.keys(d).length} elements differ from ${widths[0]}`);
  }

  else throw new Error(`unknown command: ${cmd}`);
} finally {
  await b.close();
}
