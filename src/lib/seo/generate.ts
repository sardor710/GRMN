// Localized SEO text for product and variant pages (en / ru / kk). Pure: no I/O, no server imports.
//
// Title:       [category noun] + "Garmin" + name + option values + store suffix, at most 60 characters.
//              When too long: drop the store suffix, then the category noun, then the brand, then shorten
//              the name (variant option values are what the page is about, so they are kept to the end).
// Description: a buying lead with the option values, the first sentence(s) of the localized description,
//              then short selling points (official warranty, delivery across Kazakhstan) up to 120-160
//              characters, always ending on a whole sentence.
// Keywords:    name, name + each option value, the buying phrase, the plain-ASCII spelling, at most 8.

export type SeoLocale = "en" | "ru" | "kk";

export interface SeoSubject {
  name: string;
  family?: string | null;
  kind: "device" | "accessory";
  categoryName?: string | null;
  description?: string | null;
  specs?: { label: string; value: string }[];
}

/** Option values are already localized by the caller; they may be the English fallback. */
export interface SeoVariantSubject {
  sku: string;
  optionValues: { name: string; value: string }[];
}

export interface SeoText {
  title: string;
  description: string;
  keywords: string[];
}

const TITLE_MAX = 60;
const DESCRIPTION_MIN = 120;
const DESCRIPTION_MAX = 160;
/** Selling points are added until the description reaches this length (or nothing more fits). */
const DESCRIPTION_TARGET = DESCRIPTION_MIN + 10;
const KEYWORDS_MAX = 8;
/** Option values that go into keywords one by one; the rest still appear in title and description. */
const KEYWORD_OPTIONS_MAX = 4;
const BRAND = "Garmin";

// ---------------------------------------------------------------------------
// Category nouns
// ---------------------------------------------------------------------------

type NounKey = "watch" | "tracker" | "bikeComputer" | "handheld" | "band" | "charger" | "mount" | "sensor" | "accessory";

interface Noun {
  /** English title form; omitted from the English title when the name already says it (`redundant`). */
  enTitle: string;
  /** English running-text form. */
  en: string;
  redundant: RegExp;
  /** Russian nominative, capitalized (title start); the accusative of these inanimate nouns is the same. */
  ruTitle: string;
  ru: string;
  /** Kazakh nominative (title start) and the possessive form ("Garmin X смарт-сағаты"); accusative = possessive + "н". */
  kkTitle: string;
  kkPossessive: string;
}

const NOUNS: Record<NounKey, Noun> = {
  watch: {
    enTitle: "Smartwatch", en: "smartwatch", redundant: /watch/,
    ruTitle: "Смарт-часы", ru: "смарт-часы", kkTitle: "Смарт-сағат", kkPossessive: "смарт-сағаты",
  },
  tracker: {
    enTitle: "Fitness Tracker", en: "fitness tracker", redundant: /tracker|band/,
    ruTitle: "Фитнес-трекер", ru: "фитнес-трекер", kkTitle: "Фитнес-трекер", kkPossessive: "фитнес-трекері",
  },
  bikeComputer: {
    enTitle: "Bike Computer", en: "bike computer", redundant: /computer/,
    ruTitle: "Велокомпьютер", ru: "велокомпьютер", kkTitle: "Велокомпьютер", kkPossessive: "велокомпьютері",
  },
  handheld: {
    enTitle: "Handheld GPS", en: "handheld GPS", redundant: /handheld|navigator/,
    ruTitle: "GPS-навигатор", ru: "GPS-навигатор", kkTitle: "GPS-навигатор", kkPossessive: "GPS-навигаторы",
  },
  band: {
    enTitle: "Watch Band", en: "watch band", redundant: /band|strap|bracelet/,
    ruTitle: "Ремешок", ru: "ремешок", kkTitle: "Сағат бауы", kkPossessive: "сағат бауы",
  },
  charger: {
    enTitle: "Charger", en: "charger", redundant: /charg|cable/,
    ruTitle: "Зарядное устройство", ru: "зарядное устройство", kkTitle: "Зарядтау құрылғысы", kkPossessive: "зарядтау құрылғысы",
  },
  mount: {
    enTitle: "Mount", en: "mount", redundant: /mount/,
    ruTitle: "Крепление", ru: "крепление", kkTitle: "Бекіткіш", kkPossessive: "бекіткіші",
  },
  sensor: {
    enTitle: "Sensor", en: "sensor", redundant: /sensor|monitor/,
    ruTitle: "Датчик", ru: "датчик", kkTitle: "Датчик", kkPossessive: "датчигі",
  },
  accessory: {
    enTitle: "Accessory", en: "accessory", redundant: /accessor/,
    ruTitle: "Аксессуар", ru: "аксессуар", kkTitle: "Аксессуар", kkPossessive: "аксессуары",
  },
};

