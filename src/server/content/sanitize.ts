// Task 18A. A small allowlist sanitizer for editor rich text (blog body). It keeps basic formatting
// and safe links and drops everything else: scripts, styles, embedded media and frames with their
// content, every attribute except a safe `href`, event handlers, comments and unsafe URLs.
// Text outside tags is kept; a stray `<` is escaped. Tags are balanced (review I1): a close tag with
// no matching open tag is dropped, anything left open is closed at the end, and links never nest.
// Every scan stops at the next `<` or `>`, so the work stays linear in the input (review I2).

const ALLOWED = new Set(["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "a", "h2", "h3", "h4", "blockquote", "code", "pre"]);
const VOID = new Set(["br"]);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math|textarea|select)\b[\s\S]*?(<\/\1\s*>|$)/gi;
const SAFE_HREF = /^(https?:\/\/[^\s"'<>\\]+|\/(?![/\\])[^\s"'<>\\]*|#[^\s"'<>\\]*|mailto:[^\s"'<>\\]+)$/i;

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attributes);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}
const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export function sanitizeRichText(input: string): string {
  const cleaned = input.replace(/<!--[\s\S]*?(-->|$)/g, "").replace(DROP_WITH_CONTENT, "");
  const open: string[] = [];
  let out = "";
  for (const token of cleaned.match(/<\/?[A-Za-z][^<>]*>|<|>|[^<>]+/g) ?? []) {
    if (token === "<") { out += "&lt;"; continue; }
    if (token === ">") { out += "&gt;"; continue; }
    if (!token.startsWith("<")) { out += token; continue; }
    const tag = /^<(\/?)([A-Za-z][A-Za-z0-9]*)([^<>]*?)\/?>$/.exec(token);
    if (!tag) continue;
    const [, closing, rawName, attributes] = tag, name = rawName.toLowerCase();
    if (!ALLOWED.has(name)) continue;
    if (VOID.has(name)) { if (!closing) out += `<${name}>`; continue; }
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at < 0) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    if (name === "a") {
      if (open.includes("a")) continue;
      const href = attribute(attributes, "href")?.trim();
      out += href && SAFE_HREF.test(href) ? `<a href="${escapeAttribute(href)}" rel="noopener noreferrer">` : "<a>";
    } else out += `<${name}>`;
    open.push(name);
  }
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** Plain text for fields shown as text (excerpts, meta descriptions): every tag is removed. */
export function plainText(input: string): string {
  return input.replace(/<!--[\s\S]*?(-->|$)/g, "").replace(DROP_WITH_CONTENT, "").replace(/<\/?[A-Za-z][^<>]*>/g, "").replace(/\s+/g, " ").trim();
}
