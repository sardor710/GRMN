"use client";

import { createRequestGate } from "@/lib/admin/dashboard";
import { formatKzt } from "@/lib/money";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AdminOrderDetailDTO, AdminOrderSummaryDTO, ShipmentDTO } from "@/contracts/commerce";
import { DemoBadge } from "@/components/DemoBadge";
import { Button } from "@/components/admin/ui";
import { deliveryAddressLines } from "@/lib/account-client";

// Task 16A: PostgreSQL-mode staff fulfillment. Every action sends the version it was based on and
// an idempotency key; the server decides eligibility (paid, not an exception, not legacy) and
// records the real timeline. No dates are typed here: milestones use the server clock.
// O07 (Task 21C): staff with payments:confirm confirm a manual payment here (method, reference, the
// amount received, an optional note), and record the payout of a manual refund.

const STATUSES = ["", "unfulfilled", "processing", "partially_shipped", "shipped", "delivered", "exception"] as const;
// Task 3.3: "Demo" finds demo-checkout orders (no money was charged) so stray ones can be cancelled.
const MODES = [["", "All"], ["demo", "Demo"], ["sandbox", "Demo purchase (sandbox)"], ["live", "Live"]] as const;
/** Demo checkout (Task 3.2) and D03a sandbox demo purchases are both demo money: they carry the DEMO badge. */
const isDemoMode = (mode: string) => mode === "demo" || mode === "sandbox";
const REASONS: Record<string, string> = {
  LEGACY_ORDER: "Legacy summary order: item operations are not available.",
  ORDER_NOT_PAID: "Not paid: only captured orders can ship.",
  FULFILLMENT_EXCEPTION: "Fulfillment exception: this order must not ship.",
  ORDER_NOT_SHIPPABLE: "This order cannot ship in its current state.",
};
/** Minor-unit KZT through the shared money formatter ("KZT 8,415.00"): BigInt-exact, no float division. */
const kzt = (amountMinor: string) => formatKzt({ minor: amountMinor }, "en");
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
const newKey = () => `ui-${crypto.randomUUID()}`;
const METHODS = [["bank_transfer", "Bank transfer"], ["kaspi", "Kaspi"], ["cash", "Cash"]] as const;
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS);
const majorKzt = (amountMinor: string) => (BigInt(amountMinor) / BigInt(100)).toString() + "." + (BigInt(amountMinor) % BigInt(100)).toString().padStart(2, "0");
/** "8415", "8415.5" or "8415.50" KZT to minor units; null when it is not an amount. */
function minorKzt(value: string): string | null {
  const match = /^(\d{1,13})(?:[.,](\d{1,2}))?$/.exec(value.trim().replace(/[\s\u00a0]/g, ""));
  if (!match) return null;
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return minor > BigInt(0) ? minor.toString() : null;
}

/** The order's delivery snapshot as display lines; a region code shows as its name (M8.5). */
function deliveryLines(address: AdminOrderDetailDTO["deliveryAddress"]): string[] {
  if (!address) return [];
  if (address.kind === "legacy_unstructured") return address.legacy_raw ? [address.legacy_raw] : [];
  return deliveryAddressLines({ kind: "structured", address: {
    recipientName: address.recipient_name ?? "", phone: address.phone ?? "", countryCode: address.country_code ?? "", city: address.city ?? "", line1: address.line1 ?? "",
    line2: address.line2, region: address.region, postalCode: address.postal_code,
  } });
}

async function readError(response: Response): Promise<string> {
  try { const body = await response.json() as { error?: { message?: string; code?: string }; message?: string }; return body.error?.message ?? body.message ?? `Request failed (${response.status})`; }
  catch { return `Request failed (${response.status})`; }
}