/** Kazakh possessive used in running text when a device has no specific noun ("X құрылғысын сатып алыңыз"). */
const KK_DEVICE_POSSESSIVE = "құрылғысы";

const WATCH_FAMILIES =
  /\b(fenix|epix|enduro|forerunner|venu|vivoactive|vivomove|instinct|lily|marq|quatix|tactix|descent|approach s\d|d2|bounce|swim)\b/;

function nounKey(subject: SeoSubject): NounKey | null {
  const own = fold(`${subject.name} ${subject.family ?? ""}`);
  const all = fold(`${own} ${subject.categoryName ?? ""}`);
  if (subject.kind === "accessory") {
    if (/band|strap|bracelet|ремеш|бау|білезік/.test(all)) return "band";
    if (/charg|cable|заряд|кабел/.test(all)) return "charger";
    if (/mount|крепл|бекіт/.test(all)) return "mount";
    if (/sensor|heart rate monitor|\bhrm|датчик/.test(all)) return "sensor";
    return "accessory";
  }
  if (/vivosmart|vivofit|cirqa|smart band/.test(own)) return "tracker";
  if (WATCH_FAMILIES.test(own)) return "watch";
  if (/\bedge\b|bike computer|cycling computer/.test(all)) return "bikeComputer";
  if (/gpsmap|etrex|montana|handheld/.test(all)) return "handheld";
  if (/watch|часы|сағат/.test(all)) return "watch";
  if (/tracker|tracking|трекер/.test(all)) return "tracker";
  return null;
}

// ---------------------------------------------------------------------------
// Locale wording
// ---------------------------------------------------------------------------

interface Wording {
  /** Title layout from its parts; any part may be absent. */
  title(parts: TitleParts): string;
  /** First description sentence. `product` is "Garmin name" (or the name when it already carries the brand). */
  lead(noun: Noun | null, product: string, options: string): string;
  buyKeyword(name: string): string;
  categoryKeyword(noun: Noun | null): string | null;
  /** Short selling points, in the order they are added. Keep at least one under 40 characters. */
  points: readonly string[];
  /** Whether a description sentence is written in this locale (an untranslated fallback is not quoted). */
  accepts(sentence: string): boolean;
}

interface TitleParts {
  noun: Noun | null;
  brand: boolean;
  name: string;
  options: string;
  suffix: boolean;
}

const CYRILLIC = /[\u0400-\u04ff]/;
const KAZAKH_LETTERS = /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/;

const withBrand = (parts: TitleParts) => (parts.brand ? `${BRAND} ${parts.name}` : parts.name);
/** "X (43 mm, Black)"; after a name that already ends in brackets, "X (Gen 3), 43 mm, Black," instead. */
const withOptions = (text: string, options: string) =>
  !options ? text : text.endsWith(")") ? `${text}, ${options},` : `${text} (${options})`;

