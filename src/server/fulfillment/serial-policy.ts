// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, M2): which products need a serial number
// at packing. Every electronic device does; only non-electronic accessories (bands, cases, cables, chargers, mounts)
// and digital items don't. Decided per product:
//   1. the product's own setting ("required" / "none"), else
//   2. its categories' effective settings (own or nearest ancestor's): any "required" wins, else any "none" exempts,
//      else it needs a serial; a product in no category instead uses
//   3. its old-site category (legacy_content category/subCategory) the same way, else
//   4. its name, only to exempt an obvious accessory and never when the name also names a device, else
//   5. it needs a serial (the safe side for warranty).

export type SerialPolicy = "required" | "none";
export interface SerialDecision {
  required: boolean;
  source: "product" | "category" | "legacy-category" | "name" | "default";
  /** The deciding category key, or the matched accessory word for "name". */
  detail: string | null;
}
export interface CategorySetting { key: string; effective: SerialPolicy | null }

/** Accessory words (EN + RU stems). Latin words use \b; JS \b is ASCII-only, so Cyrillic stems match without it. */
export const NO_SERIAL_NAME = /\b(bands?|straps?|bracelets?|cables?|chargers?|charging|cases?|mounts?|protectors?|lanyards?)\b|(ремеш|браслет|кабел|зарядн|чехол|креплен|пл[её]нк)/iu;
/** Device words: a name with any of these is never exempted, whatever accessory it mentions. */
export const DEVICE_NAME = /(watch|fēnix|fenix|forerunner|venu|vívo|vivo|instinct|epix|enduro|marq|quatix|tactix|descent|approach|lily|bounce|edge|hrm|sensor|varia|rally|vector|index|echomap|striker|livescope|panoptix|gpsmap|etrex|montana|oregon|inreach|zūmo|zumo|dēzl|dezl|drive|camper|tread|catalyst|dash ?cam|tacx|neo|flux|rangefinder|fishfinder|transducer|radar|часы|датчик|навигатор|эхолот)/iu;

function byCategories(categories: readonly CategorySetting[], source: "category" | "legacy-category"): SerialDecision {
  const required = categories.find(category => category.effective === "required");
  if (required) return { required: true, source, detail: required.key };
  const exempt = categories.find(category => category.effective === "none");
  if (exempt) return { required: false, source, detail: exempt.key };
  return { required: true, source: "default", detail: null };
}

export function decideSerial(input: { productPolicy: SerialPolicy | null; categories: readonly CategorySetting[]; legacyCategories: readonly CategorySetting[]; name: string }): SerialDecision {
  if (input.productPolicy) return { required: input.productPolicy === "required", source: "product", detail: null };
  if (input.categories.length) return byCategories(input.categories, "category");
  if (input.legacyCategories.length) return byCategories(input.legacyCategories, "legacy-category");
  const name = input.name.normalize("NFKC");
  const accessory = NO_SERIAL_NAME.exec(name);
  if (accessory && !DEVICE_NAME.test(name)) return { required: false, source: "name", detail: accessory[0].toLowerCase() };
  return { required: true, source: "default", detail: null };
}
