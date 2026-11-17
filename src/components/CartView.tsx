"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatKzt } from "@/lib/account-client";
import { CartIcon } from "@/components/icons";
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
// Checkout stays off until Task 14 builds the idempotent checkout.
function serverCart(cart: CartDTO, actions: { busy: boolean; error: string | null; setQty: (id: string, qty: number) => unknown; remove: (id: string) => unknown; clear: () => unknown; acknowledge: () => unknown }) {
  const { busy, error, setQty, remove, clear, acknowledge } = actions;
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
        <aside className="h-fit border border-neutral-200 p-6">
          <h2 className="g-heading text-[20px] text-black">Order Summary</h2>
          <dl className="mt-4 space-y-3 text-[15px]">
            <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd className="text-black">{formatKzt(cart.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Shipping and taxes</dt><dd className="text-neutral-500">Calculated at checkout</dd></div>
          </dl>
          <button type="button" disabled className="g-btn g-btn--solid mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50">Checkout</button>
          <p className="mt-3 text-center text-[12px] text-neutral-500">Online checkout is not available yet. Your cart is saved.</p>
        </aside>
      </div>
    </div>
  );
}

export function CartView() {
  const { mode, server, error, busy, items, subtotal, setQty, remove, clear, acknowledge } = useCart();
  const [placed, setPlaced] = useState(false);

  if (mode === "loading") return <div className="mx-auto max-w-[640px] px-4 py-24 text-center text-neutral-500">Loading your cart…</div>;
  if (mode === "server" && !server && error) return <div className="mx-auto max-w-[640px] px-4 py-24 text-center"><p role="alert" className="border border-red-200 bg-red-50 p-3 text-[14px] text-red-800">Your cart could not be loaded: {error}</p></div>;
  if (mode === "server") return server ? serverCart(server, { busy, error, setQty, remove, clear, acknowledge }) : emptyCart();

  const shipping = subtotal > 0 ? 0 : 0;
  const tax = +(subtotal * 0.0725).toFixed(2);
  const total = subtotal + shipping + tax;

  if (placed) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
        <h1 className="g-heading text-[30px] text-black">Thank you for your order!</h1>
        <p className="mt-3 text-neutral-600">
          This is a demo checkout — no payment was processed. Your cart has been cleared.
        </p>
        <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-8">
          Continue Shopping
        </Link>
      </div>
    );
  }

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
              <li key={item.id} className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-[1fr_120px_120px] sm:items-center">
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
                    <Link href={`/p/${item.id}`} className="g-heading text-[17px] text-black hover:text-[#007cc3]">
                      {item.name}
                    </Link>
                    <button
                      onClick={() => remove(item.id)}
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
                      onClick={() => setQty(item.id, item.qty - 1)}
                      className="grid h-9 w-9 place-items-center text-lg text-neutral-600 hover:bg-neutral-100"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-[15px]">{item.qty}</span>
                    <button
                      aria-label="Increase"
                      onClick={() => setQty(item.id, item.qty + 1)}
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
            <div className="flex justify-between">
              <dt className="text-neutral-600">Shipping</dt>
              <dd className="text-black">{shipping === 0 ? "FREE" : money(shipping)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">Estimated tax</dt>
              <dd className="text-black">{money(tax)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-between border-t border-neutral-200 pt-4 text-[18px] font-medium">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
          <button
            onClick={() => { setPlaced(true); clear(); }}
            className="g-btn g-btn--solid mt-6 w-full"
          >
            Checkout
          </button>
          <p className="mt-3 text-center text-[12px] text-neutral-400">
            Free standard shipping on orders over $25.
          </p>
        </aside>
      </div>
    </div>
  );
}
