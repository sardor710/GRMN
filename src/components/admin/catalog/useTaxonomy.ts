"use client";

import { useEffect, useState } from "react";
import type { TaxonomyNode } from "@/contracts/admin-catalog";

// The category tree changes rarely: one request per page load is shared by the list filter, the editor
// and the quick-edit drawer (the API also sends an ETag and `max-age=300`).
let cached: TaxonomyNode[] | null = null;
let inflight: Promise<TaxonomyNode[]> | null = null;

export function loadTaxonomy(force = false): Promise<TaxonomyNode[]> {
  if (cached && !force) return Promise.resolve(cached);
  if (inflight && !force) return inflight;
  inflight = fetch("/api/admin/catalog/taxonomy")
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

export function useTaxonomy() {
  const [state, setState] = useState<{ nodes: TaxonomyNode[] | null; error: string | null }>({ nodes: cached, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (cached && attempt === 0) return;
    let active = true;
    loadTaxonomy(attempt > 0)
      .then((nodes) => { if (active) setState({ nodes, error: null }); })
      .catch((error: unknown) => { if (active) setState({ nodes: null, error: error instanceof Error ? error.message : "Categories could not be loaded." }); });
    return () => { active = false; };
  }, [attempt]);
  return { nodes: state.nodes, error: state.error, loading: !state.nodes && !state.error, retry: () => setAttempt((value) => value + 1) };
}