export default function FulfillmentScreen() {
  const [status, setStatus] = useState<string>("");
  const [mode, setMode] = useState<string>("");
  const [orders, setOrders] = useState<AdminOrderSummaryDTO[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadedDetail, setDetail] = useState<AdminOrderDetailDTO | null>(null);
  // Final review I3: the queue's own error, cleared by every queue load, lives apart from the error of a
  // staff action (confirm payment, shipments, cancel), which stays visible until the next user action.
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [payMethod, setPayMethod] = useState<string>("kaspi");
  const [payReference, setPayReference] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const detailId = useRef<string | null>(null);
  // Final review I4: only the selected order's detail is ever shown or acted on, never a late one.
  const detail = loadedDetail && loadedDetail.id === selected ? loadedDetail : null;
  const searchParams = useSearchParams();
  const linkedOrder = searchParams?.get("order") ?? null;
  const [payNote, setPayNote] = useState("");
  const [payout, setPayout] = useState<Record<string, { method: string; reference: string }>>({});

  // Fix round 1 (5b.1): one queue request at a time. A filter change aborts the previous request and a
  // late response from an older filter is dropped, so a slow unfiltered list never replaces the Demo list.
  // A failed request ends the loading state with an error instead of leaving "Loading orders…" forever.
  const [queueGate] = useState(createRequestGate);
  const [detailGate] = useState(createRequestGate);
  const loadOrders = useCallback(async () => {
    const ticket = queueGate.begin();
    setListError(null);
    const query = new URLSearchParams();
    if (status) query.set("fulfillmentStatus", status);
    if (mode) query.set("paymentMode", mode);
    try {
      const response = await fetch("/api/admin/orders" + (query.size ? `?${query}` : ""), { cache: "no-store", signal: ticket.signal });
      if (!response.ok) { const message = await readError(response); if (ticket.isCurrent()) { setListError(message); setOrders([]); } return; }
      const items = (await response.json() as { items: AdminOrderSummaryDTO[] }).items;
      if (ticket.isCurrent()) setOrders(items);
    } catch (reason) {
      if (!ticket.isCurrent()) return;
      setListError(`The orders could not be loaded: ${reason instanceof Error ? reason.message : String(reason)}`);
      setOrders([]);
    }
  }, [status, mode, queueGate]);
  // Fix round 1: the detail's own error (e.g. a linked order that does not exist) lives apart from the
  // list error, so loadOrders clearing its error never hides why the detail did not open.
  // Final review I4: one detail request at a time (the queue's request gate). Clicking A then B aborts A, and a
  // response for anything but the selected order is dropped, so B's actions can never act on A. A rejected
  // fetch shows an error instead of an unhandled rejection.
  const loadDetail = useCallback(async (id: string) => {
    const ticket = detailGate.begin();
    const current = () => ticket.isCurrent();
    try {
      const response = await fetch(`/api/admin/orders?id=${id}`, { cache: "no-store", signal: ticket.signal });
      if (!response.ok) { const message = await readError(response); if (current()) { setDetail(null); setDetailError(message); } return; }
      const next = await response.json() as AdminOrderDetailDTO;
      if (!current() || next.id !== id) return;
      setDetailError(null);
      setDetail(next);
      setQuantities({});
      // Review I1: never prefilled. Staff type the amount that actually arrived; the server refuses
      // anything but the order total, so a short payment cannot be confirmed by just entering a reference.
      setPayAmount(previous => previous && next.id === detailId.current ? previous : "");
      detailId.current = next.id;
    } catch (reason) {
      if (!current()) return;
      setDetail(null);
      setDetailError(`The order could not be loaded: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }, [detailGate]);

  // Task 4.2: /admin/orders?order=<id> (the dashboard's recent orders link) opens that order's detail.
  // Final review M12: it follows the search params, so a later client navigation to ?order= opens that order too.
  useEffect(() => {
    if (linkedOrder && /^[0-9a-f-]{36}$/i.test(linkedOrder)) { setSelected(linkedOrder); setActionError(null); }
  }, [linkedOrder]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => () => { queueGate.abort(); detailGate.abort(); }, [queueGate, detailGate]);
  useEffect(() => { if (selected) void loadDetail(selected); else { detailGate.abort(); setDetail(null); setDetailError(null); } }, [selected, loadDetail, detailGate]);
  /** A new user action starts with no earlier action error. */
  const selectOrder = (id: string) => { setActionError(null); setSelected(id); };

  // The manual payment actions are keyed by their reference instead of an idempotency key.
  async function post(body: Record<string, unknown>, keyed = true) {
    setBusy(true); setActionError(null);
    try {
      const response = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(keyed ? { ...body, idempotencyKey: newKey() } : body) });
      if (!response.ok) { setActionError(await readError(response)); return false; }
      return true;
    } finally {
      setBusy(false);
      if (selected) await loadDetail(selected);
      await loadOrders();
    }
  }
  async function createShipment() {
    if (!detail) return;
    setActionError(null);
    const lines = Object.entries(quantities).map(([orderItemId, value]) => ({ orderItemId, quantity: Number(value) })).filter(line => Number.isInteger(line.quantity) && line.quantity > 0);
    if (!lines.length) { setActionError("Enter a quantity to ship."); return; }
    const ok = await post({ action: "create_shipment", orderId: detail.id, expectedOrderVersion: detail.version, lines,
      ...(carrier.trim() ? { carrier: carrier.trim() } : {}), ...(tracking.trim() ? { trackingReference: tracking.trim() } : {}), ...(note.trim() ? { internalNote: note.trim() } : {}) });
    if (ok) { setCarrier(""); setTracking(""); setNote(""); }
  }
  const act = (shipment: ShipmentDTO, action: "dispatch" | "deliver" | "cancel") => post({ action, shipmentId: shipment.id, expectedVersion: shipment.version });
  // Task 16B: the server decides what a cancellation does (release holds, or restore stock and reserve a refund).
  async function cancelOrder() {
    if (!detail) return;
    const reason = window.prompt("Reason for cancelling this order");
    if (!reason?.trim()) return;
    await post({ action: "cancel_order", orderId: detail.id, expectedOrderVersion: detail.version, reason: reason.trim() });
  }

  async function confirmPayment() {
    if (!detail) return;
    const amountMinor = minorKzt(payAmount);
    setActionError(null);
    if (!payReference.trim()) { setActionError("Enter the payment reference."); return; }
    if (!amountMinor) { setActionError("Enter the amount received in KZT."); return; }
    const ok = await post({ action: "confirm_payment", orderId: detail.id, method: payMethod, reference: payReference.trim(), amountMinor, ...(payNote.trim() ? { note: payNote.trim() } : {}) }, false);
    if (ok) { setPayReference(""); setPayNote(""); setPayAmount(""); }
  }
  async function completeRefund(refundId: string) {
    const entry = payout[refundId] ?? { method: "kaspi", reference: "" };
    setActionError(null);
    if (!entry.reference.trim()) { setActionError("Enter the payout reference."); return; }
    const ok = await post({ action: "complete_manual_refund", refundId, method: entry.method, reference: entry.reference.trim() }, false);
    if (ok) setPayout(current => { const next = { ...current }; delete next[refundId]; return next; });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="g-heading g-h2 text-black">Orders</h1>
          <p className="text-sm text-muted-foreground">Ship paid orders in parts; every action is recorded in the order timeline.</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm font-bold">Payment{" "}
            <select aria-label="Payment mode filter" className="g-select m-0 h-10 w-36 py-0 text-sm font-normal" value={mode} onChange={event => setMode(event.target.value)}>
              {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">Fulfillment status{" "}
            <select aria-label="Fulfillment status filter" className="g-select m-0 h-10 w-48 py-0 text-sm font-normal" value={status} onChange={event => setStatus(event.target.value)}>
              {STATUSES.map(value => <option key={value} value={value}>{value || "All"}</option>)}
            </select>
          </label>
        </div>
      </div>
      {listError && <p role="alert" className="border border-garmin-error p-3 text-sm text-garmin-error">{listError}</p>}
      {actionError && <p role="alert" data-action-error className="border border-garmin-error p-3 text-sm text-garmin-error">{actionError}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Order queue" className="min-w-0 border border-garmin-control">
          {orders === null ? <p className="p-4 text-sm text-muted-foreground">Loading orders…</p> : orders.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No orders.</p> : (
            <ul className="divide-y divide-garmin-rule">
              {orders.map(order => (
                <li key={order.id}>
                  <button type="button" onClick={() => selectOrder(order.id)} className={`flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted ${selected === order.id ? "bg-muted shadow-[inset_3.2px_0_0_#000]" : ""}`}>
                    <span className="flex items-center gap-2"><span className="font-bold tabular-nums">{order.orderNumber}</span>{isDemoMode(order.paymentMode) && <DemoBadge label="DEMO" className="text-[10px]" />}</span>
                    <span>{order.contactName}</span>
                    <span className="text-xs text-muted-foreground">{order.paymentStatus} · {order.fulfillmentStatus}{order.dataQuality !== "complete" ? " · legacy" : ""}</span>
                    <span className="whitespace-nowrap font-bold tabular-nums">{kzt(order.total.amountMinor)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Order detail" className="min-w-0 border border-garmin-control p-4">
          {detailError && <p role="alert" className="mb-3 border border-garmin-error p-3 text-sm text-garmin-error">{detailError}</p>}
          {!detail ? (detailError ? null : <p className="text-sm text-muted-foreground">Select an order.</p>) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="g-heading g-h4 tabular-nums">{detail.orderNumber}</h2>
                <span data-status-badge className="rounded-none bg-garmin-badge-gray px-3 py-0.5 text-xs capitalize text-black">{detail.status}</span>
                <span data-status-badge className="rounded-none bg-garmin-badge-gray px-3 py-0.5 text-xs capitalize text-black">{detail.paymentStatus}</span>
                <span data-status-badge className="rounded-none bg-garmin-badge-gray px-3 py-0.5 text-xs capitalize text-black">{detail.fulfillmentStatus}</span>
                {isDemoMode(detail.paymentMode) ? <DemoBadge label={detail.paymentMode === "sandbox" ? "DEMO · SANDBOX" : "DEMO"} className="text-[10px]" /> : <span data-status-badge className="rounded-none bg-garmin-badge-gray px-3 py-0.5 text-xs capitalize text-black">{detail.paymentMode}</span>}
              </div>
              {deliveryLines(detail.deliveryAddress).length > 0 && (
                <div className="text-sm">
                  <h3 className="text-xs font-bold uppercase text-muted-foreground">Deliver to</h3>
                  <div className="mt-1 leading-relaxed">{deliveryLines(detail.deliveryAddress).map((line, index) => <p key={index}>{line}</p>)}</div>
                  {detail.contact.email && <p className="text-muted-foreground">{detail.contact.email}</p>}
                </div>
              )}
              {!detail.fulfillable.allowed && detail.fulfillable.reason && <p className="border border-garmin-control bg-muted p-2.5 text-sm text-black">{REASONS[detail.fulfillable.reason]}</p>}
              <div aria-label="Payment" className="border border-garmin-control p-3">
                <h3 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Payment</h3>
                <p className="text-sm">
                  {detail.payment.method === "manual" ? "Manual payment" : detail.payment.method === "demo" ? "Demo (no money is taken)" : detail.payment.method === "sandbox" ? "Demo purchase (sandbox, no money is taken)" : detail.payment.method ?? "—"}
                  {" · "}{kzt(detail.total.amountMinor)}
                </p>
                {detail.payment.confirmation && (
                  <p className="mt-1 text-sm text-neutral-700">
                    Confirmed {formatDate(detail.payment.confirmation.confirmedAt)}: {METHOD_LABEL[detail.payment.confirmation.method] ?? detail.payment.confirmation.method}, reference{" "}
                    <span className="tabular-nums">{detail.payment.confirmation.reference}</span>, {kzt(detail.payment.confirmation.amountMinor)}
                    {detail.payment.confirmation.note ? ` — ${detail.payment.confirmation.note}` : ""}
                  </p>
                )}
                {detail.payment.confirmable && (
                  <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void confirmPayment(); }}>
                    <label className="text-sm font-bold">Method
                      <select name="paymentMethod" className="mt-1 w-full h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none font-normal" value={payMethod} onChange={event => setPayMethod(event.target.value)}>
                        {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-bold">Reference
                      <input name="paymentReference" required maxLength={120} placeholder="Bank or Kaspi reference, receipt number" className="mt-1 w-full h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none font-normal" value={payReference} onChange={event => setPayReference(event.target.value)} />
                    </label>
                    <label className="text-sm font-bold">Amount received (KZT) · expected {majorKzt(detail.total.amountMinor)}
                      <input name="paymentAmount" required inputMode="decimal" placeholder="Type the amount that arrived" className="mt-1 w-full h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none font-normal" value={payAmount} onChange={event => setPayAmount(event.target.value)} />
                    </label>
                    <label className="text-sm font-bold">Note (optional)
                      <input name="paymentNote" maxLength={1000} className="mt-1 w-full h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none font-normal" value={payNote} onChange={event => setPayNote(event.target.value)} />
                    </label>
                    <Button variant="primary" size="md" type="submit" disabled={busy} className="sm:col-span-2">Confirm payment</Button>
                  </form>
                )}
              </div>
              {!detail.legacy && detail.status !== "cancelled" && detail.status !== "closed" && (
                <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void cancelOrder()} className="border-garmin-error text-garmin-error">Cancel order</Button>
              )}
              <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
                <thead><tr className="bg-muted text-left text-xs font-bold uppercase tracking-[-0.2px] text-black [&>th]:px-2 [&>th]:py-2"><th>Item</th><th>Ordered</th><th>Shipped</th><th>Left</th><th>Ship now</th></tr></thead>
                <tbody>
                  {detail.items.map(item => (
                    <tr key={item.id} className="border-t border-garmin-rule [&>td]:px-2">
                      <td className="py-1.5">{item.name}{item.sku ? <span className="ml-1 tabular-nums text-xs text-muted-foreground">{item.sku}</span> : null}</td>
                      <td>{item.quantity}</td><td>{item.shipped}</td><td>{item.remaining}</td>
                      <td><input aria-label={`Ship quantity for ${item.name}`} type="number" min={0} max={item.remaining} disabled={!detail.fulfillable.allowed || item.remaining === 0}
                        className="h-8 w-16 border border-garmin-control px-1.5 tabular-nums focus:border-black focus:outline-none" value={quantities[item.id] ?? ""} onChange={event => setQuantities(current => ({ ...current, [item.id]: event.target.value }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {detail.fulfillable.allowed && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <input aria-label="Carrier" placeholder="Carrier (staff only)" className="h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none" value={carrier} onChange={event => setCarrier(event.target.value)} />
                  <input aria-label="Tracking reference" placeholder="Tracking reference" className="h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none" value={tracking} onChange={event => setTracking(event.target.value)} />
                  <input aria-label="Internal note" placeholder="Internal note (staff only)" className="h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none" value={note} onChange={event => setNote(event.target.value)} />
                  <Button variant="primary" size="md" className="sm:col-span-3" type="button" disabled={busy} onClick={() => void createShipment()}>Create shipment</Button>
                </div>
              )}
              <div>
                <h3 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Shipments</h3>
                {detail.shipments.length === 0 ? <p className="text-sm text-muted-foreground">No shipments yet.</p> : (
                  <ul className="space-y-2">
                    {detail.shipments.map(shipment => (
                      <li key={shipment.id} className="border border-garmin-control p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold">{shipment.status}</span>
                          <span className="text-muted-foreground">{shipment.items.map(line => `${line.quantity}× ${detail.items.find(item => item.id === line.orderItemId)?.name ?? "item"}`).join(", ")}</span>
                          <span className="flex gap-1">
                            {shipment.status === "ready" && <Button variant="outline" size="sm" type="button" disabled={busy || !detail.fulfillable.allowed} onClick={() => void act(shipment, "dispatch")}>Dispatch</Button>}
                            {shipment.status === "ready" && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void act(shipment, "cancel")}>Cancel shipment</Button>}
                            {shipment.status === "dispatched" && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void act(shipment, "deliver")}>Mark delivered</Button>}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Dispatched {formatDate(shipment.dispatchedAt)} · Delivered {formatDate(shipment.deliveredAt)}{shipment.carrier ? ` · ${shipment.carrier}` : ""}{shipment.trackingReference ? ` · ${shipment.trackingReference}` : ""}</p>
                        {shipment.internalNotes && <p className="mt-1 text-sm text-garmin-error">Note: {shipment.internalNotes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(detail.refunds.length > 0 || detail.returns.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h3 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Refunds</h3>
                    <ul className="space-y-1 text-xs">
                      {detail.refunds.map(refund => (
                        <li key={refund.id} className="space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="capitalize">{refund.status}{refund.manual ? " · manual" : ""}</span><span className="whitespace-nowrap tabular-nums">{kzt(refund.amountMinor)}</span>
                          </div>
                          {refund.payoutReference && <p className="text-muted-foreground">Paid out: <span className="tabular-nums">{refund.payoutReference}</span></p>}
                          {refund.manual && ["reserved", "pending", "unknown"].includes(refund.status) && (
                            <div className="flex flex-wrap gap-1">
                              <select aria-label="Payout method" className="h-8 border border-garmin-control px-1.5 focus:border-black focus:outline-none" value={payout[refund.id]?.method ?? "kaspi"}
                                onChange={event => { const method = event.target.value; setPayout(current => ({ ...current, [refund.id]: { reference: current[refund.id]?.reference ?? "", method } })); }}>
                                {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <input aria-label="Payout reference" placeholder="Payout reference" maxLength={120} className="h-8 min-w-0 flex-1 border border-garmin-control px-1.5 focus:border-black focus:outline-none" value={payout[refund.id]?.reference ?? ""}
                                onChange={event => { const reference = event.target.value; setPayout(current => ({ ...current, [refund.id]: { method: current[refund.id]?.method ?? "kaspi", reference } })); }} />
                              <button type="button" disabled={busy} onClick={() => void completeRefund(refund.id)} className="g-btn g-btn--secondary g-btn--sm">Record payout</button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Returns</h3>
                    <ul className="space-y-1 text-xs">
                      {detail.returns.map(entry => <li key={entry.id} className="flex justify-between gap-2"><span className="capitalize">{entry.status}</span><span>{entry.items.reduce((sum, item) => sum + item.quantity, 0)} units · {entry.reason}</span></li>)}
                    </ul>
                  </div>
                </div>
              )}
              <div>
                <h3 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Timeline</h3>
                <ol className="space-y-1 text-xs">
                  {detail.timeline.map(event => (
                    <li key={event.id} className="flex flex-wrap justify-between gap-2">
                      <span>{event.type}{event.visibility === "customer" ? " (customer)" : ""}{event.internalNote ? ` — ${event.internalNote}` : ""}</span>
                      <span className="tabular-nums text-muted-foreground">{formatDate(event.occurredAt)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
