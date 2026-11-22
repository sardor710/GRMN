// A5: one allowlist for the CKEditor config and the server sanitizer. The editor's data model cannot run in
// node, so this pins the sanitizer contract for everything the editor emits and the importer produces:
// import → sanitize → (editor) → sanitize → storefront keeps the allowed markup and drops everything else.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGarminProduct, sanitizeOverviewHtml } from "../../src/lib/import/garmin-parse.js";
import {
  OVERVIEW_CLASSES,
  OVERVIEW_LAYOUT_CLASSES,
  OVERVIEW_TAGS,
  isAllowedOverviewImageSrc,
  isAllowedOverviewMediaUrl,
  overviewHtmlSupportRules,
} from "../../src/lib/overview/allowlist.ts";
import { legacyVideoToMedia, renderOverviewVideos } from "../../src/lib/overview/video.ts";

const fixture = (name) => fs.readFileSync(new URL(`../fixtures/garmin/${name}.html`, import.meta.url), "utf8");
const imported = (name) =>
  parseGarminProduct(fixture(name), { sourceUrl: "https://www.garmin.com/en-US/p/1", rateKztPerUsd: 500, now: "2026-11-21T00:00:00.000Z" }).product.overviewHtml;

/** Rewrites res.garmin.com image URLs the way the import route does after downloading them. */
const localize = (html) => html.replace(/src="https:\/\/res\.garmin\.com\/([^"]+)"/g, (_, path) => `src="/uploads/products/garmin/x/overview/${path.split("/").pop()}"`);

// What CKEditor 5 (ClassicEditor + Image/Table/MediaEmbed/List/Link/BlockQuote/Heading + GHS) emits for an
// edited Garmin overview, in Russian and Kazakh.
const EDITOR_OUTPUT = [
  '<section class="ov-intro"><h2>fēnix® 9 Pro — новый уровень</h2><p>Қазақша мәтін және <strong>жирный</strong> <i>курсив</i>.</p></section>',
  '<h3>Подзаголовок</h3><h4>Мелкий заголовок</h4>',
  '<ul><li>Пункт один</li><li>Пункт <a href="https://www.garmin.com/ru-RU/">два</a></li></ul><ol><li>Первый</li></ol>',
  "<blockquote><p>Цитата</p></blockquote>",
  '<figure class="image"><img src="/uploads/products/2026/11/a.webp" alt="Часы" width="1200" height="800"><figcaption>Подпись</figcaption></figure>',
  '<figure class="table"><table><thead><tr><th>Модель</th><th colspan="2">Батарея</th></tr></thead><tbody><tr><td rowspan="2">51 мм</td><td>до 29 дней</td><td>GPS</td></tr></tbody></table></figure>',
  '<figure class="media"><oembed url="https://youtu.be/G9LZgkrKj7U?si=x"></oembed></figure>',
  '<div class="ov-features"><div class="ov-feature"><figure class="image"><img src="https://res.garmin.com/en/products/a.jpg" alt="A"></figure><h3>Карточка</h3><p>Текст</p></div></div>',
  '<div class="ov-highlight"><img src="/uploads/icon.png" alt=""><p>Значок</p></div>',
  '<figure class="ov-lifestyle"><img src="/uploads/life.jpg" alt=""><figcaption>Живи ярче<br>Купить</figcaption></figure>',
  '<p class="ov-disclaimer"><sup>1</sup> Сноска</p>',
].join("");

test("imported garmin.com overviews survive a second sanitize unchanged (idempotent round trip)", () => {
  for (const name of ["fenix9", "venu4", "edge1060"]) {
    const html = imported(name);
    assert.ok(html.length > 1000, `${name}: overview imported`);
    assert.equal(sanitizeOverviewHtml(html), html, `${name}: sanitize is stable`);
    const local = localize(html);
    assert.equal(sanitizeOverviewHtml(local), local, `${name}: /uploads images kept`);
  }
});

