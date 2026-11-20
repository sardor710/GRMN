"use client";

import type { ProductVariant } from "@/lib/cms/types";
import type { ProductContentDTO, VariantContent } from "@/lib/catalog/variant-content";
import { InTheBoxEditor, OverviewHtmlEditor, SpecsListEditor } from "./ContentBlockEditors";

// Task 2.3: per-variant Specs, Overview and In the box (inherit with override, Task 2.1). Each block
// is "Same as product" (no key in variant.content) or "Own" (key present, even when empty). Switching
// to Own copies the product's current block as a starting point; switching back removes the key.

type Block = "specs" | "overview" | "box";

const BLOCKS: { id: Block; label: string }[] = [
  { id: "specs", label: "Specs" },
  { id: "overview", label: "Overview" },
  { id: "box", label: "In the box" },
];

/** Whether the variant owns a block. Specs covers both the flat list and grouped specs. */
export function ownsBlock(content: VariantContent | undefined, block: Block): boolean {
  if (!content) return false;
  if (block === "specs") return content.specs !== undefined || content.specGroups !== undefined;
  if (block === "overview") return content.overviewHtml !== undefined;
  return content.inTheBox !== undefined;
}

/** Short names of the blocks a variant owns (for the variants table). */
export function ownedBlockLabels(content: VariantContent | undefined): string[] {
  return BLOCKS.filter((b) => ownsBlock(content, b.id)).map((b) => b.label);
}

const withoutBlock = (content: VariantContent, block: Block): VariantContent => {
  const next = { ...content };
  if (block === "specs") {
    delete next.specs;
    delete next.specGroups;
  } else if (block === "overview") {
    delete next.overviewHtml;
  } else {
    delete next.inTheBox;
  }
  return next;
};

/** The product's block copied into a new override. Grouped specs are flattened so the list editor can edit them. */
const copyOfProduct = (product: ProductContentDTO, block: Block): VariantContent => {
  if (block === "specs") {
    const rows = product.specGroups?.length ? product.specGroups.flatMap((g) => g.items) : product.specs;
    // An own, empty specGroups keeps the product's groups from replacing this variant's list.
    return { specs: rows.map((r) => ({ label: r.label, value: r.value })), specGroups: [] };
  }
  if (block === "overview") return { overviewHtml: product.overviewHtml ?? "" };
  return { inTheBox: [...product.inTheBox] };
};

/** True while an owned block still equals the product's (nothing would be lost by switching back). */
const unchangedFromProduct = (product: ProductContentDTO, content: VariantContent, block: Block): boolean => {
  const copy = copyOfProduct(product, block);
  return (Object.keys(copy) as (keyof VariantContent)[]).every((key) => JSON.stringify(content[key]) === JSON.stringify(copy[key]));
};

interface VariantContentEditorProps {
  variant: ProductVariant;
  product: ProductContentDTO;
  /** `undefined` when the variant inherits every block. */
  onChange: (content: VariantContent | undefined) => void;
}

export function VariantContentEditor({ variant, product, onChange }: VariantContentEditorProps) {
  const content = variant.content ?? {};
  const emit = (next: VariantContent) => onChange(Object.keys(next).length ? next : undefined);

  const setOwn = (block: Block, own: boolean) => {
    if (own === ownsBlock(content, block)) return;
    if (own) {
      emit({ ...content, ...copyOfProduct(product, block) });
      return;
    }
    if (
      !unchangedFromProduct(product, content, block) &&
      !window.confirm(`Remove ${variant.title}'s own ${BLOCKS.find((b) => b.id === block)?.label}? It will show the product's again.`)
    ) {
      return;
    }
    emit(withoutBlock(content, block));
  };

  const inheritedSummary = (block: Block): string => {
    if (block === "specs") {
      const rows = product.specGroups?.length ? product.specGroups.reduce((n, g) => n + g.items.length, 0) : product.specs.length;
      return `Uses the product's specs (${rows} rows).`;
    }
    if (block === "overview") return product.overviewHtml ? "Uses the product's overview." : "The product has no overview.";
    return `Uses the product's list (${product.inTheBox.length} items).`;
  };

  return (
    <div className="space-y-3" data-variant-content={variant.id}>
      {BLOCKS.map((block) => {
        const own = ownsBlock(content, block.id);
        const groupLabel = `${block.label} for ${variant.title}`;
        return (
          <section key={block.id} data-block={block.id} className="border border-neutral-200 bg-white p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-[11px] font-heading uppercase tracking-wider font-semibold text-black">{block.label}</h5>
              <div role="group" aria-label={groupLabel} className="inline-flex border border-neutral-300">
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
                      className={`px-2.5 py-1 text-[11px] font-heading uppercase tracking-wider font-semibold transition-colors ${
                        checked ? "bg-black text-white" : "bg-white text-neutral-600 hover:text-black"
                      }`}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!own && <p className="text-[12px] text-neutral-500">{inheritedSummary(block.id)}</p>}

            {own && block.id === "specs" && (
              <div className="space-y-3">
                {(content.specGroups?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
                    <span>
                      This variant has {content.specGroups?.length} grouped spec sections. Shoppers see them instead of the list
                      below.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        emit({ ...content, specs: (content.specGroups ?? []).flatMap((g) => g.items), specGroups: [] })
                      }
                      className="font-semibold underline"
                    >
                      Use the flat list instead
                    </button>
                  </div>
                )}
                <SpecsListEditor
                  specs={content.specs ?? []}
                  onChange={(specs) => emit({ ...content, specs, specGroups: content.specGroups ?? [] })}
                  hint={`Specs shown for ${variant.title}.`}
                />
              </div>
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
