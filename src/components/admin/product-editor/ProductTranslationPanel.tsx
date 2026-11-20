"use client";

import type {
  ProductImage,
  ProductOption,
  ProductSpecItem,
  ProductTranslatable,
  ProductVariant,
  SpecGroup,
  Translations,
} from "@/lib/cms/types";
import { SharedAcrossLanguages } from "@/components/admin/LocaleTabs";
import { TranslationField } from "@/components/admin/TranslationField";
import { getOverlayString, setOverlayValue, type OverlayPath } from "@/lib/cms/translation-edit";
import { formatKzt, labelClass } from "./shared";

export type ProductTranslations = Translations<ProductTranslatable>;

/** The English form state the RU/KK tab reads (sources, ids and shared fields). */
export interface TranslatableProductForm {
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: string;
  description: string;
  priceSuffix: string;
  overviewHtml: string;
  seoTitle: string;
  seoDescription: string;
  specs: ProductSpecItem[];
  specGroups: SpecGroup[];
  inTheBox: string[];
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
}

interface ProductTranslationPanelProps {
  locale: "ru" | "kk";
  product: TranslatableProductForm;
  translations: ProductTranslations;
  onChange: (next: ProductTranslations) => void;
}

const sectionClass = "space-y-3 border border-border p-4";
const sectionTitle = "text-xs font-semibold text-black";

