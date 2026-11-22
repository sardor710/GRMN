// The ONE overview HTML allowlist (plan M5.2). Read by:
//  - sanitizeOverviewHtml (src/lib/import/garmin-parse.js): the server-side sanitizer that runs on import and
//    on every admin save, and is the only thing that decides what reaches the storefront;
//  - the admin CKEditor 5 config (General HTML Support rules + media providers), so the editor keeps exactly
//    the markup the sanitizer keeps.
// Plain data and pure functions only: no CKEditor or sanitize-html import, safe in every bundle.
import { youtubeIdFromUrl } from "./youtube.ts";

/** Elements kept by the sanitizer. Anything else is removed (its text kept, except script/style/etc.). */
export const OVERVIEW_TAGS: readonly string[] = [
  "h1", "h2", "h3", "h4", "p", "br", "ul", "ol", "li", "blockquote",
  "strong", "em", "b", "i", "sup", "sub", "span", "a",
  "img", "figure", "figcaption", "div", "section",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  // CKEditor Media Embed (`<figure class="media"><oembed url="…">`), YouTube links only.
  "oembed",
];

/** Attributes kept per element (`*` = every element). Link rel/target and img loading are forced by the sanitizer. */
export const OVERVIEW_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "rel", "target"],
  img: ["src", "alt", "loading", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  oembed: ["url"],
  "*": ["class"],
};

/**
 * Garmin overview layout classes (from the garmin.com importer, styled by CmsOverview.module.css).
 * The editor preserves them through General HTML Support.
 */
const BASE_LAYOUT_CLASSES: Readonly<Record<string, readonly string[]>> = {
  div: ["ov-features", "ov-feature", "ov-highlight", "ov-video"],
  section: ["ov-intro"],
  figure: ["ov-lifestyle"],
  p: ["ov-disclaimer"],
};

/**
 * beta5 merge: the garmin.com layout-block classes beta's importer writes (overviewFromGarmin in
 * src/lib/import/garmin-parse.js, OV_CLASSES there) on div/p/figure/section/img/a/span. Listed here too so
 * the admin CKEditor keeps an imported overview's layout when staff edit it.
 */
const GARMIN_LAYOUT_CLASSES: readonly string[] = [
  "ov-features", "ov-feature", "ov-highlight", "ov-video", "ov-intro", "ov-lifestyle", "ov-disclaimer",
  "ov-banner", "ov-banner-text", "ov-desktop", "ov-mobile", "ov-section", "ov-headline", "ov-copy", "ov-cols",
  "ov-card", "ov-card-icon", "ov-highlights", "ov-disclaimers", "ov-play",
  ...["light", "dark", "neutral"].map((t) => `ov-theme-${t}`),
  ...["left", "center", "right"].map((a) => `ov-align-${a}`),
  ...["top", "middle", "bottom"].map((p) => `ov-pos-${p}`),
  ...Array.from({ length: 6 }, (_, i) => `ov-cols-${i + 1}`),
  ...Array.from({ length: 31 }, (_, i) => `ov-ts-${10 + i}`),
];
const GARMIN_LAYOUT_TAGS = ["div", "p", "figure", "section", "img", "a", "span"];

export const OVERVIEW_LAYOUT_CLASSES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [...new Set([...Object.keys(BASE_LAYOUT_CLASSES), ...GARMIN_LAYOUT_TAGS])].map((tag) => [
    tag,
    [...new Set([...(BASE_LAYOUT_CLASSES[tag] ?? []), ...(GARMIN_LAYOUT_TAGS.includes(tag) ? GARMIN_LAYOUT_CLASSES : [])])],
  ]),
);

/** Classes CKEditor's own plugins write (image, table and media blocks). */
const EDITOR_PLUGIN_CLASSES: Readonly<Record<string, readonly string[]>> = {
  figure: ["image", "table", "media"],
};

/** Every class the sanitizer keeps, per element. Classes on any other element are dropped. */
export const OVERVIEW_CLASSES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [...new Set([...Object.keys(OVERVIEW_LAYOUT_CLASSES), ...Object.keys(EDITOR_PLUGIN_CLASSES)])].map((tag) => [
    tag,
    [...(OVERVIEW_LAYOUT_CLASSES[tag] ?? []), ...(EDITOR_PLUGIN_CLASSES[tag] ?? [])],
  ]),
);

/** URL schemes allowed in href/src. Relative links (/p/123) are allowed; protocol-relative (//x) are not. */
export const OVERVIEW_URL_SCHEMES: readonly string[] = ["https"];

/** Overview images: Garmin's image CDN over https, or files uploaded/imported into this site. */
export const OVERVIEW_IMAGE_SOURCES: readonly RegExp[] = [/^https:\/\/res\.garmin\.com\//, /^\/uploads\//];

export function isAllowedOverviewImageSrc(src: unknown): boolean {
  if (typeof src !== "string" || src.length > 2048 || /[\s"'<>\\]/.test(src)) return false;
  if (src.startsWith("/uploads/") && src.split(/[/?#]/).includes("..")) return false;
  return OVERVIEW_IMAGE_SOURCES.some((pattern) => pattern.test(src));
}

/** Embedded media: YouTube only (watch, youtu.be, shorts, embed, youtube-nocookie). */
export const OVERVIEW_MEDIA_PROVIDERS: readonly string[] = ["youtube"];

export function isAllowedOverviewMediaUrl(url: unknown): boolean {
  return youtubeIdFromUrl(url) !== null;
}

/** A General HTML Support rule (structurally compatible with CKEditor's MatcherObjectPattern). */
export interface OverviewHtmlSupportRule {
  name: string;
  classes?: string[];
}

/**
 * CKEditor General HTML Support `allow` rules derived from the allowlist: the Garmin layout containers with
 * their ov-* classes, figcaption inside those figures, and sup/sub. Everything the editor's own plugins
 * handle (headings, lists, links, images, tables, media) is not listed here.
 */
export function overviewHtmlSupportRules(): OverviewHtmlSupportRule[] {
  return [
    ...Object.entries(OVERVIEW_LAYOUT_CLASSES).map(([name, classes]) => ({ name, classes: [...classes] })),
    { name: "figcaption" },
    { name: "sup" },
    { name: "sub" },
  ];
}
