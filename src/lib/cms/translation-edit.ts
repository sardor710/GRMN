// Immutable get/set of one string inside a `translations[locale]` overlay, for the admin editors.
// Paths mirror the overlay shape: ["name"], ["specs", 3, "label"], ["optionNames", "opt-a"],
// ["carousels", "carousel-1", "items", "prod-1", "badge"]. Numeric segments create arrays.

export type OverlayLocale = "ru" | "kk";
export type OverlayPath = readonly (string | number)[];

type Container = Record<string | number, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return value !== null && typeof value === "object";
}

export function getOverlayString(translations: unknown, locale: OverlayLocale, path: OverlayPath): string {
  let node: unknown = isContainer(translations) ? (translations as Record<string, unknown>)[locale] : undefined;
  for (const key of path) {
    if (!isContainer(node)) return "";
    node = (node as Record<string | number, unknown>)[key];
  }
  return typeof node === "string" ? node : "";
}

function setIn(node: unknown, path: OverlayPath, value: string): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const nextIsIndex = typeof head === "number";
  let copy: Container;
  if (Array.isArray(node)) copy = [...node];
  else if (isContainer(node)) copy = { ...(node as Record<string, unknown>) };
  else copy = nextIsIndex ? [] : {};
  if (Array.isArray(copy) && typeof head === "number") {
    // fill holes so the overlay keeps index positions when serialized
    const filler = rest.length === 0 ? "" : {};
    while (copy.length < head) copy.push(filler);
    copy[head] = setIn(copy[head], rest, value);
  } else {
    const obj = copy as Record<string | number, unknown>;
    obj[head] = setIn(obj[head], rest, value);
  }
  return copy;
}

/** Returns a new translations object with `value` written at `translations[locale][...path]`. */
export function setOverlayValue<T extends object>(
  translations: T | undefined,
  locale: OverlayLocale,
  path: OverlayPath,
  value: string,
): T {
  const root = (translations ?? {}) as Record<string, unknown>;
  return { ...root, [locale]: setIn(root[locale], path, value) } as T;
}
