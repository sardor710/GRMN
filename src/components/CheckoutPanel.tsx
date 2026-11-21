"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CartDTO, CheckoutQuoteDTO, CheckoutStatusDTO, DeliveryAddressSelection, SavedAddressDTO } from "@/contracts/commerce";
import { countryName, createAccountClient, formatKzt } from "@/lib/account-client";
import {
  beginCheckout, checkoutRecovery, createCheckoutClient, createCheckoutStorage, forgetCheckoutKey, pollOrderStatus, rememberOrder, resumePendingCheckout,
  type PlacedOrder,
} from "@/lib/checkout-client";
import {
  CHECKOUT_COUNTRY, NEW_ADDRESS, checkoutProblems, checkoutRegionCode, defaultDeliveryChoice, deliveryPayload, isDeliverable, normalizePhone,
  type DeliveryChoice,
} from "@/lib/checkout-address";
import { kzRegionLabel } from "@/lib/kz-regions";
import { AddressForm, type AddressFormValue } from "@/components/address/AddressForm";

// Task 14A checkout. The server prices the quote and places the order; this panel only collects
// the delivery contact (D06: name, phone, address; email optional), shows the server's KZT quote
// and submits it once with an idempotency key kept for retries. The payment method comes from the
// server's quote: "demo" (D03: no money is taken and the order is never shown as paid) or, while the
// store runs demo purchases, "sandbox" (D03a: no real payment is taken; the server marks the order
// paid in its sandbox environment and the receipt shows "Paid (Demo)" from the server status).
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
const message = (error: unknown) => error instanceof Error && error.message ? error.message : "Checkout failed";
const input = "mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none disabled:bg-neutral-100";
const sectionTitle = "text-[12px] font-semibold uppercase tracking-wider text-neutral-600";

type Field = "name" | "phone" | "email" | "coupon";
type Account = { status: "loading" } | { status: "guest" } | { status: "signed-in"; addresses: SavedAddressDTO[] };
const EMPTY_ADDRESS: AddressFormValue = { label: "Delivery", recipientName: "", phone: "", countryCode: CHECKOUT_COUNTRY, region: "", city: "", line1: "", line2: "", postalCode: "", lat: null, lng: null, geoPrecision: null };

function savedAddressLines(address: SavedAddressDTO): string[] {
  const place = [address.city, kzRegionLabel(address.region), address.postalCode].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index).join(", ");
  return [[address.line1, address.line2].filter(Boolean).join(", "), place, isDeliverable(address) ? "" : countryName(address.countryCode), `${address.recipientName} · ${address.phone}`].filter(Boolean);
}

