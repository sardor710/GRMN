"use client";

import { SEOEditor } from "@/components/admin/SEOEditor";
import { useTaxonomy } from "@/components/admin/catalog/useTaxonomy";
import { defaultImageSrc } from "../editor-state";
import type { ProductEditorState } from "../useProductEditorState";

export function SeoTab({ editor }: { editor: ProductEditorState }) {
  const { form, update, productKey } = editor;
  const { nodes } = useTaxonomy();
  const primary = form.categories.find((category) => category.primary);
  const categoryName = primary ? nodes?.find((node) => node.key === primary.key)?.name ?? "" : "";
  return (
    <SEOEditor
      type="product"
      nameOrTitle={form.name}
      defaultDescription={form.description}
      urlPath={productKey ? `/p/${productKey}` : "/p/new-product"}
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
  );
}