test("imported fēnix 9 overview keeps headings, garmin.com layout blocks, media blocks and images", () => {
  const html = localize(imported("fenix9"));
  // The importer keeps garmin.com's layout (overviewFromGarmin): banners with text over the photo, themed sections,
  // column grids of cards, headlines and footnotes.
  for (const marker of ["<h2>", "<h3>", '<section class="ov-section ov-intro', '<div class="ov-banner ', '<div class="ov-banner-text">', '<div class="ov-cols ov-cols-', '<div class="ov-card', '<div class="ov-highlight">', '<p class="ov-disclaimer">']) {
    assert.ok(html.includes(marker), `keeps ${marker}`);
  }
  assert.match(html, /<figure class="media"><oembed url="https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}"><\/oembed><\/figure>/);
  assert.match(html, /<img src="\/uploads\/products\/garmin\/x\/overview\/[^"]+" alt="[^"]*" loading="lazy" \/>/);
});

test("editor output (RU/KK text, lists, quotes, image/table/media figures, ov-* blocks) round-trips", () => {
  const once = sanitizeOverviewHtml(EDITOR_OUTPUT);
  assert.equal(sanitizeOverviewHtml(once), once, "stable");
  for (const marker of [
    "fēnix® 9 Pro — новый уровень", "Қазақша мәтін", "<strong>жирный</strong>", "<i>курсив</i>", "<h3>Подзаголовок</h3>", "<h4>Мелкий заголовок</h4>",
    "<ul><li>Пункт один</li>", "<ol><li>Первый</li></ol>", "<blockquote><p>Цитата</p></blockquote>",
    '<figure class="image"><img src="/uploads/products/2026/11/a.webp" alt="Часы" width="1200" height="800" loading="lazy" /><figcaption>Подпись</figcaption></figure>',
    '<figure class="table"><table><thead><tr><th>Модель</th><th colspan="2">Батарея</th></tr></thead><tbody><tr><td rowspan="2">51 мм</td>',
    '<div class="ov-features"><div class="ov-feature"><figure class="image"><img src="https://res.garmin.com/en/products/a.jpg"',
    '<div class="ov-highlight">', '<figure class="ov-lifestyle">', "<figcaption>Живи ярче<br />Купить</figcaption>", '<p class="ov-disclaimer"><sup>1</sup> Сноска</p>',
    '<a href="https://www.garmin.com/ru-RU/" rel="noopener noreferrer" target="_blank">два</a>',
  ]) {
    assert.ok(once.includes(marker), `keeps ${marker}`);
  }
  // Any pasted YouTube form is stored as one canonical watch URL.
  assert.ok(once.includes('<figure class="media"><oembed url="https://www.youtube.com/watch?v=G9LZgkrKj7U"></oembed></figure>'));
});

