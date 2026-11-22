"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { INTL_LOCALE } from "@/i18n/config";
import { useAppLocale } from "@/i18n/useAppLocale";
import type { CartDTO, CheckoutQuoteDTO, CheckoutStatusDTO, DeliveryAddressSelection, SavedAddressDTO } from "@/contracts/commerce";
import { countryName, createAccountClient, formatKzt } from "@/lib/account-client";
import {
  beginCheckout, checkoutRecovery, createCheckoutClient, createCheckoutStorage, forgetCheckoutKey, pollOrderStatus, rememberOrder, resumePendingCheckout,
  retryOrderPayment, settleCheckoutKey,
  type PlacedOrder,
} from "@/lib/checkout-client";
import { CartRequestError } from "@/lib/cart-client";
import {
  CHECKOUT_COUNTRY, NEW_ADDRESS, checkoutProblems, checkoutRegionCode, defaultDeliveryChoice, deliveryPayload, isDeliverable, normalizePhone,
  type DeliveryChoice,
} from "@/lib/checkout-address";
import { kzRegionLabel } from "@/lib/kz-regions";
import { AddressForm, type AddressFormValue } from "@/components/address/AddressForm";
import { DemoBadge } from "@/components/DemoBadge";

// Task 14A checkout. The server prices the quote and places the order; this panel only collects
// the delivery contact (D06: name, phone, address; email optional), shows the server's KZT quote
// and submits it once with an idempotency key kept for retries. The method is the one the server offers
// (the quote's paymentMethod, else the cart's): "sandbox" while the store runs demo purchases (D03a: no real
// payment is taken; the server marks the order paid in its sandbox environment and the receipt shows
// "Paid (Demo)" from the server status); otherwise "manual" (O07: the order awaits payment, the receipt shows
// the KZT total and the staff-edited instructions, and staff confirm the payment) or, while the "Demo
// checkout" setting is on, "demo" (Task 3.3: "Pay (demo)", captured by the server as a demo payment,
// labelled DEMO). The browser never decides that an order is paid.
//
// M8.5 delivery step: Kazakhstan only. A signed-in customer chooses a saved address (sent as
// {kind:"saved"}, its recipient and phone come with it) or a new one typed in the map-assisted
// AddressForm (sent as {kind:"inline"}), optionally saved to the address book first. Guests type one.

const session = createCheckoutStorage(() => sessionStorage);
const sameOrigin = (url: string, init?: RequestInit) => fetch(url, { ...init, credentials: "same-origin" });
const browserClient = () => createCheckoutClient(sameOrigin);
const useClient = () => useMemo(() => browserClient(), []);

/** On page load: resends a checkout whose response was lost (same key), returning its order if one exists (review I1). */
export function resumeCheckout(): Promise<PlacedOrder | null> { return resumePendingCheckout(browserClient(), session); }
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
// Forms.spec.md inputs (Task 5a.2 .g-input): 1px #D9D9D9, black border on focus.
const input = "g-input mb-0";
const sectionTitle = "text-[14px] font-bold leading-[21px] text-black";

type Field = "name" | "phone" | "email" | "coupon";
type Account = { status: "loading" } | { status: "guest" } | { status: "signed-in"; addresses: SavedAddressDTO[] };
const EMPTY_ADDRESS: AddressFormValue = { label: "Delivery", recipientName: "", phone: "", countryCode: CHECKOUT_COUNTRY, region: "", city: "", line1: "", line2: "", postalCode: "", lat: null, lng: null, geoPrecision: null };

function savedAddressLines(address: SavedAddressDTO): string[] {
  const place = [address.city, kzRegionLabel(address.region), address.postalCode].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index).join(", ");
  return [[address.line1, address.line2].filter(Boolean).join(", "), place, isDeliverable(address) ? "" : countryName(address.countryCode), `${address.recipientName} · ${address.phone}`].filter(Boolean);
}

