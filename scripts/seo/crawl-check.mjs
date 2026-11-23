#!/usr/bin/env node
// Owner 2026-11-23 (plan 2026-11-23-variant-seo-urls-google-xl, Task 7.1): crawls every product and variant page the
// sitemap lists, as Googlebot, and checks what search engines get. Exits non-zero on any failure.
//   BASE=https://garmin.tigr.uz node scripts/seo/crawl-check.mjs [--resolve <ip>] [--host <Host header>] [--insecure] [--limit N]
// Checks: 200; self canonical; a non-empty <title> unique per language; meta description; og:image; JSON-LD
// ProductGroup (product page) or Product with isVariantOf (variant page); old /p/<uuid> answers 404; ?variant= is
// ignored (canonical stays clean); the Merchant feeds parse and list items.
import http from "node:http";
import https from "node:https";

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASE = (process.env.BASE || "http://127.0.0.1:3123").replace(/\/+$/, "");
const HOST = flag("--host");
const LIMIT = Number(flag("--limit") || 0);
if (args.includes("--insecure")) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const headers = { "User-Agent": UA, ...(HOST ? { Host: HOST } : {}) };

const failures = [];
const fail = (url, message) => failures.push(`${url}: ${message}`);
// --resolve <ip>: connect to that address for BASE's host (TLS SNI and Host stay BASE's host), like curl --resolve.
const RESOLVE = flag("--resolve");
function get(path) {
  if (!RESOLVE && !HOST) return fetch(BASE + path, { headers, redirect: "manual" });
  const url = new URL(BASE + path);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(url, {
      headers, rejectUnauthorized: !args.includes("--insecure"), servername: HOST ?? url.hostname,
      ...(RESOLVE ? { lookup: (_host, options, callback) => options?.all ? callback(null, [{ address: RESOLVE, family: 4 }]) : callback(null, RESOLVE, 4) } : {}),
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, headers: { get: name => response.headers[name.toLowerCase()] ?? null }, text: async () => body });
      });
    });
    request.on("error", reject);
    request.end();
  });
}
const attr = (html, re) => re.exec(html)?.[1]?.replace(/&amp;/g, "&") ?? null;
const local = url => url.replace(/^https?:\/\/[^/]+/, "");

async function pool(items, size, work) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) await work(items[next++]); }));
}

const sitemap = await (await get("/sitemap.xml")).text();
let urls = [...sitemap.matchAll(/<loc>([^<]+\/p\/[^<]+)<\/loc>/g)].map(m => m[1]);
if (LIMIT) urls = urls.slice(0, LIMIT);
const site = /<loc>(https?:\/\/[^/<]+)/.exec(sitemap)?.[1] ?? BASE;
const titles = new Map();
let productPages = 0, variantPages = 0;

await pool(urls, 4, async url => {
  const path = local(url), variant = /\/p\/[^/]+\/[^/]+$/.test(path);
  const response = await get(path);
  if (response.status !== 200) return fail(path, `status ${response.status}`);
  const html = await response.text();
  // Icon <svg><title>s are not the page title (Next may stream the head's <title> after the body starts).
  const head = html.replace(/<svg[\s\S]*?<\/svg>/g, "");
  const canonical = attr(head, /<link rel="canonical" href="([^"]+)"/);
  if (canonical !== url) fail(path, `canonical ${canonical}`);
  const title = attr(head, /<title>([^<]*)<\/title>/);
  if (!title) fail(path, "no <title>");
  const lang = path.split("/")[1];
  const key = `${lang}|${title}`;
  if (titles.has(key)) fail(path, `title also on ${titles.get(key)}: ${title}`); else titles.set(key, path);
  if (!attr(head, /<meta name="description" content="([^"]+)"/)) fail(path, "no meta description");
  if (!attr(head, /<meta property="og:image" content="([^"]+)"/)) fail(path, "no og:image");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } });
  if (variant) {
    variantPages++;
    const product = ld.find(x => x?.["@type"] === "Product");
    if (!product?.isVariantOf?.productGroupID || product.url !== url || !product.offers?.price) fail(path, "Product JSON-LD missing isVariantOf/url/offer");
  } else {
    productPages++;
    const group = ld.find(x => x?.["@type"] === "ProductGroup");
    if (!group?.hasVariant?.length || group.url !== url) fail(path, "ProductGroup JSON-LD missing hasVariant/url");
  }
});

// Old keys and query links (owner: no redirects).
const sample = urls.find(u => /\/p\/[^/]+$/.test(local(u)));
const old = await get("/ru/p/00000000-0000-4000-8000-000000000000");
if (old.status !== 404) fail("/ru/p/<uuid>", `status ${old.status} (expected 404)`);
if (sample) {
  const withQuery = await get(`${local(sample)}?variant=NOPE`);
  const canonical = attr(await withQuery.text(), /<link rel="canonical" href="([^"]+)"/);
  if (withQuery.status !== 200 || canonical !== sample) fail(`${local(sample)}?variant=`, `status ${withQuery.status}, canonical ${canonical}`);
}

// Merchant feeds.
const feeds = {};
for (const file of ["en", "ru", "kz"]) {
  const response = await get(`/feeds/google/${file}.xml`);
  const xml = await response.text();
  feeds[file] = (xml.match(/<item>/g) ?? []).length;
  if (response.status !== 200 || !/^application\/xml/.test(response.headers.get("content-type") ?? "")) fail(`/feeds/google/${file}.xml`, `status ${response.status} ${response.headers.get("content-type")}`);
  if (!xml.includes("</rss>") || (xml.match(/<item>/g) ?? []).length !== (xml.match(/<\/item>/g) ?? []).length) fail(`/feeds/google/${file}.xml`, "malformed feed");
}
if (!feeds.en) fail("/feeds/google/en.xml", "no items");

console.log(JSON.stringify({ base: BASE, site, sitemapProductUrls: urls.length, productPages, variantPages, feedItems: feeds, failures: failures.length }, null, 2));
for (const line of failures.slice(0, 40)) console.log("FAIL", line);
process.exit(failures.length ? 1 : 0);