export function ProductTranslationPanel({ locale, product, translations, onChange }: ProductTranslationPanelProps) {
  const get = (path: OverlayPath) => getOverlayString(translations, locale, path);
  const set = (path: OverlayPath) => (value: string) => onChange(setOverlayValue(translations, locale, path, value));
  const hasVariants = product.variants.length > 0;
  const defaultVariant = product.variants.find((v) => v.isDefault) || product.variants[0];

  return (
    <div className="space-y-5">
      {/* Shared, read-only */}
      <section className="space-y-2 border border-dashed border-border bg-neutral-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={sectionTitle}>Shared fields</h3>
          <SharedAcrossLanguages />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className={labelClass}>SKU</dt>
            <dd className="mt-1 tabular-nums text-black">{product.sku || "—"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Price</dt>
            <dd className="mt-1 text-black">{formatKzt(hasVariants ? defaultVariant?.price : product.price)}</dd>
          </div>
          <div>
            <dt className={labelClass}>Stock</dt>
            <dd className="mt-1 text-black">{hasVariants ? defaultVariant?.stock ?? 0 : product.stock}</dd>
          </div>
          <div>
            <dt className={labelClass}>Status</dt>
            <dd className="mt-1 text-black">{product.status}</dd>
          </div>
        </dl>
        {product.images.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1" aria-label="Product photos (shared)">
            {product.images.slice(0, 12).map((img) => (
              // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of uploaded/imported paths
              <img key={img.id} src={img.src} alt="" className="h-12 w-12 border border-border bg-white object-contain p-0.5" />
            ))}
            {product.images.length > 12 && (
              <span className="self-center text-xs text-muted-foreground">+{product.images.length - 12} more</span>
            )}
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <h3 className={sectionTitle}>Title & description</h3>
        <TranslationField label="Product title" field="name" value={get(["name"])} source={product.name} onChange={set(["name"])} />
        <TranslationField
          label="Short description"
          field="description"
          multiline
          rows={3}
          value={get(["description"])}
          source={product.description}
          onChange={set(["description"])}
        />
        <TranslationField
          label="Price suffix"
          field="priceSuffix"
          value={get(["priceSuffix"])}
          source={product.priceSuffix}
          onChange={set(["priceSuffix"])}
        />
        <TranslationField
          label="Overview (HTML, sanitized on save)"
          field="overviewHtml"
          multiline
          rows={8}
          mono
          value={get(["overviewHtml"])}
          source={product.overviewHtml}
          onChange={set(["overviewHtml"])}
        />
      </section>

      <section className={sectionClass}>
        <h3 className={sectionTitle}>Search & social</h3>
        <TranslationField label="SEO title" field="seoTitle" value={get(["seoTitle"])} source={product.seoTitle} onChange={set(["seoTitle"])} />
        <TranslationField
          label="SEO description"
          field="seoDescription"
          multiline
          rows={3}
          value={get(["seoDescription"])}
          source={product.seoDescription}
          onChange={set(["seoDescription"])}
        />
      </section>

      {product.options.length > 0 && (
        <section className={sectionClass}>
          <h3 className={sectionTitle}>Options</h3>
          {product.options.map((option) => (
            <div key={option.id} className="space-y-2">
              <TranslationField
                label={`Option name — ${option.name}`}
                field="optionNames"
                value={get(["optionNames", option.id])}
                source={option.name}
                onChange={set(["optionNames", option.id])}
              />
              <div className="grid grid-cols-1 gap-2 pl-4 sm:grid-cols-2">
                {option.values.map((value) => (
                  <TranslationField
                    key={value.id}
                    compact
                    label={`${option.name}: ${value.label}`}
                    field="valueLabels"
                    value={get(["valueLabels", value.id])}
                    source={value.label}
                    onChange={set(["valueLabels", value.id])}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {product.variants.length > 0 && (
        <details className={sectionClass}>
          <summary className={`${sectionTitle} cursor-pointer`}>Variant titles ({product.variants.length})</summary>
          <div className="grid grid-cols-1 gap-2 pt-2">
            {product.variants.map((variant) => (
              <TranslationField
                key={variant.id}
                compact
                label={`Variant ${variant.sku}: ${variant.title}`}
                field="variantTitles"
                value={get(["variantTitles", variant.id])}
                source={variant.title}
                onChange={set(["variantTitles", variant.id])}
              />
            ))}
          </div>
        </details>
      )}

      {product.images.length > 0 && (
        <details className={sectionClass}>
          <summary className={`${sectionTitle} cursor-pointer`}>Photo alt text ({product.images.length})</summary>
          <div className="space-y-2 pt-2">
            {product.images.map((img) => (
              <div key={img.id} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                <img src={img.src} alt="" className="h-8 w-8 shrink-0 border border-border object-contain" />
                <div className="flex-1">
                  <TranslationField
                    compact
                    label={`Alt text for ${img.alt || img.id}`}
                    field="imageAlts"
                    value={get(["imageAlts", img.id])}
                    source={img.alt}
                    onChange={set(["imageAlts", img.id])}
                  />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {product.inTheBox.length > 0 && (
        <section className={sectionClass}>
          <h3 className={sectionTitle}>In the box</h3>
          {product.inTheBox.map((item, i) => (
            <TranslationField
              key={i}
              compact
              label={`In the box row ${i + 1}: ${item}`}
              field="inTheBox"
              value={get(["inTheBox", i])}
              source={item}
              onChange={set(["inTheBox", i])}
            />
          ))}
        </section>
      )}

      {product.specs.length > 0 && (
        <details className={sectionClass}>
          <summary className={`${sectionTitle} cursor-pointer`}>Tech specs ({product.specs.length} rows)</summary>
          <div className="space-y-2 pt-2">
            {product.specs.map((spec, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TranslationField
                  compact
                  label={`Spec ${i + 1} label: ${spec.label}`}
                  field="label"
                  value={get(["specs", i, "label"])}
                  source={spec.label}
                  onChange={set(["specs", i, "label"])}
                />
                <TranslationField
                  compact
                  label={`Spec ${i + 1} value: ${spec.value}`}
                  field="value"
                  value={get(["specs", i, "value"])}
                  source={spec.value}
                  onChange={set(["specs", i, "value"])}
                />
              </div>
            ))}
          </div>
        </details>
      )}

      {product.specGroups.length > 0 && (
        <details className={sectionClass}>
          <summary className={`${sectionTitle} cursor-pointer`}>Grouped specs ({product.specGroups.length} sections)</summary>
          <div className="space-y-4 pt-2">
            {product.specGroups.map((group, g) => (
              <div key={g} className="space-y-2">
                <TranslationField
                  compact
                  label={`Spec section ${g + 1}: ${group.title}`}
                  field="title"
                  value={get(["specGroups", g, "title"])}
                  source={group.title}
                  onChange={set(["specGroups", g, "title"])}
                />
                <div className="space-y-1 pl-4">
                  {group.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <TranslationField
                        compact
                        label={`${group.title} row ${i + 1} label: ${item.label}`}
                        field="label"
                        value={get(["specGroups", g, "items", i, "label"])}
                        source={item.label}
                        onChange={set(["specGroups", g, "items", i, "label"])}
                      />
                      <TranslationField
                        compact
                        label={`${group.title} row ${i + 1} value: ${item.value}`}
                        field="value"
                        value={get(["specGroups", g, "items", i, "value"])}
                        source={item.value}
                        onChange={set(["specGroups", g, "items", i, "value"])}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
