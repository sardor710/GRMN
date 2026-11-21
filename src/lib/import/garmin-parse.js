// garmin.com product page → CMS product draft. Pure (no network); see app/api/admin/import/garmin for I/O.
import sanitizeHtml from 'sanitize-html';
import { parseDocument, DomUtils } from 'htmlparser2';
import { extractBootstrap, extractJsonLdProduct, GarminParseError } from './garmin-bootstrap.js';
import { ensureSingleDefault, syncLegacyFields } from '../cms/product-variants.js';
import { OVERVIEW_ATTRIBUTES, OVERVIEW_CLASSES, OVERVIEW_TAGS, OVERVIEW_URL_SCHEMES, isAllowedOverviewImageSrc } from '../overview/allowlist.ts';
import { mediaBlock } from '../overview/video.ts';
import { watchUrl, youtubeIdFromUrl } from '../overview/youtube.ts';

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

const integerAttr = (value) => (/^\d{1,5}$/.test(String(value ?? '')) ? String(value) : undefined);
const definedOnly = (attribs) => Object.fromEntries(Object.entries(attribs).filter(([, v]) => v !== undefined));

/**
 * Allowlist sanitizer for overview HTML (import, every admin save, storefront read). Tags, attributes, classes,
 * image hosts and media providers come from the shared allowlist (src/lib/overview/allowlist.ts) that also
 * configures the admin CKEditor. Scripts, styles, iframes, event handlers, javascript: URLs, foreign images
 * and non-YouTube embeds never survive; classes are kept only where the allowlist lists them.
 */
export function sanitizeOverviewHtml(html) {
  const out = sanitizeHtml(String(html || ''), {
    allowedTags: [...OVERVIEW_TAGS],
    allowedAttributes: Object.fromEntries(Object.entries(OVERVIEW_ATTRIBUTES).map(([tag, attrs]) => [tag, [...attrs]])),
    allowedClasses: { ...Object.fromEntries(Object.entries(OVERVIEW_CLASSES).map(([tag, list]) => [tag, [...list]])), '*': [] },
    allowedSchemes: [...OVERVIEW_URL_SCHEMES],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      (frame.tag === 'img' && !isAllowedOverviewImageSrc(frame.attribs.src || '')) ||
      (frame.tag === 'oembed' && !youtubeIdFromUrl(frame.attribs.url)),
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer', target: '_blank' } }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: definedOnly({ ...attribs, width: integerAttr(attribs.width), height: integerAttr(attribs.height), loading: 'lazy' }),
      }),
      // One canonical stored form for every YouTube link the owner pasted (watch, youtu.be, shorts, embed).
      oembed: (tagName, attribs) => {
        const id = youtubeIdFromUrl(attribs.url);
        return { tagName, attribs: id ? { url: watchUrl(id) } : {} };
      },
    },
  });
  // A media figure whose embed was removed (foreign provider) would render as an empty box.
  return out.replace(/<figure class="media">\s*<\/figure>/g, '');
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (html) => sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();

