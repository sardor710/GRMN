"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { lineKeyOf, useCart } from "@/lib/cart";
import { CartIcon } from "@/components/icons";
import { formatMoney } from "@/i18n/format";
import { useAppLocale } from "@/i18n/useAppLocale";

export function CartView() {
  const t = useTranslations("Cart");
  const locale = useAppLocale();
  const money = (n: number) => formatMoney(n, locale);
  const { items, subtotal, setQty, remove, clear } = useCart();
  const [placed, setPlaced] = useState(false);

  const shipping = subtotal > 0 ? 0 : 0;
  const tax = +(subtotal * 0.0725).toFixed(2);
  const total = subtotal + shipping + tax;

  if (placed) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
        <h1 className="g-heading text-[30px] text-black">{t("thankYou")}</h1>
        <p className="mt-3 text-neutral-600">
          {t("demoNotice")}
        </p>
        <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-8">
          {t("continueShoppingButton")}
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
        <CartIcon className="mx-auto h-12 w-12 text-neutral-300" />
        <h1 className="g-heading mt-4 text-[28px] text-black">{t("emptyHeading")}</h1>
        <p className="mt-2 text-neutral-600">{t("emptyBody")}</p>
        <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-8">
          {t("shopSmartwatches")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="g-heading text-[32px] text-black">{t("heading")}</h1>
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        {/* Line items */}
        <div>
          <div className="hidden grid-cols-[1fr_120px_120px] border-b border-neutral-200 pb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-neutral-500 sm:grid">
            <span>{t("item")}</span>
            <span className="text-center">{t("quantity")}</span>
            <span className="text-right">{t("price")}</span>
          </div>
          <ul className="divide-y divide-neutral-200">
            {items.map((item) => (
              <li key={lineKeyOf(item)} className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-[1fr_120px_120px] sm:items-center">
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 shrink-0 border border-neutral-200">
                    {item.image ? (
                      <Image src={item.image} alt={item.name} fill sizes="80px" className="object-contain p-1" />
                    ) : (
                      <div className="grid h-full place-items-center text-neutral-300">
                        <CartIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div>
                    <Link
                      href={item.sku ? `/p/${item.id}?sku=${encodeURIComponent(item.sku)}` : `/p/${item.id}`}
                      className="g-heading text-[17px] text-black hover:text-[#007cc3]"
                    >
                      {item.name}
                    </Link>
                    {item.sku && (
                      <p className="mt-0.5 text-[12px] text-neutral-600">
                        {item.variantLabel && <span>{item.variantLabel} · </span>}
                        <span className="uppercase tracking-[0.04em]">{t("part", { sku: item.sku })}</span>
                      </p>
                    )}
                    <button
                      onClick={() => remove(lineKeyOf(item))}
                      className="mt-1 block text-[12px] text-[#007cc3] underline"
                    >
                      {t("remove")}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="flex items-center border border-neutral-300">
                    <button
                      aria-label={t("decrease")}
                      onClick={() => setQty(lineKeyOf(item), item.qty - 1)}
                      className="grid h-9 w-9 place-items-center text-lg text-neutral-600 hover:bg-neutral-100"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-[15px]">{item.qty}</span>
                    <button
                      aria-label={t("increase")}
                      onClick={() => setQty(lineKeyOf(item), item.qty + 1)}
                      className="grid h-9 w-9 place-items-center text-lg text-neutral-600 hover:bg-neutral-100"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-right text-[15px] font-medium text-black">
                  {money(item.price * item.qty)}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between">
            <Link href="/c/wearables-smartwatches" className="text-[14px] text-[#007cc3] underline">
              {t("continueShopping")}
            </Link>
            <button onClick={clear} className="text-[14px] text-neutral-500 underline hover:text-black">
              {t("clear")}
            </button>
          </div>
        </div>

        {/* Summary */}
        <aside className="h-fit border border-neutral-200 p-6">
          <h2 className="g-heading text-[20px] text-black">{t("summary")}</h2>
          <dl className="mt-4 space-y-3 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t("subtotal")}</dt>
              <dd className="text-black">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t("shipping")}</dt>
              <dd className="text-black">{shipping === 0 ? t("free") : money(shipping)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t("tax")}</dt>
              <dd className="text-black">{money(tax)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-between border-t border-neutral-200 pt-4 text-[18px] font-medium">
            <span>{t("total")}</span>
            <span>{money(total)}</span>
          </div>
          <button
            onClick={() => { setPlaced(true); clear(); }}
            className="g-btn g-btn--solid mt-6 w-full"
          >
            {t("checkout")}
          </button>
          <p className="mt-3 text-center text-[12px] text-neutral-400">
            {t("freeShippingNote")}
          </p>
        </aside>
      </div>
    </div>
  );
}
