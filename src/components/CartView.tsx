"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { lineKeyOf, useCart } from "@/lib/cart";
import { formatKzt } from "@/lib/account-client";
import { CartIcon } from "@/components/icons";
import { CheckoutPanel, OrderReceived, resumeCheckout } from "@/components/CheckoutPanel";
import type { PlacedOrder } from "@/lib/checkout-client";
import type { CartDTO } from "@/contracts/commerce";
import { formatKzt as formatKztAmount, formatUnconverted } from "@/lib/money";
import { INTL_LOCALE } from "@/i18n/config";
import { useAppLocale } from "@/i18n/useAppLocale";

/** Localized display names by product id (and variant titles by sku). Never written back to the cart. */
export type CartCatalog = Record<string, { name: string; variants: Record<string, string> }>;

type Translate = ReturnType<typeof useTranslations>;

function emptyCart(t: Translate) {
  return (
    // CartEmpty.spec.md: the heading and one outline medium button, nothing else.
    <div className="mx-auto max-w-[1200px] p-4 text-center">
      <h1 className="g-heading g-h1 my-4 text-black">{t("emptyHeading")}</h1>
      <div className="my-4">
        <Link href="/c/wearables-smartwatches" className="g-btn g-btn--secondary">
          {t("startShopping")}
        </Link>
      </div>
    </div>
  );
}

