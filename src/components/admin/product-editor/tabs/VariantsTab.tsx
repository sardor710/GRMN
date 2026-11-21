"use client";

import { useEffect, useRef } from "react";
import { OptionsEditor } from "../OptionsEditor";
import { VariantsTable } from "../VariantsTable";
import { Section } from "../Field";
import type { ProductEditorState } from "../useProductEditorState";

// Thin wrapper: the options/variants UI itself lives in OptionsEditor + VariantsTable (redesigned in M6).
export function VariantsTab({ editor, skuConflicts, focusSku }: { editor: ProductEditorState; skuConflicts: string[]; focusSku?: string | null }) {
  const { form, update } = editor;
  const tableRef = useRef<HTMLDivElement>(null);

  // "Open full editor" from the SKU drawer: scroll to and highlight that variant's SKU field.
  useEffect(() => {
    if (!focusSku || !tableRef.current) return;
    const input = [...tableRef.current.querySelectorAll<HTMLInputElement>("input")].find((element) => element.value.trim().toUpperCase() === focusSku.toUpperCase());
    if (!input) return;
    input.scrollIntoView({ block: "center" });
    input.focus({ preventScroll: true });
    const row = input.closest("tr");
    row?.classList.add("bg-[#fff8db]");
    const timer = window.setTimeout(() => row?.classList.remove("bg-[#fff8db]"), 2500);
    return () => window.clearTimeout(timer);
  }, [focusSku]);

  return (
    <div className="space-y-8">
      <Section id="variants-options" title="Options" description="Option names and values, e.g. Case size: 43 mm / 47 mm / 51 mm. Then generate variants; existing variants keep their SKU, price, stock and photos.">
        <OptionsEditor options={form.options} images={form.images} onChange={(options) => update({ options })} />
      </Section>
      <Section id="variants-table" title="Variants">
        <div ref={tableRef}>
          <VariantsTable
            options={form.options}
            variants={form.variants}
            images={form.images}
            base={{ sku: form.sku, price: form.price ?? 0, stock: form.stock }}
            conflicts={skuConflicts}
            onChange={(variants) => update({ variants })}
          />
        </div>
      </Section>
    </div>
  );
}
