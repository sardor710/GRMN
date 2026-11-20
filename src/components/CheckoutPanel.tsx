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
  retryOrderPayment, settleCheckoutKey,
  type PlacedOrder,
} from "@/lib/checkout-client";
import { CartRequestError } from "@/lib/cart-client";
import { DemoBadge } from "@/components/DemoBadge";

// Task 14A checkout. The server prices the quote and places the order; this panel only collects
// the delivery contact (D06: name, phone, address; email optional), shows the server's KZT quote
// and submits it once with an idempotency key kept for retries. The method is the one the cart offers
// (Task 3.1). Manual (O07): the order awaits payment, the receipt shows the KZT total and the
// staff-edited instructions, and staff confirm the payment. Demo (Task 3.3): "Pay (demo)" places an
// order the server captures as a demo payment, labelled DEMO. The browser never decides that an order is paid.

const session = createCheckoutStorage(() => sessionStorage);
const browserClient = () => createCheckoutClient((url, init) => fetch(url, { ...init, credentials: "same-origin" }));
const useClient = () => useMemo(() => browserClient(), []);

/** On page load: resends a checkout whose response was lost (same key), returning its order if one exists (review I1). */
export function resumeCheckout(): Promise<PlacedOrder | null> { return resumePendingCheckout(browserClient(), session); }
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
// Forms.spec.md inputs (Task 5a.2 .g-input): 1px #D9D9D9, black border on focus.
const input = "g-input mb-0";

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

