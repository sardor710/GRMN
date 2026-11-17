// Pure product option/variant logic. Plain JS so `node --test` can run it; typed wrapper in product-variants.ts.

export const MAX_VARIANTS = 500;
export const WARN_VARIANTS = 100;

const newId = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

const skuPart = (value) =>
  String(value.key || value.label || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();

/** Stable key for a selection set, independent of property order. */
export function selectionSignature(selections, options) {
  return options.map((o) => `${o.id}=${selections?.[o.id] ?? ''}`).join('|');
}

function cartesian(options) {
  return options.reduce(
    (acc, option) => acc.flatMap((combo) => option.values.map((value) => [...combo, [option, value]])),
    [[]],
  );
}

/** Keep exactly one default (first existing default, else first non-archived, else first). */
export function ensureSingleDefault(variants) {
  if (!variants.length) return variants;
  let idx = variants.findIndex((v) => v.isDefault && v.status !== 'archived');
  if (idx < 0) idx = variants.findIndex((v) => v.status !== 'archived');
  if (idx < 0) idx = 0;
  return variants.map((v, i) => ({ ...v, isDefault: i === idx }));
}

/** Survivor order when several existing variants collapse onto one combination: default, active, most stock. */
const survivorRank = (v) => (v.isDefault ? 4 : 0) + (v.status === 'active' ? 2 : 0) + Math.min(1, Math.max(0, Number(v.stock) || 0));

/**
 * Build every option combination, keeping existing variants (SKU, price, stock, images…):
 * - an option the variant has no selection for (newly added) matches that option's FIRST value;
 * - selections for options that no longer exist are ignored (several variants may collapse; the best survives);
 * - a selected value that was deleted means the variant no longer fits and is removed.
 * New combinations are `active` for a fresh product, but `draft` when existing variants cover only part of
 * the matrix (e.g. an import of what the brand really sells), so Generate never puts unsold combos on sale.
 * @returns {{variants, removed, merged, added, warning?}}
 */
export function generateVariants(options, existing, base) {
  const prior = existing || [];
  const usable = (options || []).filter((o) => o.values && o.values.length);
  if (!usable.length) return { variants: [], removed: prior.length, merged: 0, added: 0 };
  const total = usable.reduce((n, o) => n * o.values.length, 1);
  if (total > MAX_VARIANTS) {
    throw new RangeError(`${total} combinations exceed the limit of ${MAX_VARIANTS} variants`);
  }
  const fits = (v, selections) =>
    usable.every((o) => {
      const chosen = v.selections?.[o.id];
      return chosen === undefined ? selections[o.id] === o.values[0].id : chosen === selections[o.id];
    });
  const used = new Set();
  let merged = 0;
  let added = 0;
  const variants = cartesian(usable).map((combo) => {
    const selections = Object.fromEntries(combo.map(([o, v]) => [o.id, v.id]));
    const title = combo.map(([, v]) => v.label).join(' / ');
    const matches = prior.filter((v) => !used.has(v.id) && fits(v, selections));
    if (matches.length) {
      const best = matches.reduce((a, b) => (survivorRank(b) > survivorRank(a) ? b : a));
      for (const m of matches) used.add(m.id);
      merged += matches.length - 1;
      return { ...best, selections, title: best.title || title };
    }
    added++;
    return {
      id: newId('var'),
      sku: [skuPart({ key: base.sku }), ...combo.map(([, v]) => skuPart(v))].filter(Boolean).join('-'),
      title,
      selections,
      price: base.price,
      stock: base.stock,
      status: prior.length ? 'draft' : 'active',
      isDefault: false,
      imageIds: [],
    };
  });
  const kept = new Set(variants.map((v) => v.id));
  const removed = prior.filter((v) => !kept.has(v.id)).length;
  const warning = total > WARN_VARIANTS ? `${total} combinations will be created — consider fewer option values.` : undefined;
  return { variants: ensureSingleDefault(variants), removed, merged, added, ...(warning ? { warning } : {}) };
}

/** Can a shopper buy this variant? Simple products (no variant) are unaffected. */
export function isPurchasable(variant) {
  if (!variant) return true;
  return variant.status === 'active' && Number(variant.stock) > 0;
}

/** Products whose storefront page is built from CMS data (variants or an overview); others keep their legacy page. */
export function usesCmsDetail(product) {
  return Boolean(product && ((product.variants && product.variants.length) || (typeof product.overviewHtml === 'string' && product.overviewHtml.trim())));
}

/** The non-archived variant matching all given selections. */
export function resolveVariant(variants, selections) {
  return (variants || []).find(
    (v) => v.status !== 'archived' && Object.entries(v.selections).every(([o, val]) => selections[o] === val),
  );
}

/** Values of `optionId` that still lead to an active variant, given the other current selections. */
export function availableValueIds(variants, selections, optionId) {
  const out = new Set();
  for (const v of variants || []) {
    if (v.status !== 'active') continue;
    const fits = Object.entries(v.selections).every(([o, val]) => o === optionId || !selections[o] || selections[o] === val);
    if (fits && v.selections[optionId]) out.add(v.selections[optionId]);
  }
  return out;
}

/** ≤42 mm → Small, 43–46 mm → Medium, ≥47 mm → Large; anything that is not a mm size → undefined. */
export function sizeBucketFromLabel(label) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*mm\b/i.exec(String(label || ''));
  if (!m) return undefined;
  const mm = Number(m[1]);
  if (mm <= 42) return 'Small';
  if (mm < 47) return 'Medium';
  return 'Large';
}

