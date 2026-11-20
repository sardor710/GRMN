// garmin.com product page → CMS product draft. Pure (no network); see app/api/admin/import/garmin for I/O.
import sanitizeHtml from 'sanitize-html';
import { parseDocument, DomUtils } from 'htmlparser2';
import { extractBootstrap, extractJsonLdProduct, GarminParseError } from './garmin-bootstrap.js';
import { ensureSingleDefault, syncLegacyFields } from '../cms/product-variants.js';

export { extractBootstrap, GarminParseError };

export const GARMIN_PAGE_HOSTS = ['www.garmin.com', 'buy.garmin.com'];

/** Only https product pages on Garmin's own hosts, default port, no credentials. */
export function validateGarminUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return { ok: false, error: 'Not a valid URL.' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'Use an https:// garmin.com link.' };
  if (url.username || url.password) return { ok: false, error: 'Links with credentials are not allowed.' };
  if (url.port && url.port !== '443') return { ok: false, error: 'Links with a custom port are not allowed.' };
  if (!GARMIN_PAGE_HOSTS.includes(url.hostname)) {
    return { ok: false, error: 'Only www.garmin.com or buy.garmin.com product links can be imported.' };
  }
  if (!/\/p\/\d+/.test(url.pathname)) return { ok: false, error: 'This is not a Garmin product page link (…/p/<id>).' };
  return { ok: true, url };
}

// ---------- HTML helpers ----------

const OVERVIEW_IMG_OK = (src) => /^https:\/\/res\.garmin\.com\//.test(src) || /^\/uploads\//.test(src);

// Layout classes the overview converter may emit (and the sanitizer keeps). Anything else is stripped.
const OV_THEMES = ['light', 'dark', 'neutral'];
const OV_ALIGNS = ['left', 'center', 'right'];
const OV_POSITIONS = ['top', 'middle', 'bottom'];
const OV_TS_MIN = 10;
const OV_TS_MAX = 40;
const OV_CLASSES = [
  // classes from earlier imports stay renderable
  'ov-features', 'ov-feature', 'ov-highlight', 'ov-video', 'ov-intro', 'ov-lifestyle', 'ov-disclaimer',
  'ov-banner', 'ov-banner-text', 'ov-desktop', 'ov-mobile', 'ov-section', 'ov-headline', 'ov-copy', 'ov-cols',
  'ov-card', 'ov-card-icon', 'ov-highlights', 'ov-disclaimers', 'ov-play',
  ...OV_THEMES.map((t) => `ov-theme-${t}`),
  ...OV_ALIGNS.map((a) => `ov-align-${a}`),
  ...OV_POSITIONS.map((p) => `ov-pos-${p}`),
  ...Array.from({ length: 6 }, (_, i) => `ov-cols-${i + 1}`),
  ...Array.from({ length: OV_TS_MAX - OV_TS_MIN + 1 }, (_, i) => `ov-ts-${OV_TS_MIN + i}`),
];

/** Allowlist sanitizer for overview HTML (also used by the products API on save). */
export function sanitizeOverviewHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'sup', 'sub', 'br', 'hr', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'div', 'section', 'span'],
    allowedAttributes: { a: ['href', 'rel', 'target'], img: ['src', 'alt', 'loading'], td: ['colspan'], th: ['colspan'], '*': ['class'] },
    allowedClasses: { div: OV_CLASSES, p: OV_CLASSES, figure: OV_CLASSES, section: OV_CLASSES, img: OV_CLASSES, a: OV_CLASSES, span: OV_CLASSES },
    allowedSchemes: ['https'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === 'img' && !OVERVIEW_IMG_OK(frame.attribs.src || ''),
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer', target: '_blank' } }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
    },
  });
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (html) => sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();

