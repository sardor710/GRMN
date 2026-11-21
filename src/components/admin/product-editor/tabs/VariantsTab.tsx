"use client";

import { useCallback, useMemo } from "react";
import type { ProductOption } from "@/lib/cms/types";
import { VariantsStep } from "../VariantsStep";
import type { VariantsUpdater } from "../VariantsTable";
import type { ProductEditorState } from "../useProductEditorState";

// Thin wrapper: the options/variants UI lives in VariantsStep (OptionsEditor + sync bar + VariantsTable).
export function VariantsTab({ editor, skuConflicts, focusSku }: { editor: ProductEditorState; skuConflicts: string[]; focusSku?: string | null }) {
  const { form, update } = editor;
  const base = useMemo(() => ({ sku: form.sku, price: form.price ?? 0, stock: form.stock }), [form.sku, form.price, form.stock]);
  const onOptions = useCallback((options: ProductOption[]) => update({ options }), [update]);
  const onVariants = useCallback((updater: VariantsUpdater) => update((previous) => ({ ...previous, variants: updater(previous.variants) })), [update]);
  return (
    <VariantsStep
      options={form.options}
      variants={form.variants}
      images={form.images}
      base={base}
      conflicts={skuConflicts}
      focusSku={focusSku}
      onOptions={onOptions}
      onVariants={onVariants}
    />
  );
}
