"use client";

import { useEffect, useState } from "react";

import { cachedTaxonomy, loadTaxonomy } from "./taxonomy-cache";

export { invalidateTaxonomy, loadTaxonomy } from "./taxonomy-cache";

export function useTaxonomy() {
  const [state, setState] = useState<{ nodes: ReturnType<typeof cachedTaxonomy>; error: string | null }>({ nodes: cachedTaxonomy(), error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (cachedTaxonomy() && attempt === 0) return;
    let active = true;
    loadTaxonomy(attempt > 0)
      .then((nodes) => { if (active) setState({ nodes, error: null }); })
      .catch((error: unknown) => { if (active) setState({ nodes: null, error: error instanceof Error ? error.message : "Categories could not be loaded." }); });
    return () => { active = false; };
  }, [attempt]);
  return { nodes: state.nodes, error: state.error, loading: !state.nodes && !state.error, retry: () => setAttempt((value) => value + 1) };
}