test("strips scripts, styles, handlers, javascript: URLs, foreign iframes/images and non-YouTube embeds", () => {
  const hostile = [
    "<script>alert(1)</script><style>body{display:none}</style>",
    '<h2 onclick="alert(1)" style="color:red" class="fixed inset-0">Title</h2>',
    '<p onmouseover="x()">a <a href="javascript:alert(1)">js</a> <a href="JaVaScRiPt:alert(1)">js2</a> <a href="//evil.example/x">proto</a> <a href="data:text/html,x">data</a></p>',
    '<iframe src="https://evil.example/frame"></iframe><iframe src="https://www.youtube.com/embed/G9LZgkrKj7U"></iframe>',
    '<object data="x.swf"></object><embed src="x.swf"><form action="https://evil.example"><input name="q"></form>',
    '<img src="https://evil.example/x.png"><img src="javascript:alert(1)"><img src="/uploads/../../etc/passwd"><img src="/uploads/ok.jpg" onerror="alert(1)" width="100%" height="9">',
    '<figure class="media"><oembed url="https://vimeo.com/12345"></oembed></figure>',
    '<figure class="media"><oembed url="javascript:alert(1)"></oembed></figure>',
    '<figure class="media"><oembed url="https://www.youtube.com.evil.example/watch?v=G9LZgkrKj7U"></oembed></figure>',
    '<div class="ov-feature evil" data-x="1" id="x">kept text</div><svg><script>alert(1)</script></svg><math></math>',
    '<a href="https://www.garmin.com/" target="_self" rel="opener">ok</a>',
  ].join("");
  const out = sanitizeOverviewHtml(hostile);
  assert.doesNotMatch(out, /<script|<style|<iframe|<object|<embed|<form|<input|<svg|onclick|onmouseover|onerror|style=|javascript:|data:text|evil\.example|vimeo|<oembed url="j/i);
  assert.ok(out.includes("<h2>Title</h2>"), "class on a non-allowlisted element is dropped");
  assert.ok(out.includes('<div class="ov-feature">kept text</div>'), "only allowlisted classes kept; id/data-* dropped");
  assert.ok(out.includes('<img src="/uploads/ok.jpg" height="9" loading="lazy" />'), "non-numeric width dropped, handler dropped");
  assert.ok(!out.includes("passwd"), "path traversal in /uploads rejected");
  assert.ok(!/<figure class="media">/.test(out), "empty media figures removed");
  assert.ok(out.includes('<a href="https://www.garmin.com/" target="_blank" rel="noopener noreferrer">ok</a>'), "links forced to a new tab without opener");
});

test("the CKEditor GHS rules and the sanitizer read the same allowlist", () => {
  const rules = overviewHtmlSupportRules();
  for (const [tag, classes] of Object.entries(OVERVIEW_LAYOUT_CLASSES)) {
    const rule = rules.find((item) => item.name === tag);
    assert.ok(rule, `GHS allows <${tag}>`);
    assert.deepEqual(rule.classes, [...classes]);
    for (const cls of classes) {
      assert.ok(OVERVIEW_CLASSES[tag].includes(cls), `sanitizer keeps ${tag}.${cls}`);
      // <img> is void and needs an allowed source (beta5: the garmin.com layout classes also sit on images).
      const html = tag === "img" ? `<img src="/uploads/a.jpg" alt="" class="${cls}">` : `<${tag} class="${cls}">x</${tag}>`;
      assert.match(sanitizeOverviewHtml(html), new RegExp(`class="${cls}"`));
    }
  }
  for (const rule of rules) assert.ok(OVERVIEW_TAGS.includes(rule.name), `GHS rule <${rule.name}> is a sanitizer tag`);
  assert.equal(isAllowedOverviewImageSrc("/uploads/a.jpg"), true);
  assert.equal(isAllowedOverviewImageSrc("https://res.garmin.com/a.jpg"), true);
  assert.equal(isAllowedOverviewImageSrc("https://evil.example/a.jpg"), false);
  assert.equal(isAllowedOverviewImageSrc("/uploads/../x"), false);
  assert.equal(isAllowedOverviewMediaUrl("https://youtu.be/G9LZgkrKj7U"), true);
  assert.equal(isAllowedOverviewMediaUrl("https://vimeo.com/1"), false);
});

test("legacy ov-video → media in the editor, then storefront posters, all through the sanitizer", () => {
  const legacy = sanitizeOverviewHtml(
    '<div class="ov-video"><a href="https://www.youtube-nocookie.com/embed/bdOC8EBYs_E"><img src="/uploads/p.jpg" alt="Watch the video"></a></div>',
  );
  assert.match(legacy, /<div class="ov-video"><a href="https:\/\/www\.youtube-nocookie\.com\/embed\/bdOC8EBYs_E"/);
  // Storefront renders the legacy block as a poster with the imported image, without saving anything.
  assert.match(renderOverviewVideos(legacy), /<div class="ov-yt ov-yt-banner" data-yt-id="bdOC8EBYs_E"><a [^>]*><img src="\/uploads\/p\.jpg"/);
  // The editor converts it to a media block; saving keeps that block.
  const edited = sanitizeOverviewHtml(legacyVideoToMedia(legacy));
  assert.equal(edited, '<figure class="media"><oembed url="https://www.youtube.com/watch?v=bdOC8EBYs_E"></oembed></figure>');
  assert.match(renderOverviewVideos(edited), /<div class="ov-yt" data-yt-id="bdOC8EBYs_E">/);
});
