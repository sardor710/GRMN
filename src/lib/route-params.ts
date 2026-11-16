/** Next.js can hand non-ASCII dynamic segments to pages still percent-encoded; stored slugs are decoded text. */
export function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
