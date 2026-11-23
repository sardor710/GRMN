// Task 5.1: Google tag ids and site-verification tokens from Admin ▸ Settings ▸ Google & analytics.
// Stored in store_settings.presentation_config.analytics (no migration). Pure: used by the settings service
// (write side, field errors), the storefront reader (read side, invalid values dropped) and the admin form.

export interface AnalyticsConfig {
  /** GA4 measurement id, e.g. G-ABC123XYZ. */
  ga4Id?: string;
  /** Google Tag Manager container id, e.g. GTM-ABC1234. When set, GA4 is configured inside GTM. */
  gtmId?: string;
  /** Google Search Console HTML-tag verification token (the `content` of google-site-verification). */
  googleVerification?: string;
  /** Yandex Webmaster meta-tag verification token (the `content` of yandex-verification). */
  yandexVerification?: string;
}

export type AnalyticsField = keyof AnalyticsConfig;
export type AnalyticsErrors = Partial<Record<AnalyticsField, string>>;

export const ANALYTICS_FIELDS: readonly AnalyticsField[] = ["ga4Id", "gtmId", "googleVerification", "yandexVerification"];

const VERIFICATION = /^[A-Za-z0-9_-]{10,100}$/;
const RULES: Record<AnalyticsField, { pattern: RegExp; upper: boolean; message: string }> = {
  ga4Id: { pattern: /^G-[A-Z0-9]{4,12}$/, upper: true, message: "Enter a GA4 measurement id like G-ABC123XYZ (Universal Analytics UA- ids are not supported)" },
  gtmId: { pattern: /^GTM-[A-Z0-9]{4,10}$/, upper: true, message: "Enter a Tag Manager container id like GTM-ABC1234" },
  googleVerification: { pattern: VERIFICATION, upper: false, message: "Paste only the content value of the google-site-verification tag (10–100 letters, digits, - or _)" },
  yandexVerification: { pattern: VERIFICATION, upper: false, message: "Paste only the content value of the yandex-verification tag (10–100 letters, digits, - or _)" },
};

type Checked = { kind: "unset" } | { kind: "ok"; value: string } | { kind: "invalid" };
function check(field: AnalyticsField, raw: unknown): Checked {
  if (raw === undefined || raw === null) return { kind: "unset" };
  if (typeof raw !== "string") return { kind: "invalid" };
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "unset" };
  const rule = RULES[field];
  const value = rule.upper ? trimmed.toUpperCase() : trimmed;
  return rule.pattern.test(value) ? { kind: "ok", value } : { kind: "invalid" };
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Read side: the stored config with invalid, blank and unknown fields dropped silently. */
export function parseAnalyticsConfig(value: unknown): AnalyticsConfig {
  const source = record(value), config: AnalyticsConfig = {};
  for (const field of ANALYTICS_FIELDS) {
    const result = check(field, source[field]);
    if (result.kind === "ok") config[field] = result.value;
  }
  return config;
}

/** Write side: the normalized config (trimmed, tag ids uppercased, blank = unset) and a message per invalid field. */
export function validateAnalyticsInput(value: unknown): { config: AnalyticsConfig; errors: AnalyticsErrors } {
  const source = record(value), config: AnalyticsConfig = {}, errors: AnalyticsErrors = {};
  for (const field of ANALYTICS_FIELDS) {
    const result = check(field, source[field]);
    if (result.kind === "ok") config[field] = result.value;
    else if (result.kind === "invalid") errors[field] = RULES[field].message;
  }
  return { config, errors };
}
