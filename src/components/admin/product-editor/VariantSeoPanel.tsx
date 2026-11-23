"use client";

// Owner 2026-11-23: every variant has its own page (/p/{code}/{sku}) with its own SEO title and description in
// EN / RU / KK. A blank field means the storefront generates the text (shown here as the placeholder); the button
// copies the generated text into the fields so it can be edited.
import { useMemo, useState } from "react";
import { Button } from "@/components/admin/ui";
import { LocaleTabs, type ContentLocale } from "@/components/admin/LocaleTabs";
import { Section } from "./Field";
import { productPath } from "@/lib/catalog/product-url";
import { inputClass } from "./shared";
import { fillVariantSeo, variantSeoPreview } from "./variant-seo";
import type { ProductEditorState } from "./useProductEditorState";

const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://garmin.tigr.uz").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const textareaClass = inputClass.replace("h-10", "min-h-[64px] py-2");

export function VariantSeoPanel({ editor }: { editor: ProductEditorState }) {
  const { form, update, base } = editor;
  const [locale, setLocale] = useState<ContentLocale>("ru");
  const [overwrite, setOverwrite] = useState(false);
  const translations = base.translations;
  const variants = form.variants.filter((variant) => variant.status !== "archived");
  const previews = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variantSeoPreview(form, translations, locale, variant.id)])),
    [form, translations, locale, variants],
  );
  if (!variants.length) return null;
  const code = form.productCode.trim();
  const setField = (variantId: string, field: "title" | "description", value: string) =>
    update((previous) => ({
      ...previous,
      variants: previous.variants.map((variant) =>
        variant.id === variantId ? { ...variant, seo: { ...(variant.seo ?? {}), [locale]: { ...(variant.seo?.[locale] ?? {}), [field]: value } } } : variant,
      ),
    }));

  return (
    <Section
      id="variant-seo"
      title="Variant pages"
      description="Each variant has its own page for Google. Leave a field empty to use the generated text (shown in grey); it follows the variant's options and the product's translations."
      actions={
        <>
          <label className="flex items-center gap-2 text-[12px] text-black">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            Overwrite filled fields
          </label>
          <Button size="sm" onClick={() => update((previous) => ({ ...previous, variants: fillVariantSeo(previous, translations, overwrite) }))}>
            Generate SEO for all variants (EN/RU/KZ)
          </Button>
        </>
      }
    >
      <LocaleTabs value={locale} onChange={setLocale} status={{ ru: "complete", kk: "complete" }} className="mb-4" />
      <ul className="divide-y divide-[#e5e5e5] border border-[#e5e5e5]">
        {variants.map((variant) => {
          const own = variant.seo?.[locale] ?? {};
          const preview = previews.get(variant.id);
          const title = own.title ?? "", description = own.description ?? "";
          return (
            <li key={variant.id} className="grid gap-3 p-3 md:grid-cols-[180px_1fr]">
              <div className="min-w-0 text-[12px]">
                <p className="font-bold text-black">{variant.sku || "—"}</p>
                <p className="truncate text-[#666]" title={variant.title}>{variant.title}</p>
                {code && variant.sku && <p className="mt-1 break-all text-[#666]">{SITE_HOST}{productPath(code, variant.sku)}</p>}
              </div>
              <div className="grid gap-2">
                <label className="block text-[12px] font-bold text-black">
                  SEO title <span className="font-normal text-[#666]">({(title || preview?.title || "").length}/60)</span>
                  <input value={title} maxLength={70} placeholder={preview?.title} onChange={(event) => setField(variant.id, "title", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
                </label>
                <label className="block text-[12px] font-bold text-black">
                  Meta description <span className="font-normal text-[#666]">({(description || preview?.description || "").length}/160)</span>
                  <textarea value={description} maxLength={200} placeholder={preview?.description} onChange={(event) => setField(variant.id, "description", event.target.value)} className={`${textareaClass} mt-1 font-normal`} />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
