"use client";

import type { ProductImage } from "@/lib/cms/types";
import { ProductImagesEditor } from "../ProductImagesEditor";
import { Section } from "../Field";
import { defaultImageSrc } from "../editor-state";
import type { ProductEditorState } from "../useProductEditorState";

export function MediaTab({ editor }: { editor: ProductEditorState }) {
  const { form, update } = editor;
  const onChange = (images: ProductImage[], defaultImageId: string) =>
    update((previous) => {
      const ids = new Set(images.map((image) => image.id));
      return {
        ...previous,
        images,
        defaultImageId,
        image: defaultImageSrc(images, defaultImageId) || previous.image,
        // A removed photo can no longer be picked by a variant.
        variants: previous.variants.some((variant) => variant.imageIds.some((id) => !ids.has(id)))
          ? previous.variants.map((variant) => ({ ...variant, imageIds: variant.imageIds.filter((id) => ids.has(id)) }))
          : previous.variants,
      };
    });
  return (
    <Section id="media-photos" title="Photos" description="The starred photo is the main image on catalog cards. Variants pick their own photos in the Variants tab.">
      <ProductImagesEditor images={form.images} defaultImageId={form.defaultImageId} onChange={onChange} />
    </Section>
  );
}
