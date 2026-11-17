import * as js from "./translation-input.js";
import type { FieldSpec } from "@/i18n/translate-record";
import type { Translations } from "./types";

export type TranslationLocale = "ru" | "kk";
export type TranslationStatus = "complete" | "partial" | "empty";
export type Allowed = FieldSpec | readonly string[];

export const TRANSLATION_LOCALES: readonly TranslationLocale[] = js.TRANSLATION_LOCALES as readonly TranslationLocale[];
export const FIELD_LIMITS: Readonly<Record<string, number>> = js.FIELD_LIMITS;
export const MAX_ROWS: number = js.MAX_ROWS;

export const TranslationInputError: typeof Error = js.TranslationInputError;

/** Max characters for a field (base and translated share it). */
export function fieldLimit(field: string): number {
  return js.fieldLimit(field);
}

export function normalizeTranslations<T = Record<string, unknown>>(
  input: unknown,
  allowed: Allowed,
  options: { html?: Record<string, (value: string) => string> } = {},
): Translations<T> {
  return js.normalizeTranslations(input, allowed, options) as Translations<T>;
}

export function mergeTranslations<T = Record<string, unknown>>(
  existing: unknown,
  incoming: unknown,
  allowed: Allowed,
  options: { html?: Record<string, (value: string) => string> } = {},
): Translations<T> {
  return js.mergeTranslations(existing, incoming, allowed, options) as Translations<T>;
}

export function findBaseLimitViolation(record: unknown, allowed: Allowed): string | null {
  return js.findBaseLimitViolation(record, allowed);
}

export function translationStatus(
  record: { translations?: unknown } | null | undefined,
  locale: TranslationLocale,
  allowed: Allowed,
  requiredFields?: readonly string[],
): TranslationStatus {
  return js.translationStatus(record, locale, allowed, requiredFields) as TranslationStatus;
}