const WORDING: Record<SeoLocale, Wording> = {
  en: {
    title: (p) =>
      `${withBrand(p)}${p.noun ? ` ${p.noun.enTitle}` : ""}${p.options ? ` – ${p.options}` : ""}${p.suffix ? " | Buy in Kazakhstan" : ""}`,
    lead: (noun, product, options) => `Buy the ${withOptions(noun ? `${product} ${noun.en}` : product, options)} in Kazakhstan.`,
    buyKeyword: (name) => `buy ${name}`,
    categoryKeyword: (noun) => (noun ? `${BRAND} ${noun.en}` : null),
    points: [
      "Official warranty and delivery across Kazakhstan.",
      "Genuine product, prices in tenge.",
      "See specs, price and availability.",
      "Order online today.",
    ],
    accepts: (sentence) => !CYRILLIC.test(sentence),
  },
  ru: {
    title: (p) =>
      `${p.noun ? `${p.noun.ruTitle} ` : ""}${withBrand(p)}${p.options ? ` ${p.options}` : ""}${p.suffix ? " — купить в Казахстане" : ""}`,
    lead: (noun, product, options) => `Купить ${noun ? `${noun.ru} ` : ""}${withOptions(product, options)} в Казахстане.`,
    buyKeyword: (name) => `купить ${name}`,
    categoryKeyword: (noun) => (noun ? `${noun.ru} ${BRAND}` : null),
    points: [
      "Официальная гарантия и доставка по всему Казахстану.",
      "Оригинальная продукция, цены в тенге.",
      "Характеристики, цена и наличие на сайте.",
      "Закажите онлайн.",
    ],
    accepts: (sentence) => CYRILLIC.test(sentence) && !KAZAKH_LETTERS.test(sentence),
  },
  kk: {
    title: (p) =>
      `${p.noun ? `${p.noun.kkTitle} ` : ""}${withBrand(p)}${p.options ? ` ${p.options}` : ""}${p.suffix ? " — Қазақстанда сатып алу" : ""}`,
    lead: (noun, product, options) =>
      `${withOptions(`${product} ${noun ? noun.kkPossessive : KK_DEVICE_POSSESSIVE}н`, options)} Қазақстанда сатып алыңыз.`,
    buyKeyword: (name) => `${name} сатып алу`,
    categoryKeyword: (noun) => (noun ? `${BRAND} ${noun.kkPossessive}` : null),
    points: [
      "Ресми кепілдік және Қазақстан бойынша жеткізу.",
      "Түпнұсқа өнім, бағасы теңгемен.",
      "Сипаттамалары, бағасы және қолжетімділігі сайтта.",
      "Онлайн тапсырыс беріңіз.",
    ],
    accepts: (sentence) => KAZAKH_LETTERS.test(sentence),
  },
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Removes ®, ™, ©, ℠ and collapses whitespace. */
function clean(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[®™©℠]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase without diacritics, for matching ("fēnix" → "fenix"). */
function fold(text: string): string {
  return ascii(text).toLowerCase();
}

function ascii(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hasBrand(name: string): boolean {
  return /\bgarmin\b/i.test(name);
}

/** Punctuation, or a connector word that cannot end a shortened text ("… Soft Gold with"). */
const DANGLING_END =
  /(?:[\s,;:–—|(/-]+|\s+(?:with|and|or|for|in|of|и|с|со|в|на|для|или|мен|және|бен|пен|үшін|немесе))$/i;

/** Drops a trailing "(…" left open by shortening, then dangling separators and connectors, repeatedly. */
function tidyEnd(text: string): string {
  let out = text;
  const open = out.lastIndexOf("(");
  if (open > 0 && open > out.lastIndexOf(")")) out = out.slice(0, open);
  for (let previous = ""; previous !== out; ) {
    previous = out;
    out = out.replace(DANGLING_END, "").trim();
  }
  return out;
}

/** Cuts on a word boundary (a space, or the slash in "Gray/Dark") so the result is at most `max` characters. */
function trimWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  const slash = cut.lastIndexOf("/", max - 1);
  const end = Math.max(space, slash);
  return tidyEnd(end > 0 ? cut.slice(0, end) : text.slice(0, max));
}

function sentences(text: string): string[] {
  return text
    .replace(/([.!?]+)\s+/g, "$1\n")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`));
}

/** Words of a text for comparing names: lowercase, no diacritics, punctuation ignored. */
function tokens(text: string): string[] {
  return fold(clean(text)).split(/[^a-z0-9\u0400-\u04ff]+/).filter(Boolean);
}

/** Whether `part` appears as a run of whole words in `whole`. */
function containsWords(whole: readonly string[], part: readonly string[]): boolean {
  if (!part.length || part.length > whole.length) return false;
  for (let start = 0; start + part.length <= whole.length; start += 1) {
    if (part.every((token, index) => whole[start + index] === token)) return true;
  }
  return false;
}

const YES = /^(yes|true|да|иә|ия)$/;
const NO = /^(no|false|нет|жоқ)$/;

/**
 * Option values as they read in text: a yes-value prints the option name ("inReach: Yes" → "inReach"), a no-value
 * is left out, a value the product name already says is left out ("Lily 2" on Lily 2 Active), and a leading
 * product-name prefix is stripped ("fēnix 8 – AMOLED" on fēnix 8 → "AMOLED").
 */
function optionValues(name: string, variant: SeoVariantSubject | null): string[] {
  const nameTokens = tokens(name);
  const values: string[] = [];
  for (const option of variant?.optionValues ?? []) {
    let value = clean(option.value);
    const flag = value.toLowerCase();
    if (NO.test(flag)) continue;
    if (YES.test(flag)) value = clean(option.name);
    // Strip the product name (or its first two words or more) from the front of the value.
    const words = value.split(" ");
    for (let count = words.length; count >= 1; count -= 1) {
      const head = tokens(words.slice(0, count).join(" "));
      const isPrefix = head.length > 0 && head.every((token, index) => nameTokens[index] === token);
      if (isPrefix && (head.length >= 2 || head.length === nameTokens.length)) {
        value = words.slice(count).join(" ").replace(/^[\s,;:–—|/-]+/, "").trim();
        break;
      }
    }
    if (!value || containsWords(nameTokens, tokens(value))) continue;
    values.push(value);
  }
  return uniqueCaseInsensitive(values);
}

/**
 * The option values that fit in `budget` characters: the last value (the specific one, e.g. Model/Color) first,
 * then earlier values from the end backwards while they fit, printed in their original order. Null when even the
 * last value alone does not fit.
 */
function fitOptions(values: readonly string[], budget: number): string | null {
  if (!values.length) return "";
  const last = values.length - 1;
  if (values[last].length > budget) return null;
  const chosen = new Set([last]);
  let length = values[last].length;
  for (let index = last - 1; index >= 0; index -= 1) {
    if (length + 2 + values[index].length <= budget) {
      chosen.add(index);
      length += 2 + values[index].length;
    }
  }
  return values.filter((_, index) => chosen.has(index)).join(", ");
}

function uniqueCaseInsensitive(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** An earlier option value short and specific enough to keep in a hard-trimmed title (a size, a display). */
const SHORT_OPTION = 12;

function buildTitle(locale: SeoLocale, name: string, noun: Noun | null, values: readonly string[]): string {
  const wording = WORDING[locale];
  const options = values.join(", ");
  const brand = !hasBrand(name);
  const base: TitleParts = { noun, brand, name, options, suffix: true };
  const stages: TitleParts[] = [
    base,
    { ...base, suffix: false },
    { ...base, suffix: false, noun: null },
    { ...base, suffix: false, noun: null, brand: false },
  ];
  // Shorter names (keeping the first two words) come last, so the option values survive.
  const words = name.split(" ");
  for (let count = words.length - 1; count >= Math.min(2, words.length); count -= 1) {
    stages.push({ noun: null, brand: false, suffix: false, options, name: tidyEnd(words.slice(0, count).join(" ")) || name });
  }
  const fits = (title: string) => title.length > 0 && title.length <= TITLE_MAX;

  // 1. Every option value, giving up suffix, noun and brand in turn.
  for (const parts of stages.slice(0, 4)) {
    const title = wording.title(parts);
    if (fits(title)) return title;
  }
  // 2. Fewer option values (the specific last one first), giving up suffix, noun, brand, then name words.
  for (const parts of stages.slice(1)) {
    const budget = TITLE_MAX - wording.title({ ...parts, options: "x" }).length + 1;
    const chosen = fitOptions(values, budget);
    if (chosen === null) continue;
    const title = wording.title({ ...parts, options: chosen });
    if (fits(title)) return title;
  }
  // 3. Hard trim: the name, short earlier values and the last value, cut on a word boundary.
  const kept = values.filter((value, index) => index === values.length - 1 || (value.length <= SHORT_OPTION && !value.includes(",")));
  const last = stages[stages.length - 1];
  const parts = { ...last, name: name.length <= TITLE_MAX / 2 ? name : last.name, options: kept.join(", ") };
  return trimWords(wording.title(parts), TITLE_MAX) || trimWords(name, TITLE_MAX);
}

function buildDescription(locale: SeoLocale, subject: SeoSubject, name: string, noun: Noun | null, options: string): string {
  const wording = WORDING[locale];
  const product = hasBrand(name) ? name : `${BRAND} ${name}`;
  let lead = wording.lead(noun, product, options);
  // Too long: shorten the option values first so the sentence keeps its "… in Kazakhstan" ending.
  if (lead.length > DESCRIPTION_MAX && options) {
    const shorter = trimWords(options, options.length - (lead.length - DESCRIPTION_MAX));
    if (shorter) lead = wording.lead(noun, product, shorter);
  }
  if (lead.length > DESCRIPTION_MAX) lead = `${trimWords(lead.replace(/\.$/, ""), DESCRIPTION_MAX - 1)}.`;

  const parts = [lead];
  const length = () => parts.join(" ").length;
  const fits = (sentence: string) => length() + 1 + sentence.length <= DESCRIPTION_MAX;
  // Accessories quote no sentence that mentions smartwatches, so the item is never called one.
  const onTopic = (sentence: string) => subject.kind !== "accessory" || !/smart\s?watch|смарт-час|смарт-сағат/i.test(sentence);

  // The opening sentences of the product's own description, in order, while they fit.
  for (const sentence of sentences(clean(subject.description))) {
    if (!wording.accepts(sentence) || !onTopic(sentence)) continue;
    if (!fits(sentence)) break;
    parts.push(sentence);
  }
  // Without a usable description, two short specs say something concrete about the product.
  if (parts.length === 1) {
    const specs = (subject.specs ?? [])
      .map((spec) => ({ label: clean(spec.label), value: clean(spec.value) }))
      .filter((spec) => spec.label && spec.value && wording.accepts(`${spec.label} ${spec.value}`))
      .slice(0, 2)
      .map((spec) => `${spec.label}: ${spec.value}`);
    const sentence = specs.length ? `${specs.join("; ")}.` : "";
    if (sentence && fits(sentence)) parts.push(sentence);
  }
  for (const point of wording.points) {
    if (length() >= DESCRIPTION_TARGET) break;
    if (fits(point)) parts.push(point);
  }
  return parts.join(" ");
}

function buildKeywords(locale: SeoLocale, subject: SeoSubject, name: string, noun: Noun | null, values: string[]): string[] {
  const wording = WORDING[locale];
  const plain = ascii(name);
  const family = clean(subject.family);
  return uniqueCaseInsensitive([
    name,
    ...values.slice(0, KEYWORD_OPTIONS_MAX).map((value) => `${name} ${value}`),
    wording.buyKeyword(name),
    plain,
    hasBrand(name) ? null : `${BRAND} ${name}`,
    wording.categoryKeyword(noun),
    values[0] ? `${plain} ${values[0]}` : null,
    family && !fold(name).includes(fold(family)) ? `${BRAND} ${family}` : null,
  ]).slice(0, KEYWORDS_MAX);
}

function generate(subject: SeoSubject, variant: SeoVariantSubject | null, locale: SeoLocale): SeoText {
  const name = clean(subject.name) || BRAND;
  const key = nounKey(subject);
  const noun = key ? NOUNS[key] : null;
  // The English title skips a noun the name already contains ("QuickFit 22 Watch Bands" + "Watch Band").
  const titleNoun = noun && locale === "en" && noun.redundant.test(fold(name)) ? null : noun;
  const values = optionValues(name, variant);
  const joined = values.join(", ");
  return {
    title: buildTitle(locale, name, titleNoun, values),
    description: buildDescription(locale, subject, name, locale === "en" ? titleNoun : noun, joined),
    keywords: buildKeywords(locale, subject, name, noun, values),
  };
}

/** Product-level title, description and keywords. */
export function generateProductSeo(subject: SeoSubject, locale: SeoLocale): SeoText {
  return generate(subject, null, locale);
}

/** One variant's title, description and keywords, built around its localized option values. */
export function generateVariantSeo(subject: SeoSubject, variant: SeoVariantSubject, locale: SeoLocale): SeoText {
  return generate(subject, variant, locale);
}

const ACCESSORY_TOKENS = new Set([
  "accessory", "accessories", "band", "bands", "strap", "straps", "bracelet", "bracelets",
  "charger", "chargers", "charging", "cable", "cables", "mount", "mounts", "case", "cases", "cradle", "cradles",
  "adapter", "adapters", "sensor", "sensors", "protector", "protectors", "clip", "clips",
]);

/** "accessory" when any category name or slug in the path names an accessory group; otherwise "device". */
export function seoKind(categoryPath: readonly string[]): "device" | "accessory" {
  for (const segment of categoryPath) {
    const text = fold(segment).replace(/smart[\s-]+band/g, "smartband");
    if (/heart[\s-]+rate[\s-]+monitor/.test(text)) return "accessory";
    if (/аксессуар|ремеш|ремни|заряд|кабел|креплен|чехол|білезік|бауы|баулар/.test(text)) return "accessory";
    if (text.split(/[^a-z0-9]+/).some((token) => ACCESSORY_TOKENS.has(token))) return "accessory";
  }
  return "device";
}
