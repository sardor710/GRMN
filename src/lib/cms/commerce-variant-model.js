// PostgreSQL catalog variants ({ options: { "Case Size": "41 mm", … } }) → the option/variant model the
// garmin.com-style VariantPicker renders, so both catalog backends show the same pickers.

const slug = (s) =>
  String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';

const isColorName = (name) => /colou?r/i.test(name);

/**
 * @param {{ variants: { id: string, sku: string, name: string, options: Record<string, string>, availability: string, gallery?: { url: string }[] }[], selectedVariantId?: string }} detail
 * @returns {{ options: object[], variants: object[] } | undefined} undefined when the product has no choices to make
 */
export function commerceVariantModel(detail) {
  const source = Array.isArray(detail?.variants) ? detail.variants : [];
  if (source.length < 2) return undefined;

  const names = [];
  for (const v of source) for (const name of Object.keys(v.options || {})) if (!names.includes(name)) names.push(name);
  if (!names.length) return undefined;

  const options = names.map((name) => {
    const optionId = `opt-${slug(name)}`;
    const labels = [];
    for (const v of source) {
      const label = v.options?.[name];
      if (label && !labels.includes(label)) labels.push(label);
    }
    const values = labels.map((label) => {
      // garmin.com shows each color as a photo of the watch in that color.
      const owner = source.find((v) => v.options?.[name] === label && v.gallery?.length);
      const value = { id: `${optionId}-${slug(label)}`, key: label, label };
      if (isColorName(name) && owner) value.swatchImage = owner.gallery[0].url;
      return value;
    });
    const swatch = isColorName(name) && values.every((v) => v.swatchImage);
    return { id: optionId, key: slug(name), name, display: swatch ? 'swatch' : 'buttons', values };
  });

  const selected = detail.selectedVariantId || source[0].id;
  const variants = source.map((v) => {
    const selections = {};
    for (const o of options) {
      const label = v.options?.[o.name];
      const value = o.values.find((x) => x.label === label);
      if (value) selections[o.id] = value.id;
    }
    return {
      id: v.id,
      sku: v.sku,
      title: v.name,
      selections,
      price: 0,
      // The server cart decides availability; every listed variant can be chosen, like garmin.com.
      stock: v.availability === 'available' ? 1 : 0,
      status: 'active',
      isDefault: v.id === selected,
      imageIds: [],
    };
  });
  return { options, variants };
}
