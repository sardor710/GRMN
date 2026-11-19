import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { ProductCard } from "@/components/ProductCard";
import { getProductsByKeys } from "@/lib/products";
import { SectionHeading } from "@/components/SectionHeading";

export async function RelatedProducts({ ids, locale }: { ids: string[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "RelatedProducts" });
  const items = await getProductsByKeys(ids.slice(0, 12), locale);
  if (items.length === 0) return null;

  return (
    <section className="bg-neutral-50 py-14">
      <div className="mx-auto max-w-[1280px] px-4">
        <SectionHeading>{t("heading")}</SectionHeading>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p!.id} product={p!} />
          ))}
        </div>
      </div>
    </section>
  );
}
