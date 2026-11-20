"use client";

import type { HomepageConfig, HomepageTileBlock, HomepageTranslatable, Translations } from "@/lib/cms/types";
import { SharedAcrossLanguages } from "@/components/admin/LocaleTabs";
import { TranslationField } from "@/components/admin/TranslationField";
import { getOverlayString, setOverlayValue, type OverlayPath } from "@/lib/cms/translation-edit";

type HomepageTranslations = Translations<HomepageTranslatable>;
type TileGroup = "promoTiles" | "storyTiles" | "categoryTiles";

interface HomepageTranslationPanelProps {
  locale: "ru" | "kk";
  config: HomepageConfig;
  onChange: (next: HomepageTranslations) => void;
}

const sectionClass = "space-y-3 border border-border bg-white p-4";
const sectionTitle = "text-sm font-bold text-black";
const blockClass = "space-y-2 border-l-2 border-border pl-3";

const TILE_GROUPS: { key: TileGroup; label: string }[] = [
  { key: "promoTiles", label: "Promo tiles" },
  { key: "storyTiles", label: "Story tiles" },
  { key: "categoryTiles", label: "Category tiles" },
];

/**
 * RU/KK editing of the homepage overlay (stored at the config root, keyed by block and item id).
 * Images, links, prices, order and visibility stay shared across languages.
 */
export function HomepageTranslationPanel({ locale, config, onChange }: HomepageTranslationPanelProps) {
  const translations = config.translations ?? {};
  const get = (path: OverlayPath) => getOverlayString(translations, locale, path);
  const set = (path: OverlayPath) => (value: string) => onChange(setOverlayValue(translations, locale, path, value));

  const tile = (group: TileGroup, t: HomepageTileBlock) => (
    <div key={t.id} className={blockClass}>
      <TranslationField label={`${t.title} — title`} field="title" value={get([group, t.id, "title"])} source={t.title} onChange={set([group, t.id, "title"])} />
      <TranslationField label={`${t.title} — button`} field="cta" value={get([group, t.id, "cta"])} source={t.cta} onChange={set([group, t.id, "cta"])} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="border border-dashed border-border bg-neutral-50 p-3">
        <SharedAcrossLanguages />
        <p className="mt-1 text-xs text-muted-foreground">
          Images, links, prices, order and visibility are shared. Save with &ldquo;Save All Changes&rdquo;.
        </p>
      </div>

      <section className={sectionClass}>
        <h2 className={sectionTitle}>Hero banners ({config.heroBanners.length})</h2>
        {config.heroBanners.map((b) => (
          <div key={b.id} className={blockClass}>
            <TranslationField label={`${b.title} — title`} field="title" value={get(["heroBanners", b.id, "title"])} source={b.title} onChange={set(["heroBanners", b.id, "title"])} />
            <TranslationField
              label={`${b.title} — subtitle`}
              field="subtitle"
              value={get(["heroBanners", b.id, "subtitle"])}
              source={b.subtitle}
              onChange={set(["heroBanners", b.id, "subtitle"])}
            />
            {b.disclaimer && (
              <TranslationField
                label={`${b.title} — legal disclaimer`}
                field="disclaimer"
                multiline
                rows={2}
                value={get(["heroBanners", b.id, "disclaimer"])}
                source={b.disclaimer}
                onChange={set(["heroBanners", b.id, "disclaimer"])}
              />
            )}
          </div>
        ))}
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitle}>Carousels ({config.carousels.length})</h2>
        {config.carousels.map((c) => (
          <details key={c.id} className="space-y-3 border border-neutral-100 p-3" open={config.carousels.length <= 2}>
            <summary className="cursor-pointer text-xs font-bold text-neutral-700">
              {c.title} · {c.items.length} cards
            </summary>
            <div className={blockClass}>
              <TranslationField label={`${c.title} — heading`} field="title" value={get(["carousels", c.id, "title"])} source={c.title} onChange={set(["carousels", c.id, "title"])} />
              <TranslationField
                label={`${c.title} — subheading`}
                field="subtitle"
                value={get(["carousels", c.id, "subtitle"])}
                source={c.subtitle}
                onChange={set(["carousels", c.id, "subtitle"])}
              />
            </div>
            {c.items.map((item) => {
              const base = ["carousels", c.id, "items", item.id] as const;
              const badge = "badge" in item ? item.badge : undefined;
              const ctaText = "ctaText" in item ? item.ctaText : undefined;
              return (
                <div key={item.id} className={`${blockClass} ml-3`}>
                  <TranslationField label={`${item.title} — title`} field="title" value={get([...base, "title"])} source={item.title} onChange={set([...base, "title"])} />
                  <TranslationField
                    label={`${item.title} — description`}
                    field="description"
                    multiline
                    rows={2}
                    value={get([...base, "description"])}
                    source={item.description}
                    onChange={set([...base, "description"])}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {badge && (
                      <TranslationField label={`${item.title} — badge`} field="badge" value={get([...base, "badge"])} source={badge} onChange={set([...base, "badge"])} />
                    )}
                    {ctaText && (
                      <TranslationField label={`${item.title} — button`} field="ctaText" value={get([...base, "ctaText"])} source={ctaText} onChange={set([...base, "ctaText"])} />
                    )}
                    <TranslationField
                      label={`${item.title} — image alt`}
                      field="imageAlt"
                      value={get([...base, "imageAlt"])}
                      source={item.imageAlt || item.title}
                      onChange={set([...base, "imageAlt"])}
                    />
                  </div>
                </div>
              );
            })}
          </details>
        ))}
      </section>

      {TILE_GROUPS.map(({ key, label }) =>
        config[key].length ? (
          <section key={key} className={sectionClass}>
            <h2 className={sectionTitle}>
              {label} ({config[key].length})
            </h2>
            {config[key].map((t) => tile(key, t))}
          </section>
        ) : null,
      )}
    </div>
  );
}
