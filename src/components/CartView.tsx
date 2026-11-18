"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { lineKeyOf, useCart } from "@/lib/cart";
import { formatKzt } from "@/lib/account-client";
import { CartIcon } from "@/components/icons";
import { CheckoutPanel, OrderReceived, resumeCheckout } from "@/components/CheckoutPanel";
import type { PlacedOrder } from "@/lib/checkout-client";
import type { CartDTO } from "@/contracts/commerce";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function emptyCart() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      <CartIcon className="mx-auto h-12 w-12 text-neutral-300" />
      <h1 className="g-heading mt-4 text-[28px] text-black">Your cart is empty</h1>
      <p className="mt-2 text-neutral-600">Looks like you haven&apos;t added anything yet.</p>
      <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-8">
        Shop Smartwatches
      </Link>
    </div>
  );
}

// Task 13A server cart: every amount is the server's KZT value; nothing is computed or trusted here.
// Checkout is the server checkout panel (Task 14A); notices must be resolved first.
function serverCart(cart: CartDTO, actions: { busy: boolean; error: string | null; setQty: (id: string, qty: number) => unknown; remove: (id: string) => unknown; clear: () => unknown; acknowledge: () => unknown; placeOrder: (order: PlacedOrder) => unknown }) {
  const { busy, error, setQty, remove, clear, acknowledge, placeOrder } = actions;
  if (cart.lines.length === 0) return emptyCart();
  const priceChanged = cart.notices.some(n => n.code === "price_changed");
  const adjusted = cart.notices.some(n => n.code === "quantity_adjusted");
  const unavailable = cart.lines.some(line => line.availability === "unavailable");
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="g-heading text-[32px] text-black">Shopping Cart</h1>
      {error && <p role="alert" className="mt-4 border border-red-200 bg-red-50 p-3 text-[14px] text-red-800">{error}</p>}
      {priceChanged && (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-amber-300 bg-amber-50 p-3 text-[14px] text-amber-900">
          <span>The price of an item in your cart has changed since you added it.</span>
          <button type="button" disabled={busy} onClick={() => acknowledge()} className="text-[13px] font-semibold underline disabled:opacity-50">Accept new prices</button>
        </div>
      )}
      {adjusted && <p role="status" className="mt-4 border border-amber-300 bg-amber-50 p-3 text-[14px] text-amber-900">Some quantities were adjusted to the per-item limit.</p>}
      {unavailable && <p role="status" className="mt-4 border border-neutral-300 bg-neutral-50 p-3 text-[14px] text-neutral-700">Some items are no longer available and are not included in the subtotal.</p>}
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="hidden grid-cols-[1fr_120px_140px] border-b border-neutral-200 pb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-neutral-500 sm:grid">
            <span>Item</span>
            <span className="text-center">Quantity</span>
            <span className="text-right">Price</span>
          </div>
          <ul className="divide-y divide-neutral-200">
            {cart.lines.map((line) => {
              const sold = line.availability === "available";
              return (
                <li key={line.variantId} className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-[1fr_120px_140px] sm:items-center">
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 shrink-0 border border-neutral-200">
                      {line.image ? (
                        <Image src={line.image} alt={line.name} fill sizes="80px" className="object-contain p-1" />
                      ) : (
                        <div className="grid h-full place-items-center text-neutral-300"><CartIcon className="h-6 w-6" /></div>
                      )}
                    </div>
                    <div>
                      {line.productKey ? (
                        <Link href={`/p/${encodeURIComponent(line.productKey)}`} className="g-heading text-[17px] text-black hover:text-[#007cc3]">{line.name}</Link>
                      ) : <span className="g-heading text-[17px] text-black">{line.name}</span>}
                      {line.variantName && <p className="text-[12px] text-neutral-500">{line.variantName}</p>}
                      {line.availability === "unavailable" && <p className="text-[12px] font-semibold text-red-700">This item is no longer available</p>}
                      {line.availability === "out_of_stock" && <p className="text-[12px] font-semibold text-amber-800">Out of stock</p>}
                      <button type="button" disabled={busy} onClick={() => remove(line.variantId)} className="mt-1 block text-[12px] text-[#007cc3] underline disabled:opacity-50">Remove</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="flex items-center border border-neutral-300">
                      <button type="button" aria-label="Decrease" data-variant={line.variantId} disabled={busy} onClick={() => setQty(line.variantId, line.quantity - 1)} className="grid h-9 w-9 place-items-center text-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-40">−</button>
                      <span className="w-8 text-center text-[15px]">{line.quantity}</span>
                      <button type="button" aria-label="Increase" data-variant={line.variantId} disabled={busy || !sold || line.quantity >= 99} onClick={() => setQty(line.variantId, line.quantity + 1)} className="grid h-9 w-9 place-items-center text-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-40">+</button>
                    </div>
                  </div>
                  <div className="text-right text-[15px]">
                    <p className="font-medium text-black">{formatKzt(line.lineTotal)}</p>
                    {line.previousUnitPrice && <p className="text-[12px] text-neutral-500">Was <span className="line-through">{formatKzt(line.previousUnitPrice)}</span> each</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-between">
            <Link href="/c/wearables-smartwatches" className="text-[14px] text-[#007cc3] underline">← Continue shopping</Link>
            <button type="button" disabled={busy} onClick={() => clear()} className="text-[14px] text-neutral-500 underline hover:text-black disabled:opacity-50">Clear cart</button>
          </div>
        </div>
        <CheckoutPanel cart={cart} disabled={busy || unavailable || priceChanged} onPlaced={placeOrder} />
      </div>
    </div>
  );
}

export function CartView() {
  const { mode, server, error, busy, items, subtotal, setQty, remove, clear, acknowledge, refresh } = useCart();
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  // A checkout whose response was lost (reload, network drop) is resent with its key on load (review I1).
  useEffect(() => {
    if (mode !== "server") return;
    let live = true;
    void resumeCheckout().then(order => { if (live && order) { setPlaced(order); void refresh(); } }).catch(() => { /* kept for the next load */ });
    return () => { live = false; };
  }, [mode, refresh]);

  if (mode === "loading") return <div className="mx-auto max-w-[640px] px-4 py-24 text-center text-neutral-500">Loading your cart…</div>;
  if (mode === "server" && placed) return <OrderReceived order={placed} />;
  if (mode === "server" && !server && error) return <div className="mx-auto max-w-[640px] px-4 py-24 text-center"><p role="alert" className="border border-red-200 bg-red-50 p-3 text-[14px] text-red-800">Your cart could not be loaded: {error}</p></div>;
  // The server converted the cart when it placed the order; re-read it rather than clearing it here.
  const placeOrder = (order: PlacedOrder) => { setPlaced(order); void refresh(); };
  if (mode === "server") return server ? serverCart(server, { busy, error, setQty, remove, clear, acknowledge, placeOrder }) : emptyCart();

  if (items.length === 0) return emptyCart();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="g-heading text-[32px] text-black">Shopping Cart</h1>
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        {/* Line items */}
        <div>
          <div className="hidden grid-cols-[1fr_120px_120px] border-b border-neutral-200 pb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-neutral-500 sm:grid">
            <span>Item</span>
            <span className="text-center">Quantity</span>
            <span className="text-right">Price</span>
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
                        <span className="uppercase tracking-[0.04em]">Part {item.sku}</span>
                      </p>
                    )}
                    <button
                      onClick={() => remove(lineKeyOf(item))}
                      className="mt-1 block text-[12px] text-[#007cc3] underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="flex items-center border border-neutral-300">
                    <button
                      aria-label="Decrease"
                      onClick={() => setQty(lineKeyOf(item), item.qty - 1)}
                      className="grid h-9 w-9 place-items-center text-lg text-neutral-600 hover:bg-neutral-100"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-[15px]">{item.qty}</span>
                    <button
                      aria-label="Increase"
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
              ← Continue shopping
            </Link>
            <button onClick={clear} className="text-[14px] text-neutral-500 underline hover:text-black">
              Clear cart
            </button>
          </div>
        </div>

        {/* Summary */}
        <aside className="h-fit border border-neutral-200 p-6">
          <h2 className="g-heading text-[20px] text-black">Order Summary</h2>
          <dl className="mt-4 space-y-3 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-neutral-600">Subtotal</dt>
              <dd className="text-black">{money(subtotal)}</dd>
            </div>
          </dl>
          {/* Task 14A: the browser-only cart cannot place orders (the fake "order placed" screen,
              its invented tax and its cart clearing are removed). Checkout needs the server cart. */}
          <button type="button" disabled className="g-btn g-btn--solid mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50">
            Checkout
          </button>
          <p className="mt-3 text-center text-[12px] text-neutral-500">
            Online checkout is not available yet. Your cart is saved in this browser.
          </p>
        </aside>
      </div>
    </div>
  );
}