export function CheckoutPanel({ cart, disabled, onPlaced, onCartStale }: { cart: CartDTO; disabled: boolean; onPlaced: (order: PlacedOrder) => unknown; onCartStale?: () => unknown }) {
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
  // Task 3.1/3.3: the server offers exactly one method, demo while demo checkout is on, otherwise manual.
  const method = cart.paymentMethods[0] ?? "manual";
  const demo = method === "demo";

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
      const command = { quoteId: current.id, cartVersion: current.cartVersion, paymentMethod: method, ...(email ? { contactEmail: email } : {}) };
      const result = await client.placeOrder(command, beginCheckout(session, command));
      // A demo order whose capture failed keeps its key for the receipt's "Try again" (Task 3.3).
      settleCheckoutKey(session, result);
      const placed = { orderId: result.orderId, orderNumber: result.orderNumber, statusToken: result.statusToken };
      rememberOrder(session, placed);
      setRetry(false);
      onPlaced(placed);
    } catch (failure) {
      const next = checkoutRecovery(failure);
      // Task 3.3: demo checkout was switched while this page was open. Re-read the cart so the offered
      // method (and the button) is current; the server message is English, so show ours by its code.
      if (failure instanceof CartRequestError && failure.code === "PAYMENT_METHOD_UNAVAILABLE") { forgetCheckoutKey(session); setRetry(false); setError(t("methodChanged")); void onCartStale?.(); }
      else if (next === "retry") { setRetry(true); setError(t("retryNotice")); }
      else if (next === "requote") { forgetCheckoutKey(session); setQuote(null); setRetry(false); setError(t("requote", { error: message(failure, t("failed")) })); }
      else { setRetry(false); setError(message(failure, t("failed"))); }
    } finally { setBusy(false); }
  }

  return (
    <aside className="h-fit border border-garmin-control p-6">
      <h2 className="g-heading g-h4 m-0 text-black">{t("title")}</h2>
      <dl className="mt-4 space-y-3 text-[16px] leading-[24px]">
        <div className="flex justify-between"><dt className="font-medium text-black">{t("subtotal")}</dt><dd className="text-black">{kzt(cart.subtotal)}</dd></div>
      </dl>
      <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void review(); }}>
        {FIELDS.map(field => (
          <label key={field.name} className="g-label text-black">
            {t(`fields.${field.name}`)}
            <input name={field.name} value={form[field.name]} placeholder={field.placeholder} autoComplete={field.autoComplete} required={!field.optional} disabled={busy || disabled}
              onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, [field.name]: value })); setQuote(null); }} className={input} />
          </label>
        ))}
        <button type="submit" disabled={busy || disabled || missing} className="g-btn g-btn--lg g-btn--black mt-2 w-full">{t("review")}</button>
      </form>
      {disabled && <p className="mt-3 text-[14px] leading-[21px] text-black">{t("resolveNotices")}</p>}
      {error && <p role="alert" className="mt-3 border border-garmin-error p-3 text-[14px] leading-[21px] text-garmin-error">{error}</p>}
      {current && (
        <div className="mt-5 border-t border-garmin-control pt-4">
          <dl className="space-y-2 text-[16px] leading-[24px]">
            <div className="flex justify-between"><dt className="font-medium text-black">{t("subtotal")}</dt><dd>{kzt(current.subtotal)}</dd></div>
            {current.discount.amountMinor !== "0" && <div className="flex justify-between"><dt className="font-medium text-black">{t("discount")}{current.coupon ? ` (${current.coupon.code})` : ""}</dt><dd>−{kzt(current.discount)}</dd></div>}
            <div className="flex justify-between"><dt className="font-medium text-black">{t("shipping")}</dt><dd>{kzt(current.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="font-medium text-black">{t("tax")}</dt><dd>{kzt(current.tax)}</dd></div>
            <div className="flex justify-between border-t border-garmin-control pt-2 font-bold"><dt>{t("total")}</dt><dd>{kzt(current.total)}</dd></div>
          </dl>
          {!demo && <p className="mt-3 text-[14px] leading-[21px] text-black">{t("paymentNotice", { time: new Date(current.expiresAt).toLocaleTimeString(INTL_LOCALE[locale]) })}</p>}
          <button type="button" disabled={busy || disabled} onClick={() => { void place(); }} className="g-btn g-btn--lg g-btn--primary mt-4 w-full">
            {retry ? t("retry") : demo ? t("payDemo") : t("place")}
          </button>
          {demo && <p className="mt-2 text-[14px] leading-[21px] text-black">{t("demoNote")}</p>}
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
  const [reads, setReads] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  useEffect(() => {
    const signal = { aborted: false };
    void pollOrderStatus(client, order, { signal, onUpdate: next => { if (!signal.aborted) setStatus(next); } }).catch(() => { /* the receipt stays; status is retried on reload */ });
    return () => { signal.aborted = true; };
  }, [client, order, reads]);
  const demo = status?.paymentMode === "demo";
  // Task 3.2/3.3: a demo order still awaiting payment means its demo capture failed after checkout.
  const unpaidDemo = demo && status?.status === "pending_payment";
  // "Try again" resends the same checkout with the same idempotency key: the server replays this order
  // and captures it once. The browser still only shows what the server status says.
  async function tryAgain() {
    setRetrying(true); setRetryError(null);
    try {
      if (!(await retryOrderPayment(client, session, order.orderId))) setRetryError(t("tryAgainFailed"));
    } catch { setRetryError(t("tryAgainFailed")); }
    finally { setRetrying(false); setReads(count => count + 1); }
  }
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      {demo && <DemoBadge label={t("demoBadge")} className="mb-4" />}
      <h1 className="g-heading g-h2 m-0 text-black">{t("received", { number: order.orderNumber })}</h1>
      <p className="mt-4 text-[16px] leading-[24px] text-black">{t("statusLine", { status: status ? (status.status === "confirmed" && status.paymentStatus === "paid" ? t("paid") : STATUS_KEYS.has(status.status) ? t(`status.${status.status}`) : status.status) : t("status.pending_payment") })}{status ? ` · ${t("totalLine", { total: kzt(status.total) })}` : ""}</p>
      {status?.paymentMethod === "manual" && status.status === "pending_payment" && (
        <div className="mx-auto mt-6 max-w-[520px] border border-garmin-control p-4 text-left">
          <h2 className="text-[16px] font-bold leading-[24px] text-black">{t("howToPay")}</h2>
          <p className="mt-1 text-[14px] leading-[21px] text-black">{t("payLine", { total: kzt(status.total), number: order.orderNumber })}</p>
          {status.paymentInstructions
            ? <p className="mt-2 whitespace-pre-line text-[14px] leading-[21px] text-black">{status.paymentInstructions}</p>
            : <p className="mt-2 text-[14px] leading-[21px] text-black">{t("contactLater")}</p>}
          {status.payBy && <p className="mt-2 text-[14px] leading-[21px] text-black">{t("heldUntil", { time: new Date(status.payBy).toLocaleString(INTL_LOCALE[locale]) })}</p>}
          <p className="mt-2 text-[14px] leading-[21px] text-black">{t("notPaidUntilConfirmed")}</p>
        </div>
      )}
      {unpaidDemo && (
        <div role="alert" className="mx-auto mt-6 max-w-[520px] border border-garmin-error p-4 text-left">
          <h2 className="text-[16px] font-bold leading-[24px] text-garmin-error">{t("paymentNotCompleted")}</h2>
          <p className="mt-1 text-[14px] leading-[21px] text-black">{t("paymentNotCompletedBody")}</p>
          {retryError && <p className="mt-2 text-[14px] leading-[21px] text-garmin-error">{retryError}</p>}
          <button type="button" disabled={retrying} onClick={() => { void tryAgain(); }} className="g-btn g-btn--black mt-3">{t("tryAgain")}</button>
        </div>
      )}
      {demo && !unpaidDemo && <p className="mt-2 text-[14px] leading-[21px] text-black">{t("demoReceipt")}</p>}
      <Link href="/c/wearables-smartwatches" className="g-btn g-btn--black mt-8">{t("continueShopping")}</Link>
    </div>
  );
}
