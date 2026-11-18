"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CartDTO, CheckoutQuoteDTO, CheckoutStatusDTO } from "@/contracts/commerce";
import { formatKzt } from "@/lib/account-client";
import {
  beginCheckout, checkoutRecovery, createCheckoutClient, createCheckoutStorage, forgetCheckoutKey, pollOrderStatus, rememberOrder, resumePendingCheckout,
  type PlacedOrder,
} from "@/lib/checkout-client";

// Task 14A checkout. The server prices the quote and places the order; this panel only collects
// the delivery contact (D06: name, phone, address; email optional), shows the server's KZT quote
// and submits it once with an idempotency key kept for retries. Payment is manual (O07): the order
// awaits payment, the receipt shows the KZT total and the staff-edited instructions, and staff
// confirm the payment. The browser never decides that an order is paid.

const session = createCheckoutStorage(() => sessionStorage);
const browserClient = () => createCheckoutClient((url, init) => fetch(url, { ...init, credentials: "same-origin" }));
const useClient = () => useMemo(() => browserClient(), []);

/** On page load: resends a checkout whose response was lost (same key), returning its order if one exists (review I1). */
export function resumeCheckout(): Promise<PlacedOrder | null> { return resumePendingCheckout(browserClient(), session); }
const message = (error: unknown) => error instanceof Error && error.message ? error.message : "Checkout failed";
const input = "mt-1 w-full border border-neutral-300 px-3 py-2 text-[14px]";

type Field = "recipientName" | "phone" | "countryCode" | "city" | "line1" | "email" | "coupon";
const FIELDS: { name: Field; label: string; placeholder?: string; autoComplete: string; optional?: boolean }[] = [
  { name: "recipientName", label: "Full name", autoComplete: "name" },
  { name: "phone", label: "Phone", placeholder: "+77011234567", autoComplete: "tel" },
  { name: "countryCode", label: "Country code", placeholder: "KZ", autoComplete: "country" },
  { name: "city", label: "City", autoComplete: "address-level2" },
  { name: "line1", label: "Address", autoComplete: "address-line1" },
  { name: "email", label: "Email (optional)", autoComplete: "email", optional: true },
  { name: "coupon", label: "Promo code (optional)", autoComplete: "off", optional: true },
];

export function CheckoutPanel({ cart, disabled, onPlaced }: { cart: CartDTO; disabled: boolean; onPlaced: (order: PlacedOrder) => unknown }) {
  const client = useClient();
  const [form, setForm] = useState<Record<Field, string>>({ recipientName: "", phone: "", countryCode: "KZ", city: "", line1: "", email: "", coupon: "" });
  const [quote, setQuote] = useState<CheckoutQuoteDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  // A quote is for one cart revision; any cart change needs a new one.
  const current = quote && quote.cartVersion === cart.version ? quote : null;
  const missing = FIELDS.some(field => !field.optional && !form[field.name].trim());

  async function review() {
    setBusy(true); setError(null); setRetry(false);
    try {
      const coupon = form.coupon.trim();
      setQuote(await client.quote({
        cartVersion: cart.version, displayCurrency: "KZT",
        delivery: { kind: "inline", address: { recipientName: form.recipientName.trim(), phone: form.phone.trim(), countryCode: form.countryCode.trim().toUpperCase(), city: form.city.trim(), line1: form.line1.trim() } },
        ...(coupon ? { couponCode: coupon } : {}),
      }));
    } catch (failure) { setQuote(null); setError(message(failure)); } finally { setBusy(false); }
  }

  async function place() {
    if (!current) return;
    setBusy(true); setError(null);
    const email = form.email.trim();
    try {
      const command = { quoteId: current.id, cartVersion: current.cartVersion, paymentMethod: "manual" as const, ...(email ? { contactEmail: email } : {}) };
      const result = await client.placeOrder(command, beginCheckout(session, command));
      forgetCheckoutKey(session);
      const placed = { orderId: result.orderId, orderNumber: result.orderNumber, statusToken: result.statusToken };
      rememberOrder(session, placed);
      setRetry(false);
      onPlaced(placed);
    } catch (failure) {
      const next = checkoutRecovery(failure);
      if (next === "retry") { setRetry(true); setError("We could not confirm your order. Retry: the same request is sent again, so it cannot create a second order."); }
      else if (next === "requote") { forgetCheckoutKey(session); setQuote(null); setRetry(false); setError(`${message(failure)}. Review your order again.`); }
      else { setRetry(false); setError(message(failure)); }
    } finally { setBusy(false); }
  }

  return (
    <aside className="h-fit border border-neutral-200 p-6">
      <h2 className="g-heading text-[20px] text-black">Checkout</h2>
      <dl className="mt-4 space-y-3 text-[15px]">
        <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd className="text-black">{formatKzt(cart.subtotal)}</dd></div>
      </dl>
      <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void review(); }}>
        {FIELDS.map(field => (
          <label key={field.name} className="block text-[13px] text-neutral-700">
            {field.label}
            <input name={field.name} value={form[field.name]} placeholder={field.placeholder} autoComplete={field.autoComplete} required={!field.optional} disabled={busy || disabled}
              onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, [field.name]: value })); setQuote(null); }} className={input} />
          </label>
        ))}
        <button type="submit" disabled={busy || disabled || missing} className="g-btn mt-2 w-full disabled:cursor-not-allowed disabled:opacity-50">Review order</button>
      </form>
      {disabled && <p className="mt-3 text-[12px] text-neutral-500">Resolve the notices above before checkout.</p>}
      {error && <p role="alert" className="mt-3 border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">{error}</p>}
      {current && (
        <div className="mt-5 border-t border-neutral-200 pt-4">
          <dl className="space-y-2 text-[14px]">
            <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd>{formatKzt(current.subtotal)}</dd></div>
            {current.discount.amountMinor !== "0" && <div className="flex justify-between"><dt className="text-neutral-600">Discount{current.coupon ? ` (${current.coupon.code})` : ""}</dt><dd>−{formatKzt(current.discount)}</dd></div>}
            <div className="flex justify-between"><dt className="text-neutral-600">Shipping</dt><dd>{formatKzt(current.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Tax</dt><dd>{formatKzt(current.tax)}</dd></div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-[17px] font-medium"><dt>Total payable</dt><dd>{formatKzt(current.total)}</dd></div>
          </dl>
          <p className="mt-3 text-[12px] text-neutral-500">No payment is taken online. After you place the order you will see how to pay; we confirm your payment by hand. This total is held until {new Date(current.expiresAt).toLocaleTimeString()}.</p>
          <button type="button" disabled={busy || disabled} onClick={() => { void place(); }} className="g-btn g-btn--solid mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50">
            {retry ? "Retry placing order" : "Place order"}
          </button>
        </div>
      )}
    </aside>
  );
}

