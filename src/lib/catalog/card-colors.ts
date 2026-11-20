// Task C-d: the colour dots of a catalogue card (garmin.com `g-color-swatches`, ProductCard.spec.md). They come only
// from real data: the product's colour option, each value with its own swatch photo, or a hex colour staff picked in
// the editor (`swatchColorSource: "editor"`). A hex the importer guessed from the colour's name ("name") or one of
// unknown origin (older records carry no source) is not real swatch data and is ignored. When any colour on sale
// lacks a real swatch, the card shows no dots at all (a partial row would misstate the colours on offer).

/** One dot: the colour's name and its swatch photo or hex colour (the photo wins when both exist). */
export interface CardColor {
  label: string;
  image?: string;
  hex?: string;
}

/**
 * garmin.com's PLP cards show up to nine dots (the most captured at 1440 and 390, docs/research/www.garmin.com/plp)
 * and no "+N" overflow, so a card never shows more than nine.
 */
export const CARD_COLOR_MAX = 9;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOUR_NAME = /colou?r|цвет|түс/i;

type Row = Record<string, unknown>;
const record = (value: unknown): Row => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Swatch photos the store may show: its own paths (/images, /uploads, /media) or a garmin.com product image. */
export function swatchImage(value: unknown): string | undefined {
  const url = text(value);
  if (!url || url.length > 2048 || /[\u0000- \\]/.test(url)) return undefined;
  if (/^\/(images|uploads|media)\//.test(url) && !url.split("/").includes("..")) return url;
  if (/^https:\/\/res\.garmin\.com\/[^?#]+$/.test(url)) return url;
  return undefined;
}

/** The values of a variant's options that are on sale, per option (the caller decides what "on sale" means). */
export type ColourInUse = (option: { id: string; key: string; name: string }, value: { id: string; label: string }) => boolean;

/**
 * The card's dots from an editor option list (CMS product `options`, or PostgreSQL `legacy_content.options`).
 *
 * The colour option is the first one named like a colour (Color/Colour/Цвет/Түс), else the first shown as swatches.
 * Only values `inUse` (chosen by a variant on sale) count. At least two such colours, each with a swatch photo or an
 * editor-picked hex colour, give dots (at most CARD_COLOR_MAX); anything less gives none.
 */
export function cardColors(options: unknown, inUse: ColourInUse): CardColor[] {
  if (!Array.isArray(options)) return [];
  const list = options.map(record);
  const option = list.find((o) => COLOUR_NAME.test(text(o.name)) || COLOUR_NAME.test(text(o.key))) ?? list.find((o) => o.display === "swatch");
  if (!option || !Array.isArray(option.values)) return [];
  const ref = { id: text(option.id), key: text(option.key), name: text(option.name) };
  const seen = new Set<string>();
  const colours: CardColor[] = [];
  for (const raw of option.values.map(record)) {
    const label = text(raw.label);
    if (!label || seen.has(label.toLowerCase()) || !inUse(ref, { id: text(raw.id), label })) continue;
    seen.add(label.toLowerCase());
    const image = swatchImage(raw.swatchImage);
    const hex = raw.swatchColorSource === "editor" && HEX.test(text(raw.swatchColor)) ? text(raw.swatchColor).toLowerCase() : undefined;
    if (!image && !hex) return [];
    colours.push(image ? { label, image } : { label, hex });
  }
  return colours.length >= 2 ? colours.slice(0, CARD_COLOR_MAX) : [];
}
