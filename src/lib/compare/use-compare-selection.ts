"use client";

// Task C-c: the compare selection for client components. The server render (and the first client render) sees an
// empty selection, so hydration always matches; the stored items appear right after.
import { useSyncExternalStore } from "react";
import { compareSelection, type CompareSelectionItem, type CompareSelectionStore } from "./selection.ts";

const NONE: readonly CompareSelectionItem[] = [];
const serverSnapshot = () => NONE;

export interface CompareSelectionState {
  items: readonly CompareSelectionItem[];
  update: CompareSelectionStore["update"];
}

export function useCompareSelection(): CompareSelectionState {
  const items = useSyncExternalStore(compareSelection.subscribe, compareSelection.getSnapshot, serverSnapshot);
  return { items, update: compareSelection.update };
}