// Task 13A server cart: every amount is the server's KZT value; nothing is computed or trusted here.
// Checkout is the server checkout panel (Task 14A); notices must be resolved first.
function serverCart(t: Translate, kzt: (money: Parameters<typeof formatKzt>[0]) => string, cart: CartDTO, actions: { busy: boolean; error: string | null; setQty: (id: string, qty: number) => unknown; remove: (id: string) => unknown; clear: () => unknown; acknowledge: () => unknown; placeOrder: (order: PlacedOrder) => unknown; refresh: () => unknown }) {
  const { busy, error, setQty, remove, clear, acknowledge, placeOrder, refresh } = actions;
  if (cart.lines.length === 0) return emptyCart(t);
  const priceChanged = cart.notices.some(n => n.code === "price_changed");
  const adjusted = cart.notices.some(n => n.code === "quantity_adjusted");
  const unavailable = cart.lines.some(line => line.availability === "unavailable");
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="g-heading g-h1 m-0 text-black">{t("heading")}</h1>
      {error && <p role="alert" className="mt-4 border border-garmin-error p-3 text-[14px] leading-[21px] text-garmin-error">{error}</p>}
      {priceChanged && (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-garmin-control bg-muted p-3 text-[14px] leading-[21px] text-black">
          <span>{t("priceChanged")}</span>
          <button type="button" disabled={busy} onClick={() => acknowledge()} className="g-btn g-btn--sm g-btn--black">{t("acceptPrices")}</button>
        </div>
      )}
      {adjusted && <p role="status" className="mt-4 border border-garmin-control bg-muted p-3 text-[14px] leading-[21px] text-black">{t("quantitiesAdjusted")}</p>}
      {unavailable && <p role="status" className="mt-4 border border-garmin-control bg-muted p-3 text-[14px] leading-[21px] text-black">{t("unavailableNote")}</p>}
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="hidden grid-cols-[1fr_120px_140px] border-b border-garmin-control pb-3 text-[14px] font-bold text-black sm:grid">
            <span>{t("item")}</span>
            <span className="text-center">{t("quantity")}</span>
            <span className="text-right">{t("price")}</span>
          </div>
          <ul className="divide-y divide-garmin-control">
            {cart.lines.map((line) => {
              const sold = line.availability === "available";
              return (
                <li key={line.variantId} className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-[1fr_120px_140px] sm:items-center">
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 shrink-0">
                      {line.image ? (
                        <Image src={line.image} alt={line.name} fill sizes="80px" className="object-contain mix-blend-multiply" />
                      ) : (
                        <div className="grid h-full place-items-center bg-muted text-garmin-text-muted"><CartIcon className="h-6 w-6" /></div>
                      )}
                    </div>
                    <div>
                      {line.productKey ? (
                        <Link href={`/p/${encodeURIComponent(line.productKey)}`} className="g-heading g-h4 text-black hover:underline">{line.name}</Link>
                      ) : <span className="g-heading g-h4 text-black">{line.name}</span>}
                      {line.variantName && <p className="text-[14px] leading-[21px] text-black">{line.variantName}</p>}
                      {line.availability === "unavailable" && <p className="text-[14px] leading-[21px] text-garmin-error">{t("lineUnavailable")}</p>}
                      {line.availability === "out_of_stock" && <p className="text-[14px] leading-[21px] text-garmin-error">{t("outOfStock")}</p>}
                      <button type="button" disabled={busy} onClick={() => remove(line.variantId)} className="mt-1 block text-[14px] text-garmin-blue underline hover:text-garmin-blue-hover disabled:opacity-50">{t("remove")}</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="flex items-center border border-black">
                      <button type="button" aria-label={t("decrease")} data-variant={line.variantId} disabled={busy} onClick={() => setQty(line.variantId, line.quantity - 1)} className="grid h-9 w-9 place-items-center text-lg text-black hover:bg-muted disabled:opacity-40">−</button>
                      <span className="w-8 text-center text-[16px]">{line.quantity}</span>
                      <button type="button" aria-label={t("increase")} data-variant={line.variantId} disabled={busy || !sold || line.quantity >= 99} onClick={() => setQty(line.variantId, line.quantity + 1)} className="grid h-9 w-9 place-items-center text-lg text-black hover:bg-muted disabled:opacity-40">+</button>
                    </div>
                  </div>
                  <div className="text-right text-[16px] leading-[24px]">
                    <p className="font-bold text-black">{kzt(line.lineTotal)}</p>
                    {line.previousUnitPrice && <p className="text-[14px] leading-[21px] text-black">{t.rich("wasEach", { price: kzt(line.previousUnitPrice), old: (chunks) => <span className="line-through">{chunks}</span> })}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-between">
            <Link href="/c/wearables-smartwatches" className="text-[14px] text-garmin-blue underline hover:text-garmin-blue-hover">{t("continueShopping")}</Link>
            <button type="button" disabled={busy} onClick={() => clear()} className="text-[14px] text-black underline disabled:opacity-50">{t("clear")}</button>
          </div>
        </div>
        <CheckoutPanel cart={cart} disabled={busy || unavailable || priceChanged} onPlaced={placeOrder} onCartStale={refresh} />
      </div>
    </div>
  );
}

export function CartView({ catalog = {} }: { catalog?: CartCatalog }) {
  const t = useTranslations("Cart");
  const locale = useAppLocale();
  // Task 5a.2: the browser-only cart shows its stored amounts in tenge too (never USD).
  // Prices were converted to tenge when the products were read (src/lib/legacy-prices.ts); a line added while no
  // KZT-per-USD rate was set is "unconverted" and is shown without a currency sign, as is a subtotal that includes one.
  const money = (n: number, unconverted = false) => (unconverted ? formatUnconverted : formatKztAmount)({ major: n }, locale);
  const kzt = (value: Parameters<typeof formatKzt>[0]) => formatKzt(value, INTL_LOCALE[locale]);
  const { mode, server, error, busy, items, subtotal, setQty, remove, clear, acknowledge, refresh } = useCart();
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  // A checkout whose response was lost (reload, network drop) is resent with its key on load (review I1).
  useEffect(() => {
    if (mode !== "server") return;
    let live = true;
    void resumeCheckout().then(order => { if (live && order) { setPlaced(order); void refresh(); } }).catch(() => { /* kept for the next load */ });
    return () => { live = false; };
  }, [mode, refresh]);

  if (mode === "loading") return <div className="mx-auto max-w-[640px] px-4 py-24 text-center text-black">{t("loading")}</div>;
  if (mode === "server" && placed) return <OrderReceived order={placed} />;
  if (mode === "server" && !server && error) return <div className="mx-auto max-w-[640px] px-4 py-24 text-center"><p role="alert" className="border border-garmin-error p-3 text-[14px] leading-[21px] text-garmin-error">{t("loadFailed", { error })}</p></div>;
  // The server converted the cart when it placed the order; re-read it rather than clearing it here.
  const placeOrder = (order: PlacedOrder) => { setPlaced(order); void refresh(); };
  if (mode === "server") return server ? serverCart(t, kzt, server, { busy, error, setQty, remove, clear, acknowledge, placeOrder, refresh }) : emptyCart(t);

  if (items.length === 0) return emptyCart(t);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="g-heading g-h1 m-0 text-black">{t("heading")}</h1>
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        {/* Line items */}
        <div>
          <div className="hidden grid-cols-[1fr_120px_120px] border-b border-garmin-control pb-3 text-[14px] font-bold text-black sm:grid">
            <span>{t("item")}</span>
            <span className="text-center">{t("quantity")}</span>
            <span className="text-right">{t("price")}</span>
          </div>
          <ul className="divide-y divide-garmin-control">
            {items.map((item) => (
              <li key={lineKeyOf(item)} className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-[1fr_120px_120px] sm:items-center">
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 shrink-0">
                    {item.image ? (
                      <Image src={item.image} alt={catalog[item.id]?.name ?? item.name} fill sizes="80px" className="object-contain mix-blend-multiply" />
                    ) : (
                      <div className="grid h-full place-items-center bg-muted text-garmin-text-muted">
                        <CartIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div>
                    <Link
                      href={item.sku ? `/p/${item.id}?sku=${encodeURIComponent(item.sku)}` : `/p/${item.id}`}
                      className="g-heading g-h4 text-black hover:underline"
                    >
                      {catalog[item.id]?.name ?? item.name}
                    </Link>
                    {item.sku && (
                      <p className="mt-0.5 text-[14px] leading-[21px] text-black">
                        {item.variantLabel && <span>{(item.sku && catalog[item.id]?.variants[item.sku]) || item.variantLabel} · </span>}
                        <span>{t("part", { sku: item.sku })}</span>
                      </p>
                    )}
                    <button
                      onClick={() => remove(lineKeyOf(item))}
                      className="mt-1 block text-[14px] text-garmin-blue underline hover:text-garmin-blue-hover"
                    >
                      {t("remove")}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="flex items-center border border-black">
                    <button
                      aria-label={t("decrease")}
                      onClick={() => setQty(lineKeyOf(item), item.qty - 1)}
                      className="grid h-9 w-9 place-items-center text-lg text-black hover:bg-muted"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-[16px]">{item.qty}</span>
                    <button
                      aria-label={t("increase")}
                      onClick={() => setQty(lineKeyOf(item), item.qty + 1)}
                      className="grid h-9 w-9 place-items-center text-lg text-black hover:bg-muted"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-right text-[16px] font-bold leading-[24px] text-black">
                  {money(item.price * item.qty, item.unconverted)}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between">
            <Link href="/c/wearables-smartwatches" className="text-[14px] text-garmin-blue underline hover:text-garmin-blue-hover">
              {t("continueShopping")}
            </Link>
            <button onClick={clear} className="text-[14px] text-black underline">
              {t("clear")}
            </button>
          </div>
        </div>

        {/* Summary */}
        <aside className="h-fit border border-garmin-control p-6">
          <h2 className="g-heading g-h4 m-0 text-black">{t("summary")}</h2>
          <dl className="mt-4 space-y-3 text-[16px] leading-[24px]">
            <div className="flex justify-between">
              <dt className="font-medium text-black">{t("subtotal")}</dt>
              <dd className="text-black">{money(subtotal, items.some((item) => item.unconverted))}</dd>
            </div>
          </dl>
          {/* Task 14A: the browser-only cart cannot place orders (the fake "order placed" screen,
              its invented tax and its cart clearing are removed). Checkout needs the server cart. */}
          <button type="button" disabled className="g-btn g-btn--lg g-btn--black mt-6 w-full">
            {t("checkout")}
          </button>
          <p className="mt-3 text-center text-[14px] leading-[21px] text-black">
            {t("checkoutUnavailable")}
          </p>
        </aside>
      </div>
    </div>
  );
}
