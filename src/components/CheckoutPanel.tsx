"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { INTL_LOCALE } from "@/i18n/config";
import { useAppLocale } from "@/i18n/useAppLocale";
import type { CartDTO, CheckoutQuoteDTO, CheckoutStatusDTO } from "@/contracts/commerce";
import { formatKzt } from "@/lib/account-client";
import {
  beginCheckout, checkoutRecovery, createCheckoutClient, createCheckoutStorage, forgetCheckoutKey, pollOrderStatus, rememberOrder, resumePendingCheckout,
  type PlacedOrder,
} from "@/lib/checkout-client";

// Task 14A checkout. The server prices the quote and places the order; this panel only collects
// the delivery contact (D06: name, phone, address; email optional), shows the server's KZT quote
// and submits it once with an idempotency key kept for retries. Payments are the demo mode (D03):
// no money is taken and an order is never shown as paid.

const session = createCheckoutStorage(() => sessionStorage);
const browserClient = () => createCheckoutClient((url, init) => fetch(url, { ...init, credentials: "same-origin" }));
const useClient = () => useMemo(() => browserClient(), []);

/** On page load: resends a checkout whose response was lost (same key), returning its order if one exists (review I1). */
export function resumeCheckout(): Promise<PlacedOrder | null> { return resumePendingCheckout(browserClient(), session); }
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const input = "mt-1 w-full border border-neutral-300 px-3 py-2 text-[14px]";

type Field = "recipientName" | "phone" | "countryCode" | "city" | "line1" | "email" | "coupon";
/** Field labels are `Checkout.fields.<name>` messages. */
const FIELDS: { name: Field; placeholder?: string; autoComplete: string; optional?: boolean }[] = [
  { name: "recipientName", autoComplete: "name" },
  { name: "phone", placeholder: "+77011234567", autoComplete: "tel" },
  { name: "countryCode", placeholder: "KZ", autoComplete: "country" },
  { name: "city", autoComplete: "address-level2" },
  { name: "line1", autoComplete: "address-line1" },
  { name: "email", autoComplete: "email", optional: true },
  { name: "coupon", autoComplete: "off", optional: true },
];

export function CheckoutPanel({ cart, disabled, onPlaced }: { cart: CartDTO; disabled: boolean; onPlaced: (order: PlacedOrder) => unknown }) {
  const t = useTranslations("Checkout");
  const locale = useAppLocale();
  const kzt = (value: Parameters<typeof formatKzt>[0]) => formatKzt(value, INTL_LOCALE[locale]);
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
    } catch (failure) { setQuote(null); setError(message(failure, t("failed"))); } finally { setBusy(false); }
  }

  async function place() {
    if (!current) return;
    setBusy(true); setError(null);
    const email = form.email.trim();
    try {
      const command = { quoteId: current.id, cartVersion: current.cartVersion, paymentMethod: "demo" as const, ...(email ? { contactEmail: email } : {}) };
      const result = await client.placeOrder(command, beginCheckout(session, command));
      forgetCheckoutKey(session);
      const placed = { orderId: result.orderId, orderNumber: result.orderNumber, statusToken: result.statusToken };
      rememberOrder(session, placed);
      setRetry(false);
      onPlaced(placed);
    } catch (failure) {
      const next = checkoutRecovery(failure);
      if (next === "retry") { setRetry(true); setError(t("retryNotice")); }
      else if (next === "requote") { forgetCheckoutKey(session); setQuote(null); setRetry(false); setError(t("requote", { error: message(failure, t("failed")) })); }
      else { setRetry(false); setError(message(failure, t("failed"))); }
    } finally { setBusy(false); }
  }

  return (
    <aside className="h-fit border border-neutral-200 p-6">
      <h2 className="g-heading text-[20px] text-black">{t("title")}</h2>
      <dl className="mt-4 space-y-3 text-[15px]">
        <div className="flex justify-between"><dt className="text-neutral-600">{t("subtotal")}</dt><dd className="text-black">{kzt(cart.subtotal)}</dd></div>
      </dl>
      <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void review(); }}>
        {FIELDS.map(field => (
          <label key={field.name} className="block text-[13px] text-neutral-700">
            {t(`fields.${field.name}`)}
            <input name={field.name} value={form[field.name]} placeholder={field.placeholder} autoComplete={field.autoComplete} required={!field.optional} disabled={busy || disabled}
              onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, [field.name]: value })); setQuote(null); }} className={input} />
          </label>
        ))}
        <button type="submit" disabled={busy || disabled || missing} className="g-btn mt-2 w-full disabled:cursor-not-allowed disabled:opacity-50">{t("review")}</button>
      </form>
      {disabled && <p className="mt-3 text-[12px] text-neutral-500">{t("resolveNotices")}</p>}
      {error && <p role="alert" className="mt-3 border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">{error}</p>}
      {current && (
        <div className="mt-5 border-t border-neutral-200 pt-4">
          <dl className="space-y-2 text-[14px]">
            <div className="flex justify-between"><dt className="text-neutral-600">{t("subtotal")}</dt><dd>{kzt(current.subtotal)}</dd></div>
            {current.discount.amountMinor !== "0" && <div className="flex justify-between"><dt className="text-neutral-600">{t("discount")}{current.coupon ? ` (${current.coupon.code})` : ""}</dt><dd>−{kzt(current.discount)}</dd></div>}
            <div className="flex justify-between"><dt className="text-neutral-600">{t("shipping")}</dt><dd>{kzt(current.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">{t("tax")}</dt><dd>{kzt(current.tax)}</dd></div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-[17px] font-medium"><dt>{t("total")}</dt><dd>{kzt(current.total)}</dd></div>
          </dl>
          <p className="mt-3 text-[12px] text-neutral-500">{t("demoNotice", { time: new Date(current.expiresAt).toLocaleTimeString(INTL_LOCALE[locale]) })}</p>
          <button type="button" disabled={busy || disabled} onClick={() => { void place(); }} className="g-btn g-btn--solid mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50">
            {retry ? t("retry") : t("place")}
          </button>
        </div>
      )}
    </aside>
  );
}

/** Order statuses with a `Checkout.status.*` message. */
const STATUS_KEYS = new Set(["pending_payment", "confirmed", "cancel_requested", "cancelled", "closed"]);

/** The receipt after checkout. It polls the server status; the browser never decides an order is paid. */
export function OrderReceived({ order }: { order: PlacedOrder }) {
  const t = useTranslations("Checkout");
  const locale = useAppLocale();
  const kzt = (value: Parameters<typeof formatKzt>[0]) => formatKzt(value, INTL_LOCALE[locale]);
  const client = useClient();
  const [status, setStatus] = useState<CheckoutStatusDTO | null>(null);
  useEffect(() => {
    const signal = { aborted: false };
    void pollOrderStatus(client, order, { signal, onUpdate: next => { if (!signal.aborted) setStatus(next); } }).catch(() => { /* the receipt stays; status is retried on reload */ });
    return () => { signal.aborted = true; };
  }, [client, order]);
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      <h1 className="g-heading text-[30px] text-black">{t("received", { number: order.orderNumber })}</h1>
      <p className="mt-3 text-neutral-600">{t("statusLine", { status: status ? (STATUS_KEYS.has(status.status) ? t(`status.${status.status}`) : status.status) : t("status.pending_payment") })}{status ? ` · ${t("totalLine", { total: kzt(status.total) })}` : ""}</p>
      <p className="mt-2 text-[14px] text-neutral-500">{t("demoReceipt")}</p>
      <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-8">{t("continueShopping")}</Link>
    </div>
  );
}
