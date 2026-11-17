// Extract the `var GarminAppBootstrap = {...}` object embedded in garmin.com product pages.

export class GarminParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GarminParseError';
  }
}

const MARKER = 'var GarminAppBootstrap = ';

/** Brace-match the object literal after the marker, respecting JSON strings and escapes. */
export function extractBootstrap(html) {
  const at = String(html).indexOf(MARKER);
  if (at < 0) throw new GarminParseError('This page has no Garmin product data (GarminAppBootstrap not found).');
  const start = html.indexOf('{', at + MARKER.length);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch (err) {
          throw new GarminParseError(`Garmin product data is not valid JSON: ${err.message}`);
        }
      }
    }
  }
  throw new GarminParseError('Garmin product data is truncated.');
}

/** JSON-LD Product block (name, image, offers) when present. */
export function extractJsonLdProduct(html) {
  for (const m of String(html).matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      if (data && data['@type'] === 'Product') return data;
    } catch {
      /* ignore malformed blocks */
    }
  }
  return undefined;
}
