function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Flattens a nested catalog into `{ 'A.b.c': 'message' }`. */
function flatten(messages, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(messages ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const PLURAL_TYPES = new Set(['plural', 'selectordinal']);
const BRANCH_TYPES = new Set(['plural', 'selectordinal', 'select']);

/**
 * Minimal ICU MessageFormat scan: collects argument names and, for every plural argument,
 * the set of categories it defines. Rich-text tags (`<b>…</b>`) are plain text here.
 * Returns null when the braces are unbalanced.
 */
export function scanMessage(message) {
  const args = new Set();
  const plurals = [];
  let i = 0;

  const skipWs = () => {
    while (i < message.length && /\s/.test(message[i])) i += 1;
  };
  const readUntil = (stops) => {
    const start = i;
    while (i < message.length && !stops.includes(message[i])) i += 1;
    return message.slice(start, i).trim();
  };

  // Parses text up to the `}` that closes the current sub-message (or the end at depth 0).
  function parseText(nested) {
    while (i < message.length) {
      const ch = message[i];
      if (ch === '{') {
        i += 1;
        if (!parseArgument()) return false;
      } else if (ch === '}') {
        if (!nested) return false;
        i += 1;
        return true;
      } else {
        i += 1;
      }
    }
    return !nested;
  }

  function parseArgument() {
    const name = readUntil([',', '}']);
    if (!name || i >= message.length) return false;
    args.add(name);
    if (message[i] === '}') {
      i += 1;
      return true;
    }
    i += 1; // ','
    const type = readUntil([',', '}']);
    if (i >= message.length) return false;
    if (message[i] === '}') {
      i += 1;
      return true;
    }
    i += 1; // ','
    if (!BRANCH_TYPES.has(type)) {
      // Style argument such as `{n, number, ::currency/USD}`: skip to the matching brace.
      let depth = 1;
      while (i < message.length && depth > 0) {
        if (message[i] === '{') depth += 1;
        else if (message[i] === '}') depth -= 1;
        i += 1;
      }
      return depth === 0;
    }
    const categories = [];
    for (;;) {
      skipWs();
      if (i >= message.length) return false;
      if (message[i] === '}') {
        i += 1;
        break;
      }
      const selector = readUntil(['{', '}']).trim();
      if (message[i] !== '{' || !selector) return false;
      i += 1;
      if (!selector.startsWith('offset:')) categories.push(selector.replace(/^offset:\S+\s*/, ''));
      if (!parseText(true)) return false;
    }
    if (PLURAL_TYPES.has(type)) plurals.push({ name, categories });
    return true;
  }

  return parseText(false) ? { args, plurals } : null;
}

function requiredCategories(locale) {
  return new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/**
 * Compares a translated catalog against the English source.
 * - missing: keys in `en` that are absent or blank in `other`
 * - extra: keys in `other` that `en` does not have
 * - badPlural: messages whose placeholders differ from `en`, whose plural arguments lack a
 *   category the locale needs (CLDR: ru one/few/many/other, kk one/other), or that do not parse
 */
export function checkCatalogs(en, other, locale) {
  const source = flatten(en);
  const target = flatten(other);
  const needed = requiredCategories(locale);
  const missing = [];
  const extra = [];
  const badPlural = [];

  for (const [key, value] of Object.entries(source)) {
    const translated = target[key];
    if (typeof translated !== 'string' || translated.trim() === '') {
      missing.push(key);
      continue;
    }
    if (typeof value !== 'string') continue;
    const a = scanMessage(value);
    const b = scanMessage(translated);
    if (!a || !b || !sameSet(a.args, b.args)) {
      badPlural.push(key);
      continue;
    }
    const pluralOk = b.plurals.every((plural) => needed.every((category) => plural.categories.includes(category)));
    if (!pluralOk) badPlural.push(key);
  }
  for (const key of Object.keys(target)) {
    if (!(key in source)) extra.push(key);
  }
  return { missing, extra, badPlural };
}