const pickToken = (raw, allowed, fallback) => {
  const t = String(raw || '').trim().toLowerCase().split(/\s+/)[0];
  return allowed.includes(t) ? t : fallback;
};
const themeOf = (a, fallback = 'light') => pickToken(a.theme, OV_THEMES, fallback);
const alignOf = (a, fallback = 'left') => pickToken(a['text-align'], OV_ALIGNS, fallback);
const positionOf = (a) => pickToken(a['text-position'], OV_POSITIONS, 'middle');
/** garmin.com text-size is a multiplier (1.8 … 3) of the base headline size → ov-ts-18 … ov-ts-30. */
const sizeOf = (a, fallback) => {
  const n = Number.parseFloat(a['text-size']);
  const tenths = Number.isFinite(n) ? Math.round(n * 10) : fallback;
  return Math.min(OV_TS_MAX, Math.max(OV_TS_MIN, tenths));
};
const isIcon = (a) => /\.svg(\?|$)/i.test(a.image || '') || Boolean(a['img-width']);

/**
 * Convert Garmin's overview web components (pc-*) into semantic HTML that keeps garmin.com's layout:
 * full-width banners with text over the photo, themed sections, N-column card grids, headlines, dividers
 * and footnotes. Output still goes through sanitizeOverviewHtml.
 */
export function overviewFromGarmin(html) {
  const doc = parseDocument(String(html || ''), { recognizeSelfClosing: true, decodeEntities: true });
  const img = (src, alt, cls) => (src ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(src)}" alt="${esc(plain(alt))}">` : '');
  const tags = (node) => (node.children || []).filter((c) => c.type === 'tag');
  const hasContent = (a) => Boolean(a.title || a.description || a.image);

  const card = (a) => {
    if (!hasContent(a)) return '';
    const cls = isIcon(a) ? 'ov-card ov-card-icon' : 'ov-card';
    return `<div class="${cls}">${img(a.image, a.title || a.description)}${a.title ? `<h3>${a.title}</h3>` : ''}${a.description ? `<p>${a.description}</p>` : ''}</div>`;
  };

  const children = (node) => tags(node).map(visit).join('');

  function visit(node) {
    if (node.type !== 'tag') return '';
    const a = node.attribs || {};
    switch (node.name) {
      case 'pc-life-style': {
        if (!a['bg-image']) return '';
        const cls = `ov-banner ov-theme-${themeOf(a, 'dark')} ov-align-${alignOf(a)} ov-pos-${positionOf(a)} ov-ts-${sizeOf(a, 30)}`;
        const mobile = a['mobile-bg-image'] && a['mobile-bg-image'] !== a['bg-image'];
        const pics = mobile
          ? img(a['bg-image'], a.text, 'ov-desktop') + img(a['mobile-bg-image'], a.text, 'ov-mobile')
          : img(a['bg-image'], a.text);
        const text = a.text || a['button-text']
          ? `<div class="ov-banner-text">${a.text ? `<h2>${a.text}</h2>` : ''}${a['button-text'] ? `<p>${a['button-text']}</p>` : ''}</div>`
          : '';
        return `<div class="${cls}">${pics}${text}</div>`;
      }
      case 'pc-video-banner': {
        if (!a['bg-image']) return '';
        const body = `${img(a['bg-image'], 'Watch the video')}<span class="ov-play"></span>`;
        return `<div class="ov-video">${a['video-link'] ? `<a href="${esc(a['video-link'])}">${body}</a>` : body}</div>`;
      }
      case 'pc-overview-intro': {
        const highlights = tags(node)
          .filter((c) => c.name === 'pc-feature-card')
          .map((c) => {
            const ca = c.attribs || {};
            return ca.description ? `<div class="ov-highlight">${img(ca.image, ca.description)}<p>${ca.description}</p></div>` : '';
          })
          .join('');
        const title = a.title ? `<h2>${a.title}</h2>` : '';
        const description = a.description ? `<p>${a.description}</p>` : '';
        const grid = highlights ? `<div class="ov-cols ov-cols-6 ov-highlights">${highlights}</div>` : '';
        return `<section class="ov-section ov-intro ov-theme-${themeOf(a)}">${title}${description}${grid}</section>`;
      }
      case 'pc-layout-container': {
        const inner = children(node);
        return inner ? `<section class="ov-section ov-theme-${themeOf(a)}">${inner}</section>` : '';
      }
      case 'pc-column-layout': {
        const inner = children(node);
        if (!inner) return '';
        const declared = Number.parseInt(a.columns, 10);
        const count = Number.isFinite(declared) && declared > 0
          ? declared
          : tags(node).filter((c) => hasContent(c.attribs || {})).length;
        // Single-column rows (headlines, copy) need no grid.
        if (count <= 1) return inner;
        return `<div class="ov-cols ov-cols-${Math.min(6, count)}">${inner}</div>`;
      }
      case 'pc-feature-card':
        return card(a);
      case 'pc-headline': {
        const body = `${a['primary-text'] ? `<h2>${a['primary-text']}</h2>` : ''}${a['secondary-text'] ? `<p>${a['secondary-text']}</p>` : ''}`;
        return body ? `<div class="ov-headline ov-theme-${themeOf(a)} ov-align-${alignOf(a, 'center')} ov-ts-${sizeOf(a, 20)}">${body}</div>` : '';
      }
      case 'pc-copy': {
        const h = a['title-heading-size'] === 'h3' ? 'h3' : 'h2';
        const body = `${a.title ? `<${h}>${a.title}</${h}>` : ''}${a.description ? `<p>${a.description}</p>` : ''}`;
        return body ? `<div class="ov-copy">${body}</div>` : '';
      }
      case 'pc-line-divider':
        return '<hr>';
      case 'pc-disclaimer-block': {
        const inner = children(node);
        return inner ? `<div class="ov-disclaimers">${inner}</div>` : '';
      }
      case 'pc-disclaimer-item':
        return a.content ? `<p class="ov-disclaimer"><sup>${esc(a.counter || '')}</sup> ${a.content}</p>` : '';
      case 'pc-social-gallery':
        // Customer photo wall loaded live from a third party on garmin.com; nothing to import.
        return '';
      default:
        // Wrappers (div, overview-container, …) only hold nested components.
        return children(node);
    }
  }
  return doc.children.map(visit).join('\n');
}