const STATUS_LABEL: Record<string, string> = { pending_payment: "Awaiting payment", confirmed: "Confirmed", cancel_requested: "Cancellation requested", cancelled: "Cancelled", closed: "Closed" };

/** The receipt after checkout. It polls the server status; the browser never decides an order is paid. */
export function OrderReceived({ order }: { order: PlacedOrder }) {
  const client = useClient();
  const [status, setStatus] = useState<CheckoutStatusDTO | null>(null);
  useEffect(() => {
    const signal = { aborted: false };
    void pollOrderStatus(client, order, { signal, onUpdate: next => { if (!signal.aborted) setStatus(next); } }).catch(() => { /* the receipt stays; status is retried on reload */ });
    return () => { signal.aborted = true; };
  }, [client, order]);
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      <h1 className="g-heading text-[30px] text-black">Order {order.orderNumber} received</h1>
      <p className="mt-3 text-neutral-600">Status: {status ? (status.status === "confirmed" && status.paymentStatus === "paid" ? "Paid" : STATUS_LABEL[status.status] ?? status.status) : "Awaiting payment"}{status ? ` · Total ${formatKzt(status.total)}` : ""}</p>
      {status?.paymentMethod === "manual" && status.status === "pending_payment" && (
        <div className="mx-auto mt-6 max-w-[520px] border border-neutral-200 p-4 text-left">
          <h2 className="text-[15px] font-medium text-black">How to pay</h2>
          <p className="mt-1 text-[14px] text-neutral-700">Pay <strong>{formatKzt(status.total)}</strong> and use the order number <span className="font-mono">{order.orderNumber}</span> as the payment reference.</p>
          {status.paymentInstructions
            ? <p className="mt-2 whitespace-pre-line text-[14px] text-neutral-700">{status.paymentInstructions}</p>
            : <p className="mt-2 text-[14px] text-neutral-700">We will contact you with payment details.</p>}
          {status.payBy && <p className="mt-2 text-[13px] text-neutral-500">Your order is held until {new Date(status.payBy).toLocaleString()}. If we have not received payment by then, it is cancelled.</p>}
          <p className="mt-2 text-[13px] text-neutral-500">The order is not paid until we confirm your payment.</p>
        </div>
      )}
      {status?.paymentMethod === "demo" && <p className="mt-2 text-[14px] text-neutral-500">This is a demo checkout: no payment has been taken, and the order is not paid.</p>}
      <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-8">Continue Shopping</Link>
    </div>
  );
}
