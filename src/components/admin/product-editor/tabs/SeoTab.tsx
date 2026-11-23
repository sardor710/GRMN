"use client";

import { SEOEditor } from "@/components/admin/SEOEditor";
import { useTaxonomy } from "@/components/admin/catalog/useTaxonomy";
import { defaultImageSrc } from "../editor-state";
import type { ProductEditorState } from "../useProductEditorState";
import { VariantSeoPanel } from "../VariantSeoPanel";
import { productPath } from "@/lib/catalog/product-url";

export function SeoTab({ editor }: { editor: ProductEditorState }) {
  const { form, update, productKey } = editor;
  const { nodes } = useTaxonomy();
  const primary = form.categories.find((category) => category.primary);
  const categoryName = primary ? nodes?.find((node) => node.key === primary.key)?.name ?? "" : "";
  return (
    <div className="space-y-8">
    <SEOEditor
      type="product"
      nameOrTitle={form.name}
      defaultDescription={form.description}
      urlPath={form.productCode.trim() ? productPath(form.productCode.trim()) : productKey ? productPath(productKey) : "/p/new-product"}
      image={defaultImageSrc(form.images, form.defaultImageId) || form.image}
      category={categoryName}
      specs={form.specGroups.flatMap((group) => group.items)}
      seoTitle={form.seoTitle}
      seoDescription={form.seoDescription}
      focusKeywords={form.focusKeywords}
      canonicalUrl={form.canonicalUrl}
      noIndex={form.noIndex}
      ogImage={form.ogImage}
      onChange={(updates) => update((previous) => ({ ...previous, ...updates, canonicalUrl: updates.canonicalUrl ?? "", noIndex: updates.noIndex ?? false, ogImage: updates.ogImage ?? "" }))}
    />
    <VariantSeoPanel editor={editor} />
    </div>
  );
}
