import * as js from "./garmin-parse.js";
import type { CMSProduct, SpecGroup } from "@/lib/cms/types";
import type { VariantContent } from "@/lib/catalog/variant-content";

export type GarminDraft = Partial<CMSProduct> & Pick<CMSProduct, "name" | "sku" | "price">;

export interface GarminParseResult {
  product: GarminDraft;
  remoteImages: { id: string; url: string; alt: string }[];
  warnings: string[];
  /** Non-default skus whose tabs the page doesn't embed (read from `<productUrl>?sku=<sku>`). */
  variantSkusWithoutTabs: string[];
}

/** One sku's Specs, Overview (sanitized) and In the box. */
export interface GarminTabs {
  specGroups: SpecGroup[];
  overviewHtml: string;
  inTheBox: string[];
}

export function parseGarminTabs(html: string, opts: { sku?: string } = {}): GarminTabs | null {
  return js.parseGarminTabs(html, opts) as GarminTabs | null;
}

export function variantContentOverrides(base: GarminTabs, own: GarminTabs): VariantContent | undefined {
  return js.variantContentOverrides(base, own) as VariantContent | undefined;
}

export const GarminParseError = js.GarminParseError as unknown as new (message: string) => Error;
export const GARMIN_PAGE_HOSTS: string[] = js.GARMIN_PAGE_HOSTS;

export function validateGarminUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  return js.validateGarminUrl(raw) as { ok: true; url: URL } | { ok: false; error: string };
}

export function sanitizeOverviewHtml(html: string): string {
  return js.sanitizeOverviewHtml(html);
}

export function parseSpecsTable(html: string): SpecGroup[] {
  return js.parseSpecsTable(html) as SpecGroup[];
}

export function parseGarminProduct(
  html: string,
  opts: { sourceUrl: string; rateKztPerUsd: number; now?: string },
): GarminParseResult {
  return js.parseGarminProduct(html, opts) as GarminParseResult;
}
