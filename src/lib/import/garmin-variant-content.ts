// Task 2.5: a variant whose tabs the product page doesn't embed is read from its own garmin.com page
// (`<productUrl>?sku=<sku>`). Only the blocks that differ from the product-level content are stored as the
// variant's override; a page that can't be read adds a warning and stores nothing (the variant inherits).
// No network here: the import route injects its host-checked fetcher.
import { parseGarminTabs, validateGarminUrl, variantContentOverrides, type GarminDraft, type GarminTabs } from "./garmin-parse.ts";

export const VARIANT_PAGE_CONCURRENCY = 3;
export const VARIANT_PAGE_TIMEOUT_MS = 20_000;
/** Total time for all variant pages, so the import stays inside the route's maxDuration. */
export const VARIANT_PAGES_BUDGET_MS = 45_000;

/**
 * Returns the HTML of a garmin.com page (the route's fetcher re-validates every redirect hop). `signal`
 * aborts on the page's own timeout or when the whole budget runs out, whichever comes first.
 */
export type FetchGarminHtml = (url: URL, signal: AbortSignal) => Promise<string>;

/** Imported drafts are saved through cms.save, whose product body limit is 4 MiB; leave room for the editor. */
export const DRAFT_SAVE_BUDGET_BYTES = Math.floor(3.5 * 1024 * 1024);

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

/**
 * Keep an imported draft under the save limit: drop variants' own overviews, largest first, until the
 * serialized draft fits. Those variants inherit the product overview; their own specs and in-the-box stay.
 * Returns one warning per dropped overview.
 */
export function fitDraftToSaveLimit(draft: GarminDraft, maxBytes = DRAFT_SAVE_BUDGET_BYTES): string[] {
  const warnings: string[] = [];
  let size = jsonBytes(draft);
  if (size <= maxBytes) return warnings;
  const owners = (draft.variants ?? [])
    .filter((v) => v.content?.overviewHtml !== undefined)
    .sort((a, b) => jsonBytes(b.content?.overviewHtml) - jsonBytes(a.content?.overviewHtml));
  for (const v of owners) {
    if (size <= maxBytes) break;
    const rest = { ...v.content };
    delete rest.overviewHtml;
    if (Object.keys(rest).length) v.content = rest;
    else delete v.content;
    size = jsonBytes(draft);
    warnings.push(`Overview for ${v.title || v.sku} kept the product overview to fit the save limit.`);
  }
  return warnings;
}

/** `<productUrl>?sku=<sku>`, or null when the result isn't an importable garmin.com product link. */
export function variantPageUrl(productUrl: URL, sku: string): URL | null {
  const url = new URL(productUrl.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("sku", sku);
  const checked = validateGarminUrl(url.href);
  return checked.ok ? checked.url : null;
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

/**
 * Fetch each sku's page (3 at a time) and set `variants[i].content` to the blocks that differ from the
 * draft's product-level Specs/Overview/In the box. Call before the draft's images are localized, so both
 * sides are compared with garmin.com's own image links. Returns warnings.
 */
export async function fillVariantContentFromPages(
  draft: GarminDraft,
  skus: readonly string[],
  productUrl: URL,
  fetchHtml: FetchGarminHtml,
  {
    concurrency = VARIANT_PAGE_CONCURRENCY,
    budgetMs = VARIANT_PAGES_BUDGET_MS,
    pageTimeoutMs = VARIANT_PAGE_TIMEOUT_MS,
  }: { concurrency?: number; budgetMs?: number; pageTimeoutMs?: number } = {},
): Promise<string[]> {
  const warnings: string[] = [];
  const variants = draft.variants ?? [];
  const base: GarminTabs = { specGroups: draft.specGroups ?? [], overviewHtml: draft.overviewHtml ?? "", inTheBox: draft.inTheBox ?? [] };
  // The budget also aborts fetches already in flight, so none overruns it.
  const budget = AbortSignal.timeout(budgetMs);
  const skipped: string[] = [];

  const readOne = async (sku: string) => {
    const target = variants.find((v) => v.sku === sku && !v.isDefault);
    if (!target) return;
    if (budget.aborted) {
      skipped.push(sku);
      return;
    }
    const url = variantPageUrl(productUrl, sku);
    if (!url) {
      warnings.push(`${sku}: its garmin.com page link is not importable; it uses the product's specs, overview and in-the-box.`);
      return;
    }
    let tabs: GarminTabs | null;
    try {
      tabs = parseGarminTabs(await fetchHtml(url, AbortSignal.any([AbortSignal.timeout(pageTimeoutMs), budget])), { sku });
    } catch (err) {
      warnings.push(`${sku}: couldn't read its garmin.com page (${reason(err)}); it uses the product's specs, overview and in-the-box.`);
      return;
    }
    if (!tabs) {
      warnings.push(`${sku}: its garmin.com page has no specs, overview or in-the-box for this variant; it uses the product's.`);
      return;
    }
    const content = variantContentOverrides(base, tabs);
    if (content) target.content = content;
  };

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), skus.length) }, async () => {
      while (next < skus.length) await readOne(skus[next++]);
    }),
  );
  if (skipped.length) {
    warnings.push(`Stopped reading variant pages early (time limit); ${skipped.length} variants use the product's specs, overview and in-the-box: ${skipped.join(", ")}.`);
  }
  return warnings;
}
