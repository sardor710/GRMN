// Owner 2026-11-23: Google Merchant Center feed per storefront language — /feeds/google/en.xml, ru.xml, kz.xml.
// One <item> per active variant of each indexable published product (PostgreSQL catalog; legacy CMS → empty feed).
import { SITE_URL } from "@/i18n/seo";
import { buildMerchantFeed, merchantItemsFor, type FeedLocale, type MerchantItem } from "@/lib/seo/merchant-feed";
import { cmsBackend } from "@/server/cms/source";

export const dynamic = "force-dynamic";

const FILES: Readonly<Record<string, FeedLocale>> = { "en.xml": "en", "ru.xml": "ru", "kz.xml": "kk" };
const TITLES: Readonly<Record<FeedLocale, string>> = { en: "Garmin Kazakhstan", ru: "Garmin Казахстан", kk: "Garmin Қазақстан" };

async function loadItems(locale: FeedLocale): Promise<MerchantItem[]> {
  if (cmsBackend() !== "postgres") return [];
  const { getCatalogService } = await import("@/server/catalog/runtime");
  const catalog = getCatalogService();
  const items: MerchantItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await catalog.listProducts({ market: "default", locale: "en", displayCurrency: "KZT" }, { limit: 100, cursor });
    for (const card of page.items.filter((p) => !p.noIndex)) {
      const detail = await catalog.getProductByCode(card.productCode, "default", "KZT", locale);
      if (detail) items.push(...merchantItemsFor(detail, locale, SITE_URL));
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const locale = Object.hasOwn(FILES, file) ? FILES[file] : undefined;
  if (!locale) return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const xml = buildMerchantFeed(await loadItems(locale), { locale, siteUrl: SITE_URL, title: TITLES[locale] });
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