export function CheckoutPanel({ cart, disabled, onPlaced, onCartStale }: { cart: CartDTO; disabled: boolean; onPlaced: (order: PlacedOrder) => unknown; onCartStale?: () => unknown }) {
  const t = useTranslations("Checkout");
  const locale = useAppLocale();
  const kzt = (value: Parameters<typeof formatKzt>[0]) => formatKzt(value, INTL_LOCALE[locale]);
  const client = useClient();
  const account = useMemo(() => createAccountClient(sameOrigin), []);
  // Hook order matters to the component tests: contact form, quote, busy, error, retry, then the delivery step.
  const [form, setForm] = useState<Record<Field, string>>({ name: "", phone: "", email: "", coupon: "" });
  const [quote, setQuote] = useState<CheckoutQuoteDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [who, setWho] = useState<Account>({ status: "loading" });
  const [choice, setChoice] = useState<DeliveryChoice>(NEW_ADDRESS);
  const [address, setAddress] = useState<AddressFormValue>(EMPTY_ADDRESS);
  const [saveNew, setSaveNew] = useState(false);
  // A quote is for one cart revision; any cart change needs a new one.
  const current = quote && quote.cartVersion === cart.version ? quote : null;
  const addresses = who.status === "signed-in" ? who.addresses : [];
  const typing = choice === NEW_ADDRESS;
  const locked = busy || disabled;
  // The server offers exactly one method (sandbox while demo purchases run, else demo or manual by the setting).
  const method = current?.paymentMethod ?? cart.paymentMethods[0] ?? "manual";
  const demo = method === "demo";
  const sandbox = method === "sandbox";

  // Signed-in customers get their saved addresses (primary preselected) and their name and phone prefilled.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const signedIn = await account.session();
        if (!signedIn.user || signedIn.staff) { if (live) setWho({ status: "guest" }); return; }
        const [page, profile] = await Promise.all([account.addresses(), account.profile().catch(() => null)]);
        if (!live) return;
        setWho({ status: "signed-in", addresses: page.items });
        setChoice(defaultDeliveryChoice(page.items));
        if (profile) setForm(previous => ({ ...previous, name: previous.name || profile.name, phone: previous.phone || profile.phone || "", email: previous.email || profile.email || "" }));
      } catch { if (live) setWho({ status: "guest" }); }
    })();
    return () => { live = false; };
  }, [account]);

  const edit = (field: Field, value: string) => { setForm(previous => ({ ...previous, [field]: value })); setQuote(null); };
  const choose = (next: DeliveryChoice) => { setChoice(next); setQuote(null); setError(null); };
  const contact = { name: form.name, phone: form.phone, email: form.email };

  async function review() {
    const problems = checkoutProblems(contact, choice, addresses, address);
    if (problems.length) { setQuote(null); setRetry(false); setError(problems.join(". ") + "."); return; }
    setBusy(true); setError(null); setRetry(false);
    try {
      let delivery: DeliveryAddressSelection = deliveryPayload(contact, choice, addresses, address);
      if (typing && saveNew && who.status === "signed-in" && delivery.kind === "inline") {
        // Saved first, then quoted as that saved address so the order links to it.
        let saved: SavedAddressDTO;
        try {
          saved = await account.saveAddress({ ...delivery.address, label: address.label.trim() || "Delivery", region: checkoutRegionCode(address), lat: address.lat ?? null, lng: address.lng ?? null, geoPrecision: address.geoPrecision ?? null, isPrimary: false });
        } catch (failure) { setQuote(null); setError(t("addressSaveFailed", { error: message(failure, t("failed")) })); return; }
        setWho({ status: "signed-in", addresses: [...addresses, saved] });
        setChoice(saved.id); setSaveNew(false);
        delivery = { kind: "saved", addressId: saved.id, version: saved.version };
      }
      const coupon = form.coupon.trim();
      setQuote(await client.quote({ cartVersion: cart.version, displayCurrency: "KZT", delivery, ...(coupon ? { couponCode: coupon } : {}) }));
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
      if (failure instanceof CartRequestError && failure.code === "PAYMENT_METHOD_UNAVAILABLE") { forgetCheckoutKey(session); setQuote(null); setRetry(false); setError(t("methodChanged")); void onCartStale?.(); }
      else if (next === "retry") { setRetry(true); setError(t("retryNotice")); }
      else if (next === "requote") { forgetCheckoutKey(session); setQuote(null); setRetry(false); setError(t("requote", { error: message(failure, t("failed")) })); }
      else { setRetry(false); setError(message(failure, t("failed"))); }
    } finally { setBusy(false); }
  }

  const contactFields = (
    <div className="space-y-3">
      {typing && (
        <>
          <label className="g-label text-black">
            {t("fields.recipientName")}
            <input name="name" value={form.name} autoComplete="name" required maxLength={200} disabled={locked} onChange={event => edit("name", event.target.value)} className={input} />
          </label>
          <label className="g-label text-black">
            {t("fields.phone")}
            <input name="phone" type="tel" value={form.phone} placeholder="+77011234567" autoComplete="tel" required inputMode="tel" disabled={locked} onChange={event => edit("phone", event.target.value)}
              onBlur={event => { const next = normalizePhone(event.target.value); if (next !== form.phone) edit("phone", next); }} className={input} />
          </label>
        </>
      )}
      <label className="g-label text-black">
        {t("fields.email")}
        <input name="email" type="email" value={form.email} autoComplete="email" maxLength={254} disabled={locked} onChange={event => edit("email", event.target.value)} className={input} />
      </label>
    </div>
  );

  return (
    <aside className="h-fit min-w-0 border border-garmin-control p-4 sm:p-6">
      <h2 className="g-heading g-h4 m-0 text-black">{t("title")}</h2>
      <dl className="mt-4 space-y-3 text-[16px] leading-[24px]">
        <div className="flex justify-between"><dt className="font-medium text-black">{t("subtotal")}</dt><dd className="text-black">{kzt(cart.subtotal)}</dd></div>
      </dl>
      <form className="mt-4 space-y-5" noValidate onSubmit={event => { event.preventDefault(); void review(); }}>
        <fieldset className="min-w-0 space-y-3">
          <legend className={sectionTitle}>{t("deliveryLegend")}</legend>
          {who.status === "loading" ? (
            <p className="text-[14px] leading-[21px] text-black" aria-live="polite">{t("loadingDelivery")}</p>
          ) : (
            <>
              {addresses.length > 0 && (
                <div role="radiogroup" aria-label={t("deliveryAddress")} className="space-y-2">
                  {addresses.map(saved => {
                    const ships = isDeliverable(saved), selected = choice === saved.id;
                    return (
                      <label key={saved.id} className={`flex gap-3 border-2 p-3 text-[14px] leading-[21px] ${selected ? "border-black" : "border-garmin-option"} ${ships ? "cursor-pointer" : "cursor-not-allowed bg-muted text-garmin-text-muted"}`}>
                        <input type="radio" name="delivery-address" value={saved.id} checked={selected} disabled={!ships || locked} onChange={() => choose(saved.id)} className="mt-1 shrink-0 accent-black" />
                        <span className="min-w-0 break-words">
                          <span className="block font-bold text-black">{saved.label}{saved.isPrimary && <span className="ml-2 text-[12px] font-normal uppercase">{t("primary")}</span>}</span>
                          {savedAddressLines(saved).map(line => <span key={line} className="block">{line}</span>)}
                          {!ships && <span className="mt-1 block text-[14px] text-black">{t("editToShip")} <Link href="/account" className="underline">{t("openAccount")}</Link></span>}
                        </span>
                      </label>
                    );
                  })}
                  <label className={`flex cursor-pointer gap-3 border-2 p-3 text-[14px] leading-[21px] ${typing ? "border-black" : "border-garmin-option"}`}>
                    <input type="radio" name="delivery-address" value={NEW_ADDRESS} checked={typing} disabled={locked} onChange={() => choose(NEW_ADDRESS)} className="mt-1 shrink-0 accent-black" />
                    <span className="font-bold text-black">{t("newAddress")}</span>
                  </label>
                </div>
              )}
              {typing && (
                <>
                  {contactFields}
                  <AddressForm idPrefix="checkout-address" value={address} onChange={next => { setAddress(next); setQuote(null); }} showLabel={false} showContact={false} disabled={locked} />
                  {who.status === "signed-in" && (
                    <label className="flex items-center gap-2 text-[14px] leading-[21px] text-black">
                      <input type="checkbox" name="saveAddress" checked={saveNew} disabled={locked} onChange={event => setSaveNew(event.target.checked)} className="accent-black" />
                      {t("saveToAddresses")}
                    </label>
                  )}
                </>
              )}
              {!typing && contactFields}
            </>
          )}
        </fieldset>
        <label className="g-label text-black">
          {t("fields.coupon")}
          <input name="coupon" value={form.coupon} autoComplete="off" maxLength={64} disabled={locked} onChange={event => edit("coupon", event.target.value)} className={input} />
        </label>
        <button type="submit" disabled={locked || who.status === "loading"} className="g-btn g-btn--lg g-btn--black mt-2 w-full">{t("review")}</button>
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
          {sandbox ? (
            <div role="note" className="mt-3 border border-garmin-control bg-muted p-3 text-[14px] leading-[21px] text-black">
              <p className="font-bold">{t("sandboxNoticeTitle")}</p>
              <p className="mt-1">{t("sandboxNoticeBody", { time: new Date(current.expiresAt).toLocaleTimeString(INTL_LOCALE[locale]) })}</p>
            </div>
          ) : !demo && <p className="mt-3 text-[14px] leading-[21px] text-black">{t("paymentNotice", { time: new Date(current.expiresAt).toLocaleTimeString(INTL_LOCALE[locale]) })}</p>}
          <button type="button" disabled={busy || disabled} onClick={() => { void place(); }} className="g-btn g-btn--lg g-btn--primary mt-4 w-full">
            {retry ? t("retry") : sandbox ? t("placeDemo") : demo ? t("payDemo") : t("place")}
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
  // D03a: a sandbox (demo purchase) order; "Paid (Demo)" only once the server reports its sandbox capture.
  const sandbox = status?.paymentMode === "sandbox" ? status : null;
  const sandboxPaid = sandbox?.paymentStatus === "paid";
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
  const statusText = status
    ? status.status === "confirmed" && status.paymentStatus === "paid" ? (sandbox ? t("paidDemo") : t("paid")) : STATUS_KEYS.has(status.status) ? t(`status.${status.status}`) : status.status
    : t("status.pending_payment");
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      {(demo || sandbox) && <DemoBadge label={t("demoBadge")} className="mb-4" />}
      <h1 className="g-heading g-h2 m-0 text-black">{t("received", { number: order.orderNumber })}</h1>
      <p className="mt-4 text-[16px] leading-[24px] text-black">{t("statusLine", { status: statusText })}{status ? ` · ${t("totalLine", { total: kzt(status.total) })}` : ""}</p>
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
      {sandbox && (
        <>
          <p className="mt-2 text-[16px] leading-[24px] text-black">{t("paymentLine", { state: sandboxPaid ? t("paidDemo") : t("awaitingDemoPayment") })}</p>
          <p className="mx-auto mt-2 max-w-[480px] border border-garmin-control bg-muted p-3 text-[14px] leading-[21px] text-black">{t("sandboxReceipt")}</p>
        </>
      )}
      <Link href="/c/wearables-smartwatches" className="g-btn g-btn--black mt-8">{t("continueShopping")}</Link>
    </div>
  );
}
