import * as js from "./content-input.js";
import type { Banner, CMSBlog, HomepageConfig, StoreSettings } from "./types";

type Result<K extends string, T> = ({ ok: true } & Record<K, T>) | { ok: false; error: string; details?: string[] };

export function sanitizeBlogContent(text: string): string {
  return js.sanitizeBlogContent(text);
}

export function sanitizeBlogInput<T extends Partial<CMSBlog>>(body: T, existing?: CMSBlog): Result<"blog", T> {
  return js.sanitizeBlogInput(body, existing) as Result<"blog", T>;
}

export function sanitizeBannerInput<T extends Partial<Banner>>(body: T, existing?: Banner): Result<"banner", T> {
  return js.sanitizeBannerInput(body, existing) as Result<"banner", T>;
}

export function sanitizeSettingsInput<T extends Partial<StoreSettings>>(
  body: T,
  existing?: StoreSettings,
): Result<"settings", T> {
  return js.sanitizeSettingsInput(body, existing) as Result<"settings", T>;
}

export function sanitizeHomepageInput(body: unknown, existing?: HomepageConfig): Result<"config", HomepageConfig> {
  return js.sanitizeHomepageInput(body, existing) as Result<"config", HomepageConfig>;
}