export function CheckoutPanel({ cart, disabled, onPlaced }: { cart: CartDTO; disabled: boolean; onPlaced: (order: PlacedOrder) => unknown }) {
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
        } catch (failure) { setQuote(null); setError(`The address could not be saved: ${message(failure)}`); return; }
        setWho({ status: "signed-in", addresses: [...addresses, saved] });
        setChoice(saved.id); setSaveNew(false);
        delivery = { kind: "saved", addressId: saved.id, version: saved.version };
      }
      const coupon = form.coupon.trim();
      setQuote(await client.quote({ cartVersion: cart.version, displayCurrency: "KZT", delivery, ...(coupon ? { couponCode: coupon } : {}) }));
    } catch (failure) { setQuote(null); setError(message(failure)); } finally { setBusy(false); }
  }

  async function place() {
    if (!current) return;
    setBusy(true); setError(null);
    const email = form.email.trim();
    try {
      const command = { quoteId: current.id, cartVersion: current.cartVersion, paymentMethod: current.paymentMethod, ...(email ? { contactEmail: email } : {}) };
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

  const contactFields = (
    <div className="space-y-3">
      {typing && (
        <>
          <label className="block text-[13px] text-neutral-700">
            Full name
            <input name="name" value={form.name} autoComplete="name" required maxLength={200} disabled={locked} onChange={event => edit("name", event.target.value)} className={input} />
          </label>
          <label className="block text-[13px] text-neutral-700">
            Phone
            <input name="phone" type="tel" value={form.phone} placeholder="+77011234567" autoComplete="tel" required inputMode="tel" disabled={locked} onChange={event => edit("phone", event.target.value)}
              onBlur={event => { const next = normalizePhone(event.target.value); if (next !== form.phone) edit("phone", next); }} className={input} />
          </label>
        </>
      )}
      <label className="block text-[13px] text-neutral-700">
        Email (optional)
        <input name="email" type="email" value={form.email} autoComplete="email" maxLength={254} disabled={locked} onChange={event => edit("email", event.target.value)} className={input} />
      </label>
    </div>
  );

  return (
    <aside className="h-fit min-w-0 border border-neutral-200 p-4 sm:p-6">
      <h2 className="g-heading text-[20px] text-black">Checkout</h2>
      <dl className="mt-4 space-y-3 text-[15px]">
        <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd className="text-black">{formatKzt(cart.subtotal)}</dd></div>
      </dl>
      <form className="mt-4 space-y-5" noValidate onSubmit={event => { event.preventDefault(); void review(); }}>
        <fieldset className="min-w-0 space-y-3">
          <legend className={sectionTitle}>Delivery in Kazakhstan</legend>
          {who.status === "loading" ? (
            <p className="text-[13px] text-neutral-500" aria-live="polite">Loading delivery options…</p>
          ) : (
            <>
              {addresses.length > 0 && (
                <div role="radiogroup" aria-label="Delivery address" className="space-y-2">
                  {addresses.map(saved => {
                    const ships = isDeliverable(saved), selected = choice === saved.id;
                    return (
                      <label key={saved.id} className={`flex gap-3 border p-3 text-[13px] ${selected ? "border-black" : "border-neutral-300"} ${ships ? "cursor-pointer" : "cursor-not-allowed bg-neutral-50 text-neutral-500"}`}>
                        <input type="radio" name="delivery-address" value={saved.id} checked={selected} disabled={!ships || locked} onChange={() => choose(saved.id)} className="mt-1 shrink-0 accent-black" />
                        <span className="min-w-0 break-words">
                          <span className="block font-semibold text-black">{saved.label}{saved.isPrimary && <span className="ml-2 text-[11px] font-normal uppercase tracking-wider text-neutral-500">Primary</span>}</span>
                          {savedAddressLines(saved).map(line => <span key={line} className="block text-neutral-600">{line}</span>)}
                          {!ships && <span className="mt-1 block text-[12px] text-amber-800">Edit in your account to ship in Kazakhstan. <Link href="/account" className="underline">Open account</Link></span>}
                        </span>
                      </label>
                    );
                  })}
                  <label className={`flex cursor-pointer gap-3 border p-3 text-[13px] ${typing ? "border-black" : "border-neutral-300"}`}>
                    <input type="radio" name="delivery-address" value={NEW_ADDRESS} checked={typing} disabled={locked} onChange={() => choose(NEW_ADDRESS)} className="mt-1 shrink-0 accent-black" />
                    <span className="font-semibold text-black">New address</span>
                  </label>
                </div>
              )}
              {typing && (
                <>
                  {contactFields}
                  <AddressForm idPrefix="checkout-address" value={address} onChange={next => { setAddress(next); setQuote(null); }} showLabel={false} showContact={false} disabled={locked} />
                  {who.status === "signed-in" && (
                    <label className="flex items-center gap-2 text-[13px] text-neutral-700">
                      <input type="checkbox" name="saveAddress" checked={saveNew} disabled={locked} onChange={event => setSaveNew(event.target.checked)} className="accent-black" />
                      Save to my addresses
                    </label>
                  )}
                </>
              )}
              {!typing && contactFields}
            </>
          )}
        </fieldset>
        <label className="block text-[13px] text-neutral-700">
          Promo code (optional)
          <input name="coupon" value={form.coupon} autoComplete="off" maxLength={64} disabled={locked} onChange={event => edit("coupon", event.target.value)} className={input} />
        </label>
        <button type="submit" disabled={locked || who.status === "loading"} className="g-btn mt-2 w-full disabled:cursor-not-allowed disabled:opacity-50">Review order</button>
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
          {current.paymentMethod === "sandbox" ? (
            <div role="note" className="mt-3 border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
              <p className="font-medium">Demo purchase — no real payment is taken.</p>
              <p className="mt-1 text-[12px]">Placing the order marks it paid (Demo) at once, so the store can test orders and dashboards. This total is held until {new Date(current.expiresAt).toLocaleTimeString()}.</p>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-neutral-500">Payment is a demo: no money is taken and your order stays awaiting payment. This total is held until {new Date(current.expiresAt).toLocaleTimeString()}.</p>
          )}
          <button type="button" disabled={busy || disabled} onClick={() => { void place(); }} className="g-btn g-btn--solid mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50">
            {retry ? "Retry placing order" : current.paymentMethod === "sandbox" ? "Place demo order" : "Place order"}
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
  const sandbox = status?.paymentMode === "sandbox" ? status : null;
  return (
    <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
      <h1 className="g-heading text-[30px] text-black">Order {order.orderNumber} received</h1>
      <p className="mt-3 text-neutral-600">Status: {status ? STATUS_LABEL[status.status] ?? status.status : "Awaiting payment"}{status ? ` · Total ${formatKzt(status.total)}` : ""}</p>
      {sandbox ? (
        <>
          {/* "Paid" is shown only when the server reports the sandbox capture. */}
          <p className="mt-2 text-[15px] text-black">Payment: {sandbox.paymentStatus === "paid" ? <strong>Paid (Demo)</strong> : "Awaiting demo payment"}</p>
          <p className="mx-auto mt-2 max-w-[480px] border border-amber-300 bg-amber-50 p-3 text-[14px] text-amber-900">Demo purchase — no real payment was taken. The order is paid in the store&apos;s sandbox only.</p>
        </>
      ) : (
        <p className="mt-2 text-[14px] text-neutral-500">This is a demo checkout: no payment has been taken, and the order is not paid.</p>
      )}
      <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-8">Continue Shopping</Link>
    </div>
  );
}