/** Mirror the default variant / default image / grouped specs into the legacy single-SKU fields. */
export function syncLegacyFields(product) {
  const next = { ...product };
  const variants = product.variants || [];
  if (variants.length) {
    const def = variants.find((v) => v.isDefault) || variants[0];
    next.price = def.price;
    if (def.originalPrice !== undefined) next.originalPrice = def.originalPrice;
    else delete next.originalPrice;
    next.stock = def.stock;
    const sizeOption = (product.options || []).find((o) => /size/i.test(o.key) || /size/i.test(o.name));
    if (sizeOption) {
      const value = sizeOption.values.find((val) => val.id === def.selections[sizeOption.id]);
      const bucket = value && sizeBucketFromLabel(value.label);
      if (bucket) next.caseSize = bucket;
    }
  }
  const images = product.images || [];
  if (images.length) {
    const img = images.find((i) => i.id === product.defaultImageId) || images[0];
    next.image = img.src;
    if (!product.defaultImageId) next.defaultImageId = img.id;
  }
  if (product.specGroups && product.specGroups.length) {
    next.specs = product.specGroups.flatMap((g) => g.items);
  }
  return next;
}

/** SKUs of `product` (base + variants) that clash with each other or with any other product, upper-cased. */
export function findSkuConflicts(product, allProducts) {
  const own = [product.sku, ...(product.variants || []).map((v) => v.sku)].filter(Boolean).map((s) => String(s).toUpperCase());
  const conflicts = new Set();
  const seen = new Set();
  for (const s of own) {
    if (seen.has(s)) conflicts.add(s);
    seen.add(s);
  }
  for (const other of allProducts || []) {
    if (other.id === product.id) continue;
    const theirs = [other.sku, ...(other.variants || []).map((v) => v.sku)].filter(Boolean).map((s) => String(s).toUpperCase());
    for (const s of theirs) if (seen.has(s)) conflicts.add(s);
  }
  return [...conflicts];
}

/**
 * Shopper picked `valueId` for `optionId`: return the active (else draft) variant with that value that keeps the
 * most of the other current selections — like garmin.com, switching size keeps your color when it exists.
 */
export function selectValue(variants, selections, optionId, valueId) {
  let best;
  let bestScore = -1;
  for (const v of variants || []) {
    // Shoppers only ever land on active variants (drafts/archived are not for sale).
    if (v.status !== 'active' || v.selections[optionId] !== valueId) continue;
    const matches = Object.entries(v.selections).filter(([o, val]) => o !== optionId && selections[o] === val).length;
    const score = matches;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}
