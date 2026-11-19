function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges `overlay` messages onto `base` (English). Keys missing from the overlay, or whose
 * value is a blank string, keep the base value, so untranslated strings render in English.
 */
export function mergeMessages(base, overlay) {
  const result = { ...base };
  if (!isPlainObject(overlay)) return result;
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value)) {
      result[key] = mergeMessages(isPlainObject(base[key]) ? base[key] : {}, value);
    } else if (typeof value === 'string') {
      if (value.trim() !== '') result[key] = value;
    } else if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}
