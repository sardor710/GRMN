import { serializeJsonLd as serialize } from "../i18n/seo-core.js";

/** Serialize structured data safely inside an HTML script element (`<`, `>`, `&`, U+2028/2029 escaped). */
export function serializeJsonLd(value: unknown): string {
  return serialize(value);
}
