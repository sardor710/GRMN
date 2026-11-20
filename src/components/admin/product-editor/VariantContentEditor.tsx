"use client";

import type { ProductVariant } from "@/lib/cms/types";
import type { ProductContentDTO, VariantContent } from "@/lib/catalog/variant-content";
import {
  BLOCK_KEYS,
  copyProductBlock,
  ownsBlock,
  unchangedFromProduct,
  withoutBlock,
  type ContentBlock,
} from "@/lib/cms/variant-content-edit";
import { InTheBoxEditor, OverviewHtmlEditor, SpecsBlockEditor } from "./ContentBlockEditors";

// Task 2.3: per-variant Specs (incl. grouped specs), Overview and In the box (inherit with override,
// Task 2.1). Each block is "Same as product" (no key in variant.content) or "Own" (key present, even
// when empty). Own deep-copies the product's current block; Same as product removes the keys.

const BLOCKS: { id: ContentBlock; label: string }[] = [
  { id: "specs", label: "Specs" },
  { id: "overview", label: "Overview" },
  { id: "box", label: "In the box" },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Short names of the blocks a variant owns (for the variants table). */
export function ownedBlockLabels(content: VariantContent | undefined): string[] {
  return BLOCKS.filter((b) => ownsBlock(content, b.id)).map((b) => b.label);
}

interface VariantContentEditorProps {
  variant: ProductVariant;
  product: ProductContentDTO;
  /** `content` is `undefined` when the variant inherits every block; `removed` lists keys switched back to Same as product. */
  onChange: (content: VariantContent | undefined, removed?: (keyof VariantContent)[]) => void;
}

export function VariantContentEditor({ variant, product, onChange }: VariantContentEditorProps) {
  const content = variant.content ?? {};
  const emit = (next: VariantContent, removed?: (keyof VariantContent)[]) =>
    onChange(Object.keys(next).length ? next : undefined, removed);

  const setOwn = (block: ContentBlock, own: boolean) => {
    if (own === ownsBlock(content, block)) return;
    if (own) {
      emit({ ...content, ...copyProductBlock(product, block) });
      return;
    }
    if (
      !unchangedFromProduct(product, content, block) &&
      !window.confirm(`Remove ${variant.title}'s own ${BLOCKS.find((b) => b.id === block)?.label}? It will show the product's again.`)
    ) {
      return;
    }
    emit(withoutBlock(content, block), BLOCK_KEYS[block]);
  };

  const inheritedSummary = (block: ContentBlock): string => {
    if (block === "specs") {
      const groups = product.specGroups ?? [];
      return groups.length
        ? `Uses the product's specs (${plural(groups.length, "section")}, ${plural(groups.reduce((n, g) => n + g.items.length, 0), "row")}).`
        : `Uses the product's specs (${plural(product.specs.length, "row")}).`;
    }
    if (block === "overview") return product.overviewHtml ? "Uses the product's overview." : "The product has no overview.";
    return `Uses the product's list (${plural(product.inTheBox.length, "item")}).`;
  };

  return (
    <div className="space-y-3" data-variant-content={variant.id}>
      {BLOCKS.map((block) => {
        const own = ownsBlock(content, block.id);
        const groupLabel = `${block.label} for ${variant.title}`;
        return (
          <section key={block.id} data-block={block.id} className="border border-border bg-white p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="font-sans text-xs font-semibold text-black">{block.label}</h5>
              <div role="group" aria-label={groupLabel} className="inline-flex border border-border">
                {[
                  { value: false, label: "Same as product" },
                  { value: true, label: "Own" },
                ].map((choice) => {
                  const checked = own === choice.value;
                  return (
                    <button
                      key={choice.label}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => setOwn(block.id, choice.value)}
                      className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                        checked ? "bg-black text-white" : "bg-white text-neutral-600 hover:text-black"
                      }`}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!own && <p className="text-xs text-muted-foreground">{inheritedSummary(block.id)}</p>}

            {own && block.id === "specs" && (
              <SpecsBlockEditor
                specs={content.specs ?? []}
                specGroups={content.specGroups ?? []}
                onChange={(next) => emit({ ...content, ...next })}
                hint={`Specs shown for ${variant.title}.`}
              />
            )}

            {own && block.id === "overview" && (
              <OverviewHtmlEditor
                id={`variant-overview-${variant.id}`}
                label="Overview (HTML)"
                value={content.overviewHtml ?? ""}
                onChange={(overviewHtml) => emit({ ...content, overviewHtml })}
              />
            )}

            {own && block.id === "box" && (
              <InTheBoxEditor items={content.inTheBox ?? []} onChange={(inTheBox) => emit({ ...content, inTheBox })} />
            )}
          </section>
        );
      })}
    </div>
  );
}