const textOf = (node) => DomUtils.textContent(node).replace(/\s+/g, ' ').trim();

/** Garmin specs table → groups (rows with an <h3> start a group; td.yes/no → Yes/No). */
export function parseSpecsTable(html) {
  const doc = parseDocument(String(html || ''), { decodeEntities: true });
  const groups = [];
  for (const tr of DomUtils.getElementsByTagName('tr', doc)) {
    const h3 = DomUtils.getElementsByTagName('h3', tr)[0];
    if (h3) {
      groups.push({ title: textOf(h3), items: [] });
      continue;
    }
    const th = DomUtils.getElementsByTagName('th', tr)[0];
    const td = DomUtils.getElementsByTagName('td', tr)[0];
    if (!th || !td) continue;
    const label = textOf(th);
    if (!label) continue;
    const cls = ` ${td.attribs?.class || ''} `;
    const value = cls.includes(' yes ') ? 'Yes' : cls.includes(' no ') ? 'No' : textOf(td);
    if (!groups.length) groups.push({ title: 'General', items: [] });
    groups[groups.length - 1].items.push({ label, value });
  }
  return groups.filter((g) => g.items.length);
}

export function parseInTheBox(html) {
  const doc = parseDocument(String(html || ''), { decodeEntities: true });
  const items = DomUtils.getElementsByTagName('li', doc).map(textOf).filter(Boolean);
  if (items.length) return items;
  return plain(String(html || '').replace(/<br\s*\/?>/gi, '\n')).split('\n').map((s) => s.trim()).filter(Boolean);
}

// ---------- per-sku tabs (Task 2.5) ----------

const hasTabs = (s) => Boolean(s?.tabs?.specsTab?.content || s?.tabs?.overviewTab?.content || s?.tabs?.inTheBoxTab?.content);

/** Specs, overview (converted + sanitized like every stored overview) and in-the-box of one sku's tabs. */
function tabsOfSku(s) {
  return {
    specGroups: parseSpecsTable(s?.tabs?.specsTab?.content),
    overviewHtml: sanitizeOverviewHtml(overviewFromGarmin(s?.tabs?.overviewTab?.content)),
    inTheBox: parseInTheBox(s?.tabs?.inTheBoxTab?.content),
  };
}

