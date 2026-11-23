// Owner 2026-11-23: the admin SEO tab previews each variant page's generated text in EN/RU/KK — the same text the
// storefront writes when no override is stored — from the editor's form and the product's stored translations
// (option names / value labels keyed by the editor's option and value ids). Pure.
import type { EditorForm } from "./editor-state.ts";
import { variantSeoText, type SeoProduct } from "../../../lib/seo/product-metadata.ts";
import type { SeoText } from "../../../lib/seo/generate.ts";

export type SeoLanguage = "en" | "ru" | "kk";
export const SEO_LANGUAGES: readonly SeoLanguage[] = ["en", "ru", "kk"];
type FormPart = Pick<EditorForm, "name" | "description" | "family" | "specGroups" | "categories" | "options" | "variants">;

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** The form as the SEO generator sees it in `locale` (variants carry localized option values and their own override). */
export function editorSeoProduct(form: FormPart, translations: unknown, locale: SeoLanguage): SeoProduct {
  const local = locale === "en" ? {} : rec(rec(translations)[locale]);
  const optionNames = rec(local.optionNames), valueLabels = rec(local.valueLabels);
  return {
    name: text(local.name) ?? form.name,
    description: text(local.description) ?? form.description,
    family: form.family || null,
    specs: form.specGroups.flatMap((group) => group.items),
    breadcrumb: form.categories.filter((c) => c.primary).map((c) => ({ slug: c.key, name: c.key })),
    variants: form.variants.map((variant) => {
      const optionValues = form.options.flatMap((option) => {
        const value = option.values.find((v) => v.id === variant.selections[option.id]);
        return value ? [{ key: option.key, name: text(optionNames[option.id]) ?? option.name, value: text(valueLabels[value.id]) ?? value.label }] : [];
      });
      const own = variant.seo?.[locale];
      return { id: variant.id, sku: variant.sku, options: Object.fromEntries(optionValues.map((o) => [o.key, o.value])), optionValues, ...(own ? { seo: own } : {}) };
    }),
  };
}

/** The generated title and description of variant `variantId` in `locale` (the placeholder under an override). */
export function variantSeoPreview(form: FormPart, translations: unknown, locale: SeoLanguage, variantId: string): SeoText {
  const product = editorSeoProduct(form, translations, locale);
  const variant = product.variants.find((v) => v.id === variantId);
  return variant ? variantSeoText(product, variant, locale, true) : { title: "", description: "", keywords: [] };
}

/** Every variant with its SEO fields filled from the generator in all three languages (`overwrite` replaces own text). */
export function fillVariantSeo(form: FormPart, translations: unknown, overwrite: boolean): EditorForm["variants"] {
  const previews = Object.fromEntries(SEO_LANGUAGES.map((locale) => [locale, editorSeoProduct(form, translations, locale)]));
  return form.variants.map((variant) => {
    const seo = { ...(variant.seo ?? {}) };
    for (const locale of SEO_LANGUAGES) {
      const product = previews[locale], target = product.variants.find((v) => v.id === variant.id);
      if (!target) continue;
      const generated = variantSeoText(product, target, locale, true), own = seo[locale] ?? {};
      seo[locale] = {
        title: overwrite || !own.title?.trim() ? generated.title : own.title,
        description: overwrite || !own.description?.trim() ? generated.description : own.description,
      };
    }
    return { ...variant, seo };
  });
}
