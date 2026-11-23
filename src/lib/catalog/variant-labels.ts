// Owner 2026-11-23: variant pages (titles, descriptions, structured data, feed) need each variant's option names and
// values in the page language. English comes from product_options / option_values; RU/KK translations
// (product_translations.content.optionNames / valueLabels) are keyed by the editor's option and value ids, which map
// to the stored rows by option key and value label. Pure: no database access.

export interface VariantOptionValue { key: string; name: string; value: string }
export interface EditorOption { id: string; key: string; values: { id: string; label: string }[] }
export interface OptionLabelOverlay {
  editorOptions: readonly EditorOption[];
  optionNames?: Readonly<Record<string, string>>;
  valueLabels?: Readonly<Record<string, string>>;
}

const filled = (value: string | undefined): string | undefined => (value && value.trim() ? value.trim() : undefined);

/**
 * `options` maps option key → English value label (VariantDTO.options); `order` lists the product's options (key,
 * English name) in display order. Options the variant has but `order` lacks follow, named by their key.
 */
export function variantOptionValues(
  options: Readonly<Record<string, string>>,
  order: readonly { key: string; name: string }[],
  overlay?: OptionLabelOverlay,
): VariantOptionValue[] {
  const known = new Set(order.map((o) => o.key));
  const keys = [...order.filter((o) => Object.hasOwn(options, o.key)), ...Object.keys(options).filter((k) => !known.has(k)).map((key) => ({ key, name: key }))];
  return keys.map(({ key, name }) => {
    const english = options[key];
    const editor = overlay?.editorOptions.find((o) => o.key === key);
    const value = editor?.values.find((v) => v.label === english);
    return {
      key,
      name: (editor && filled(overlay?.optionNames?.[editor.id])) ?? name,
      value: (value && filled(overlay?.valueLabels?.[value.id])) ?? english,
    };
  });
}