/**
 * Specs, overview and in-the-box of a garmin.com product page: of `sku` when given, else of the page's
 * default sku. garmin.com ignores `?sku=` and keeps its own default, so a variant's page must be read by sku.
 * @returns {{ specGroups: object[], overviewHtml: string, inTheBox: string[] } | null} null when the page
 *   doesn't carry that sku's tabs.
 */
export function parseGarminTabs(html, { sku } = {}) {
  const boot = extractBootstrap(html);
  const skus = Object.values(boot.skus || {});
  const s = sku
    ? boot.skus?.[sku] || skus.find((x) => x?.partNumber === sku)
    : boot.skus?.[boot.sku] || skus[0];
  return s && hasTabs(s) ? tabsOfSku(s) : null;
}

// Whitespace between tags is layout only: `</p>\n<p>` equals `</p><p>`.
const norm = (s) => String(s ?? '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
const groupsKey = (groups) => JSON.stringify((groups || []).map((g) => [norm(g.title), (g.items || []).map((i) => [norm(i.label), norm(i.value)])]));
const listKey = (list) => JSON.stringify((list || []).map(norm));

/**
 * The blocks of a variant's tabs that differ from the product-level ones (whitespace-normalized, same order).
 * A block the variant's page leaves empty is inherited, never stored as an own empty block.
 * @returns {object | undefined} a VariantContent with only the differing blocks, or undefined when none differ.
 */
export function variantContentOverrides(base, own) {
  const out = {};
  if (own.specGroups?.length && groupsKey(own.specGroups) !== groupsKey(base.specGroups)) {
    out.specGroups = own.specGroups;
    // Flat-spec readers get the variant's values too (the product mirrors specs from specGroups the same way).
    out.specs = own.specGroups.flatMap((g) => g.items.map((i) => ({ label: i.label, value: i.value })));
  }
  if (norm(own.overviewHtml) && norm(own.overviewHtml) !== norm(base.overviewHtml)) out.overviewHtml = own.overviewHtml;
  if (own.inTheBox?.length && listKey(own.inTheBox) !== listKey(base.inTheBox)) out.inTheBox = own.inTheBox;
  return Object.keys(out).length ? out : undefined;
}

/** "fēnix® 9 Pro – 51 mm" → "fēnix 9" */
export function familyFromName(name) {
  let s = String(name || '').replace(/[®™℠]/g, '').split(/\s+[–-]\s+/)[0].trim();
  const editions = /\s+(Pro|Plus|Solar|AMOLED|Sapphire|Edition|Bundle|Pro Solar)$/i;
  while (editions.test(s)) s = s.replace(editions, '').trim();
  return s.replace(/\s+/g, ' ');
}

// ---------- options / variants ----------

const slugify = (s) =>
  String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';

const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

const humanizeKey = (key) =>
  titleCase(
    String(key)
      .replace(/^pvems|^ems/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .toLowerCase(),
  ) || 'Option';

const COLOR_HEX = {
  black: '#000000', white: '#ffffff', gray: '#8a8d8f', grey: '#8a8d8f', 'dark gray': '#4a4d50', silver: '#c0c0c0',
  cream: '#efe6d2', brown: '#6b4a2b', orange: '#e8742a', 'autumn orange': '#c8662f', blue: '#2b5fab', green: '#3d7a4a',
  red: '#c0392b', pink: '#e8a0b4', gold: '#c9a64b', purple: '#7d5ba6', yellow: '#f2c230', beige: '#d8c3a5',
  bone: '#e6dfcc', 'light gray': '#c9cbcd', 'shell pink': '#efc8c1', ivory: '#f3eedf', navy: '#22314f', teal: '#2f7f7a',
  graphite: '#3b3d40', slate: '#5b6168', sand: '#d9c7a3', mint: '#a8d8c0', lilac: '#c8b6e2',
};

/** Exact color name, else its last word ("Shell Pink" → pink). */
const colorHex = (label) => {
  const l = label.toLowerCase();
  return COLOR_HEX[l] || COLOR_HEX[l.split(/\s+/).pop()];
};

/** "gray_dark_global" → "Dark Gray"; "orange_autumn_fenix_9_series" → "Autumn Orange" */
function humanizeColorSlug(slug, familyWords) {
  const drop = new Set(['global', 'master', 'series', ...familyWords]);
  const tokens = String(slug).toLowerCase().split('_').filter((t) => t && !drop.has(t) && !/^\d+$/.test(t));
  return titleCase(tokens.reverse().join(' ')) || slug;
}

function stableId(prefix, s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

/**
 * Parse a garmin.com product page.
 * Non-default variants get `content` with only the tab blocks that differ from the product-level ones.
 * @returns {{ product: object, remoteImages: {id:string,url:string,alt:string}[], warnings: string[],
 *   variantSkusWithoutTabs: string[] }} the last lists skus whose tabs the page doesn't embed.
 */
export function parseGarminProduct(html, { sourceUrl, rateKztPerUsd, now = new Date().toISOString() }) {
  const rate = Number(rateKztPerUsd);
  if (!(rate > 0)) throw new GarminParseError('A positive KZT per USD rate is required.');
  const boot = extractBootstrap(html);
  const ld = extractJsonLdProduct(html);
  const warnings = [];
  const skus = Object.values(boot.skus || {});
  if (!skus.length) throw new GarminParseError('The page lists no product variants.');
  const def = boot.skus[boot.sku] || skus[0];

  const name = def.simpleDisplayName || String(def.productName || ld?.name || 'Garmin product').split(/\s+[–-]\s+/)[0];
  const family = familyFromName(name);
  const familyWords = slugify(family).split('-');

  // Option axes: Garmin's declared axes first, then any selection key it didn't declare (e.g. Edge "version").
  const declared = Array.isArray(boot.productEmsList) ? boot.productEmsList : [];
  const selectionKeys = [];
  for (const s of skus) for (const k of Object.keys(s.options?.selected || {})) if (!selectionKeys.includes(k)) selectionKeys.push(k);
  const axisIds = [...declared.map((a) => a.id).filter(Boolean), ...selectionKeys].filter((k, i, arr) => arr.indexOf(k) === i);
  const firstSelected = (s, axisId) => (s.options?.selected?.[axisId] || [])[0];
  const skuByPart = new Map(skus.map((s) => [s.partNumber, s]));

  const options = [];
  for (const axisId of axisIds) {
    const used = new Set(skus.map((s) => firstSelected(s, axisId)).filter((v) => v !== undefined && v !== null && v !== ''));
    if (!used.size) continue;
    const axis = declared.find((a) => a.id === axisId);
    const optionName = axis?.title || humanizeKey(axisId);
    const isColor = /colou?r/i.test(optionName);
    const optionId = `opt-${slugify(axisId)}`;
    const declaredValues = [...(axis?.options || [])].sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    const keys = [...declaredValues.map((o) => o.id), ...used].filter((k, i, arr) => used.has(k) && arr.indexOf(k) === i);
    const seenIds = new Set();
    const values = keys.map((key) => {
      const d = declaredValues.find((o) => o.id === key);
      const owner = skus.find((s) => firstSelected(s, axisId) === key) || skuByPart.get(d?.sku);
      let label = d?.text || '';
      if (!label || axis?.type === 'image') label = owner?.productVariation || d?.altText || String(key);
      else if (isColor && /^[a-z0-9_]+$/.test(label) && label.includes('_')) label = humanizeColorSlug(label, familyWords);
      else if (isColor && /^[a-z]+$/.test(label)) label = titleCase(label);
      label = String(label).replace(/\s+/g, ' ').trim();
      let id = `${optionId}-${slugify(key)}`.slice(0, 80);
      while (seenIds.has(id)) id += '-x';
      seenIds.add(id);
      const value = { id, key: String(key), label };
      if (d?.image) value.swatchImage = d.image;
      const hex = isColor ? colorHex(label) : undefined;
      if (hex) value.swatchColor = hex;
      return value;
    });
    const allSwatched = values.every((v) => v.swatchImage || v.swatchColor);
    options.push({ id: optionId, key: slugify(optionName), name: optionName, display: allSwatched ? 'swatch' : 'buttons', values });
  }

  // Images: every variant gallery, de-duplicated by URL.
  const remote = new Map();
  const imageId = (url, alt) => {
    if (!remote.has(url)) remote.set(url, { id: stableId('img', url), url, alt: alt || name });
    return remote.get(url).id;
  };

  const variants = skus.map((s) => {
    const list = Number(s.price?.listPrice?.price ?? (s === def ? ld?.offers?.price : undefined));
    const saleRaw = s.price?.salePrice?.price;
    const sale = saleRaw !== undefined && saleRaw !== null && Number(saleRaw) < list ? Number(saleRaw) : undefined;
    if (!(list > 0)) warnings.push(`${s.partNumber}: no price on the page — set it manually.`);
    const urls = [s.images?.defaultImage?.image, ...(s.images?.gallery || []).map((g) => g.image)].filter(Boolean);
    const imageIds = [...new Set(urls.map((u) => imageId(u, s.pvName || s.productName)))];
    const selections = {};
    for (const o of options) {
      const key = firstSelected(s, axisIds.find((a) => `opt-${slugify(a)}` === o.id));
      const val = o.values.find((v) => v.key === String(key));
      if (val) selections[o.id] = val.id;
    }
    const sourcePrice = { currency: 'USD', list: list > 0 ? list : 0, rateKztPerUsd: rate };
    if (sale !== undefined) sourcePrice.sale = sale;
    return {
      id: `var-${s.partNumber}`,
      sku: s.partNumber,
      title: s.productVariation || s.pvName || s.productName || s.partNumber,
      selections,
      price: Math.round((sale ?? (list > 0 ? list : 0)) * rate),
      ...(sale !== undefined ? { originalPrice: Math.round(list * rate) } : {}),
      stock: 0,
      status: (s.isSellable ?? s.sellable) !== false && s.displayable !== false ? 'active' : 'draft',
      isDefault: s.partNumber === def.partNumber,
      imageIds,
      sourcePartNumber: s.partNumber,
      sourcePrice,
    };
  });

  const remoteImages = [...remote.values()];
  const defVariant = variants.find((v) => v.isDefault) || variants[0];
  const base = tabsOfSku(def);
  const { specGroups } = base;

  // Task 2.5: each variant's own tabs. garmin.com embeds every sku's tabs in the page (the same data its
  // ?sku= page serves, checked 2026-11-20); skus without them are read from their page by the import route.
  const variantSkusWithoutTabs = [];
  skus.forEach((s, i) => {
    if (s === def) return;
    if (!hasTabs(s)) {
      variantSkusWithoutTabs.push(s.partNumber);
      return;
    }
    const content = variantContentOverrides(base, tabsOfSku(s));
    if (content) variants[i].content = content;
  });
  const crumbs = Array.isArray(boot.breadCrumbs) ? boot.breadCrumbs : [];

  const product = syncLegacyFields({
    name,
    // GARMIN- prefix: legacy CMS products already use GRM-<id>, so imports never collide with them.
    sku: `GARMIN-${boot.productId || def.productId}`,
    family,
    description: def.seo?.ogDescription || ld?.description || '',
    category: crumbs[0]?.categoryName || boot.marketCategory || 'Imported',
    subCategory: boot.productCategory || crumbs[crumbs.length - 1]?.categoryName || '',
    activities: [],
    status: 'draft',
    price: defVariant.price,
    stock: 0,
    badge: 'NONE',
    options,
    variants: ensureSingleDefault(variants),
    images: remoteImages.map((r) => ({ id: r.id, src: r.url, alt: r.alt, source: 'import' })),
    defaultImageId: defVariant.imageIds[0],
    overviewHtml: base.overviewHtml,
    specGroups,
    inTheBox: base.inTheBox,
    compatibleAccessories: [],
    seoTitle: def.seo?.title,
    seoDescription: def.seo?.ogDescription,
    source: { provider: 'garmin', url: String(sourceUrl), productId: String(boot.productId || ''), partNumber: def.partNumber, importedAt: now },
  });
  if (!specGroups.length) warnings.push('No specs table found on the page.');
  return { product, remoteImages, warnings, variantSkusWithoutTabs };
}