/** Convert Garmin's overview web components (pc-*) into semantic HTML; output still goes through sanitizeOverviewHtml. */
export function overviewFromGarmin(html) {
  const doc = parseDocument(String(html || ''), { recognizeSelfClosing: true, decodeEntities: true });
  const out = [];
  let inGroup = false;
  const closeGroup = () => {
    if (inGroup) out.push('</div>');
    inGroup = false;
  };
  const img = (src, alt) => (src ? `<img src="${esc(src)}" alt="${esc(plain(alt))}">` : '');

  const visit = (node) => {
    if (node.type !== 'tag') return;
    const a = node.attribs || {};
    switch (node.name) {
      case 'pc-overview-intro':
        closeGroup();
        out.push(`<section class="ov-intro"><h2>${a.title || ''}</h2>${a.description ? `<p>${a.description}</p>` : ''}</section>`);
        break;
      case 'pc-headline':
        closeGroup();
        if (a['primary-text']) out.push(`<h2>${a['primary-text']}</h2>`);
        if (a['secondary-text']) out.push(`<p>${a['secondary-text']}</p>`);
        break;
      case 'pc-copy': {
        closeGroup();
        const h = a['title-heading-size'] === 'h2' ? 'h2' : 'h3';
        if (a.title) out.push(`<${h}>${a.title}</${h}>`);
        if (a.description) out.push(`<p>${a.description}</p>`);
        break;
      }
      case 'pc-life-style':
        closeGroup();
        if (a['bg-image']) {
          const caption = [a.text, a['button-text']].filter(Boolean).join('<br>');
          out.push(`<figure class="ov-lifestyle">${img(a['bg-image'], a.text)}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`);
        }
        break;
      case 'pc-video-banner': {
        closeGroup();
        // YouTube banners become CKEditor media blocks (swappable in the editor, click-to-play on the
        // storefront). Other videos keep their poster as a plain image block.
        const id = a['not-youtube'] === 'true' ? null : youtubeIdFromUrl(a['video-link']);
        if (id) out.push(mediaBlock(id));
        else if (a['bg-image']) out.push(`<figure class="ov-lifestyle">${img(a['bg-image'], a['video-title'] || a['img-alt'] || '')}</figure>`);
        break;
      }
      case 'pc-feature-card': {
        if (!inGroup) out.push('<div class="ov-features">');
        inGroup = true;
        if (a.title) {
          out.push(`<div class="ov-feature">${img(a.image, a.title)}<h3>${a.title}</h3>${a.description ? `<p>${a.description}</p>` : ''}</div>`);
        } else if (a.description) {
          out.push(`<div class="ov-highlight">${img(a.image, a.description)}<p>${a.description}</p></div>`);
        }
        break;
      }
      case 'pc-disclaimer-item':
        closeGroup();
        if (a.content) out.push(`<p class="ov-disclaimer"><sup>${esc(a.counter || '')}</sup> ${a.content}</p>`);
        break;
      default:
        break;
    }
    // Intro cards and layout containers hold nested components.
    for (const child of node.children || []) visit(child);
  };
  for (const node of doc.children) visit(node);
  closeGroup();
  return out.join('\n');
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

const firstImg = (node) => (node.name === 'img' ? node : DomUtils.findOne((n) => n.name === 'img', node.children || [], true));

/** First Garmin-CDN image inside a node (img src or lazy data-src), as an https URL. */
function boxImage(node) {
  const img = firstImg(node);
  const raw = String(img?.attribs?.src || img?.attribs?.['data-src'] || '').trim();
  const src = raw.startsWith('//') ? `https:${raw}` : raw;
  return /^https:\/\/res\.garmin\.com\/[^\s"'<>\\]+$/.test(src) ? src : undefined;
}

/**
 * garmin.com "In the Box" → items: a plain label (string) per entry, or `{ label, image }` when the entry has a
 * photo on res.garmin.com (the import route downloads it to /uploads). Lists (`<li>`) first, then image tiles
 * (`<figure>`/`<div>` with an image and a caption), then text lines. Never invents items.
 */
export function parseInTheBox(html) {
  const doc = parseDocument(String(html || ''), { decodeEntities: true });
  const item = (label, image) => (image ? { label, image } : label);
  const lis = DomUtils.getElementsByTagName('li', doc);
  if (lis.length) {
    return lis
      .map((li) => {
        const image = boxImage(li);
        const label = textOf(li) || (image ? plain(firstImg(li)?.attribs?.alt) : '');
        return label ? item(label, image) : null;
      })
      .filter(Boolean);
  }
  const images = DomUtils.getElementsByTagName('img', doc);
  if (images.length) {
    return images
      .map((imgNode) => {
        let tile = imgNode.parent;
        if (tile && !textOf(tile) && tile.parent && tile.parent.type === 'tag') tile = tile.parent;
        const label = (tile && tile.type === 'tag' ? textOf(tile) : '') || plain(imgNode.attribs?.alt);
        return label ? item(label, boxImage(imgNode)) : null;
      })
      .filter(Boolean);
  }
  return plain(String(html || '').replace(/<br\s*\/?>/gi, '\n')).split('\n').map((s) => s.trim()).filter(Boolean);
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
 * @returns {{ product: object, remoteImages: {id:string,url:string,alt:string}[], warnings: string[] }}
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
  const specGroups = parseSpecsTable(def.tabs?.specsTab?.content);
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
    overviewHtml: sanitizeOverviewHtml(overviewFromGarmin(def.tabs?.overviewTab?.content)),
    specGroups,
    inTheBox: parseInTheBox(def.tabs?.inTheBoxTab?.content),
    compatibleAccessories: [],
    seoTitle: def.seo?.title,
    seoDescription: def.seo?.ogDescription,
    source: { provider: 'garmin', url: String(sourceUrl), productId: String(boot.productId || ''), partNumber: def.partNumber, importedAt: now },
  });
  if (!specGroups.length) warnings.push('No specs table found on the page.');
  return { product, remoteImages, warnings };
}
