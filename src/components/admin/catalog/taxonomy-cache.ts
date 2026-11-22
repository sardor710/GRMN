import type { TaxonomyNode } from "../../../contracts/admin-catalog.ts";

// The category tree changes rarely: one request per page load is shared by the list filter, the editor
// and the quick-edit drawer. Admin ▸ Categories calls invalidateTaxonomy() after every write, and the request
// revalidates with the server (ETag → cheap 304), so new series and accessory types show at once (2026-11-22).
let cached: TaxonomyNode[] | null = null;
let inflight: Promise<TaxonomyNode[]> | null = null;

export function loadTaxonomy(force = false): Promise<TaxonomyNode[]> {
  if (cached && !force) return Promise.resolve(cached);
  if (inflight && !force) return inflight;
  inflight = fetch("/api/admin/catalog/taxonomy", { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(response.status === 501 ? "Categories need the PostgreSQL catalog." : `Categories could not be loaded (HTTP ${response.status}).`);
      const body = (await response.json()) as { categories?: TaxonomyNode[] };
      if (!Array.isArray(body.categories)) throw new Error("Invalid category response");
      cached = body.categories;
      return cached;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Drops the shared tree so the next read fetches it again (called after Admin ▸ Categories writes). */
export function invalidateTaxonomy(): void { cached = null; }

/** The tree already in memory, if any. */
export const cachedTaxonomy = (): TaxonomyNode[] | null => cached;
