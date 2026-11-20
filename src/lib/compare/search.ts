// Tasks C-b/C-c: the bounded product search behind the compare page's "+" tile and the catalogue compare bar.
// It reads one catalogue page for the text and keeps at most eight hits; it never loads the whole catalogue.
import "server-only";
import { catalogueProducts, catalogues } from "@/lib/products";
import { readOr } from "@/server/public-input";
import type { Locale } from "@/i18n/config";

/** At most this many hits are shown. */
export const COMPARE_SEARCH_RESULTS = 8;

export interface CompareSearchHit { id: string; name: string; image: string }
export interface CompareSearchHits { query: string; results: CompareSearchHit[] }

/** Hits for `query` from the first catalogue page. A failing search shows no hits, never an error page. */
export async function searchCompareProducts(query: string, locale: Locale): Promise<CompareSearchHits> {
  try {
    // Malformed input (readOr) shows no hits; any other failure is logged and also shows no hits.
    const page = await readOr(catalogueProducts(catalogues[0], { search: query }, locale), () => ({ items: [] }));
    return { query, results: page.items.slice(0, COMPARE_SEARCH_RESULTS).map((p) => ({ id: p.id, name: p.name, image: p.image })) };
  } catch (error) {
    console.error("[compare] product search failed", { error: error instanceof Error ? error.message : String(error) });
    return { query, results: [] };
  }
}
