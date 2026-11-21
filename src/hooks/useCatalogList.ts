"use client";
import { useCallback, useEffect, useState } from "react";
import type { CatalogListQuery, ListPage, ProductListRow, SkuRow } from "@/contracts/admin-catalog";

// Paged admin catalog lists (M2 API, PostgreSQL only): "products" = grouped view, "skus" = one row per
// variant. Keyset cursors from the server; previous pages are remembered client-side. The list UI is M3.
export type CatalogView = "products" | "skus";
type Row<V extends CatalogView> = V extends "products" ? ProductListRow : SkuRow;

export async function fetchCatalogPage<V extends CatalogView>(fetcher: typeof fetch, view: V, query: CatalogListQuery): Promise<ListPage<Row<V>>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "" && value !== "all") params.set(key, String(value));
  const response = await fetcher(`/api/admin/catalog/${view}?${params}`, { cache: "no-store" });
  if (!response.ok) throw Error(response.status === 400 ? "The filter or page is no longer valid." : "The catalog is restricted or unavailable.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !Array.isArray((body as ListPage<unknown>).items)) throw Error("Invalid list response");
  return body as ListPage<Row<V>>;
}

export function useCatalogList<V extends CatalogView>(view: V, filters: Omit<CatalogListQuery, "cursor"> = {}) {
  const scope = JSON.stringify([view, filters]);
  const [paging, setPaging] = useState<{ scope: string; cursor?: string; history: (string | undefined)[] }>({ scope, history: [] });
  const cursor = paging.scope === scope ? paging.cursor : undefined, history = paging.scope === scope ? paging.history : [];
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([scope, cursor, revision]);
  const [result, setResult] = useState<{ key: string; page: ListPage<Row<V>> | null; error: string | null }>();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      fetchCatalogPage(fetch, view, { ...(JSON.parse(scope)[1] as CatalogListQuery), cursor })
        .then(page => { if (active) setResult({ key, page, error: null }); })
        .catch(reason => { if (active) setResult({ key, page: null, error: reason instanceof Error ? reason.message : "Data is unavailable" }); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [view, scope, cursor, key]);
  const reload = useCallback(() => setRevision(value => value + 1), [setRevision]);
  const loading = result?.key !== key, page = loading ? null : result?.page ?? null;
  return {
    items: page?.items ?? [], total: page?.total ?? 0, loading, error: loading ? null : result?.error ?? null, reload,
    pageNumber: history.length + 1, hasPrevious: history.length > 0, hasNext: Boolean(page?.nextCursor),
    next() { if (page?.nextCursor) setPaging({ scope, cursor: page.nextCursor, history: [...history, cursor] }); },
    previous() { if (history.length) setPaging({ scope, cursor: history.at(-1), history: history.slice(0, -1) }); },
  };
}
