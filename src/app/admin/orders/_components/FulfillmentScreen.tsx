"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminOrderDetailDTO, AdminOrderSummaryDTO, ShipmentDTO } from "@/contracts/commerce";
import { DemoBadge } from "@/components/DemoBadge";

// Task 16A: PostgreSQL-mode staff fulfillment. Every action sends the version it was based on and
// an idempotency key; the server decides eligibility (paid, not an exception, not legacy) and
// records the real timeline. No dates are typed here: milestones use the server clock.
// O07 (Task 21C): staff with payments:confirm confirm a manual payment here (method, reference, the
// amount received, an optional note), and record the payout of a manual refund.

const STATUSES = ["", "unfulfilled", "processing", "partially_shipped", "shipped", "delivered", "exception"] as const;
// Task 3.3: "Demo" finds demo-checkout orders (no money was charged) so stray ones can be cancelled.
const MODES = [["", "All"], ["demo", "Demo"], ["live", "Live"]] as const;
const REASONS: Record<string, string> = {
  LEGACY_ORDER: "Legacy summary order: item operations are not available.",
  ORDER_NOT_PAID: "Not paid: only captured orders can ship.",
  FULFILLMENT_EXCEPTION: "Fulfillment exception: this order must not ship.",
  ORDER_NOT_SHIPPABLE: "This order cannot ship in its current state.",
};
const formatKzt = (amountMinor: string) => `${(Number(amountMinor) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KZT`;
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

async function readError(response: Response): Promise<string> {
  try { const body = await response.json() as { error?: { message?: string; code?: string }; message?: string }; return body.error?.message ?? body.message ?? `Request failed (${response.status})`; }
  catch { return `Request failed (${response.status})`; }
}

export default function FulfillmentScreen() {
  const [status, setStatus] = useState<string>("");
  const [mode, setMode] = useState<string>("");
  const [orders, setOrders] = useState<AdminOrderSummaryDTO[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [payMethod, setPayMethod] = useState<string>("kaspi");
  const [payReference, setPayReference] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const detailId = useRef<string | null>(null);
  const [payNote, setPayNote] = useState("");
  const [payout, setPayout] = useState<Record<string, { method: string; reference: string }>>({});

  const loadOrders = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams();
    if (status) query.set("fulfillmentStatus", status);
    if (mode) query.set("paymentMode", mode);
    const response = await fetch("/api/admin/orders" + (query.size ? `?${query}` : ""), { cache: "no-store" });
    if (!response.ok) { setError(await readError(response)); setOrders([]); return; }
    setOrders((await response.json() as { items: AdminOrderSummaryDTO[] }).items);
  }, [status, mode]);
  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/admin/orders?id=${id}`, { cache: "no-store" });
    if (!response.ok) { setError(await readError(response)); return; }
    const next = await response.json() as AdminOrderDetailDTO;
    setDetail(next);
    setQuantities({});
    // Review I1: never prefilled. Staff type the amount that actually arrived; the server refuses
    // anything but the order total, so a short payment cannot be confirmed by just entering a reference.
    setPayAmount(previous => previous && next.id === detailId.current ? previous : "");
    detailId.current = next.id;
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => { if (selected) void loadDetail(selected); else setDetail(null); }, [selected, loadDetail]);

  // The manual payment actions are keyed by their reference instead of an idempotency key.
  async function post(body: Record<string, unknown>, keyed = true) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(keyed ? { ...body, idempotencyKey: newKey() } : body) });
      if (!response.ok) { setError(await readError(response)); return false; }
      return true;
    } finally {
      setBusy(false);
      if (selected) await loadDetail(selected);
      await loadOrders();
    }
  }
  async function createShipment() {
    if (!detail) return;
    const lines = Object.entries(quantities).map(([orderItemId, value]) => ({ orderItemId, quantity: Number(value) })).filter(line => Number.isInteger(line.quantity) && line.quantity > 0);
    if (!lines.length) { setError("Enter a quantity to ship."); return; }
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
    if (!payReference.trim()) { setError("Enter the payment reference."); return; }
    if (!amountMinor) { setError("Enter the amount received in KZT."); return; }
    const ok = await post({ action: "confirm_payment", orderId: detail.id, method: payMethod, reference: payReference.trim(), amountMinor, ...(payNote.trim() ? { note: payNote.trim() } : {}) }, false);
    if (ok) { setPayReference(""); setPayNote(""); setPayAmount(""); }
  }
  async function completeRefund(refundId: string) {
    const entry = payout[refundId] ?? { method: "kaspi", reference: "" };
    if (!entry.reference.trim()) { setError("Enter the payout reference."); return; }
    const ok = await post({ action: "complete_manual_refund", refundId, method: entry.method, reference: entry.reference.trim() }, false);
    if (ok) setPayout(current => { const next = { ...current }; delete next[refundId]; return next; });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Orders and fulfillment</h1>
          <p className="text-sm text-neutral-500">Ship paid orders in parts; every action is recorded in the order timeline.</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-neutral-700">Payment{" "}
            <select aria-label="Payment mode filter" className="ml-2 border border-neutral-300 px-2 py-1" value={mode} onChange={event => setMode(event.target.value)}>
              {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm text-neutral-700">Fulfillment status{" "}
            <select aria-label="Fulfillment status filter" className="ml-2 border border-neutral-300 px-2 py-1" value={status} onChange={event => setStatus(event.target.value)}>
              {STATUSES.map(value => <option key={value} value={value}>{value || "All"}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Order queue" className="border border-neutral-200">
          {orders === null ? <p className="p-4 text-sm text-neutral-500">Loading orders…</p> : orders.length === 0 ? <p className="p-4 text-sm text-neutral-500">No orders.</p> : (
            <ul className="divide-y divide-neutral-200">
              {orders.map(order => (
                <li key={order.id}>
                  <button type="button" onClick={() => setSelected(order.id)} className={`flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-neutral-50 ${selected === order.id ? "bg-neutral-100" : ""}`}>
                    <span className="flex items-center gap-2"><span className="font-mono font-semibold">{order.orderNumber}</span>{order.paymentMode === "demo" && <DemoBadge label="DEMO" className="text-[10px]" />}</span>
                    <span className="text-neutral-600">{order.contactName}</span>
                    <span className="text-xs uppercase tracking-wider text-neutral-500">{order.paymentStatus} · {order.fulfillmentStatus}{order.dataQuality !== "complete" ? " · legacy" : ""}</span>
                    <span>{formatKzt(order.total.amountMinor)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Order detail" className="border border-neutral-200 p-4">
          {!detail ? <p className="text-sm text-neutral-500">Select an order.</p> : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-lg font-bold">{detail.orderNumber}</h2>
                <span className="border px-2 py-0.5 text-[10px] font-bold uppercase">{detail.status}</span>
                <span className="border px-2 py-0.5 text-[10px] font-bold uppercase">{detail.paymentStatus}</span>
                <span className="border px-2 py-0.5 text-[10px] font-bold uppercase">{detail.fulfillmentStatus}</span>
                {detail.paymentMode === "demo" ? <DemoBadge label="DEMO" className="text-[10px]" /> : <span className="border px-2 py-0.5 text-[10px] font-bold uppercase">{detail.paymentMode}</span>}
              </div>
              {!detail.fulfillable.allowed && detail.fulfillable.reason && <p className="border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">{REASONS[detail.fulfillable.reason]}</p>}
              <div aria-label="Payment" className="border border-neutral-200 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">Payment</h3>
                <p className="text-sm">
                  {detail.payment.method === "manual" ? "Manual payment" : detail.payment.method === "demo" ? "Demo (no money is taken)" : detail.payment.method ?? "—"}
                  {" · "}{formatKzt(detail.total.amountMinor)}
                </p>
                {detail.payment.confirmation && (
                  <p className="mt-1 text-sm text-neutral-700">
                    Confirmed {formatDate(detail.payment.confirmation.confirmedAt)}: {METHOD_LABEL[detail.payment.confirmation.method] ?? detail.payment.confirmation.method}, reference{" "}
                    <span className="font-mono">{detail.payment.confirmation.reference}</span>, {formatKzt(detail.payment.confirmation.amountMinor)}
                    {detail.payment.confirmation.note ? ` — ${detail.payment.confirmation.note}` : ""}
                  </p>
                )}
                {detail.payment.confirmable && (
                  <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void confirmPayment(); }}>
                    <label className="text-xs text-neutral-700">Method
                      <select name="paymentMethod" className="mt-1 w-full border border-neutral-300 px-2 py-1 text-sm" value={payMethod} onChange={event => setPayMethod(event.target.value)}>
                        {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-neutral-700">Reference
                      <input name="paymentReference" required maxLength={120} placeholder="Bank or Kaspi reference, receipt number" className="mt-1 w-full border border-neutral-300 px-2 py-1 text-sm" value={payReference} onChange={event => setPayReference(event.target.value)} />
                    </label>
                    <label className="text-xs text-neutral-700">Amount received (KZT) · expected {majorKzt(detail.total.amountMinor)}
                      <input name="paymentAmount" required inputMode="decimal" placeholder="Type the amount that arrived" className="mt-1 w-full border border-neutral-300 px-2 py-1 text-sm" value={payAmount} onChange={event => setPayAmount(event.target.value)} />
                    </label>
                    <label className="text-xs text-neutral-700">Note (optional)
                      <input name="paymentNote" maxLength={1000} className="mt-1 w-full border border-neutral-300 px-2 py-1 text-sm" value={payNote} onChange={event => setPayNote(event.target.value)} />
                    </label>
                    <button type="submit" disabled={busy} className="bg-black px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 sm:col-span-2">Confirm payment</button>
                  </form>
                )}
              </div>
              {!detail.legacy && detail.status !== "cancelled" && detail.status !== "closed" && (
                <button type="button" disabled={busy} onClick={() => void cancelOrder()} className="border border-red-700 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-800 disabled:opacity-50">Cancel order</button>
              )}
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-neutral-500"><th>Item</th><th>Ordered</th><th>Shipped</th><th>Left</th><th>Ship now</th></tr></thead>
                <tbody>
                  {detail.items.map(item => (
                    <tr key={item.id} className="border-t border-neutral-100">
                      <td className="py-1.5">{item.name}{item.sku ? <span className="ml-1 font-mono text-xs text-neutral-500">{item.sku}</span> : null}</td>
                      <td>{item.quantity}</td><td>{item.shipped}</td><td>{item.remaining}</td>
                      <td><input aria-label={`Ship quantity for ${item.name}`} type="number" min={0} max={item.remaining} disabled={!detail.fulfillable.allowed || item.remaining === 0}
                        className="w-16 border border-neutral-300 px-1" value={quantities[item.id] ?? ""} onChange={event => setQuantities(current => ({ ...current, [item.id]: event.target.value }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.fulfillable.allowed && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <input aria-label="Carrier" placeholder="Carrier (staff only)" className="border border-neutral-300 px-2 py-1 text-sm" value={carrier} onChange={event => setCarrier(event.target.value)} />
                  <input aria-label="Tracking reference" placeholder="Tracking reference" className="border border-neutral-300 px-2 py-1 text-sm" value={tracking} onChange={event => setTracking(event.target.value)} />
                  <input aria-label="Internal note" placeholder="Internal note (staff only)" className="border border-neutral-300 px-2 py-1 text-sm" value={note} onChange={event => setNote(event.target.value)} />
                  <button type="button" disabled={busy} onClick={() => void createShipment()} className="bg-black px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 sm:col-span-3">Create shipment</button>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">Shipments</h3>
                {detail.shipments.length === 0 ? <p className="text-sm text-neutral-500">No shipments yet.</p> : (
                  <ul className="space-y-2">
                    {detail.shipments.map(shipment => (
                      <li key={shipment.id} className="border border-neutral-200 p-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold uppercase">{shipment.status}</span>
                          <span className="text-neutral-600">{shipment.items.map(line => `${line.quantity}× ${detail.items.find(item => item.id === line.orderItemId)?.name ?? "item"}`).join(", ")}</span>
                          <span className="flex gap-1">
                            {shipment.status === "ready" && <button type="button" disabled={busy || !detail.fulfillable.allowed} onClick={() => void act(shipment, "dispatch")} className="border border-black px-2 py-0.5 text-xs font-bold uppercase disabled:opacity-50">Dispatch</button>}
                            {shipment.status === "ready" && <button type="button" disabled={busy} onClick={() => void act(shipment, "cancel")} className="border border-neutral-400 px-2 py-0.5 text-xs font-bold uppercase disabled:opacity-50">Cancel shipment</button>}
                            {shipment.status === "dispatched" && <button type="button" disabled={busy} onClick={() => void act(shipment, "deliver")} className="border border-black px-2 py-0.5 text-xs font-bold uppercase disabled:opacity-50">Mark delivered</button>}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">Dispatched {formatDate(shipment.dispatchedAt)} · Delivered {formatDate(shipment.deliveredAt)}{shipment.carrier ? ` · ${shipment.carrier}` : ""}{shipment.trackingReference ? ` · ${shipment.trackingReference}` : ""}</p>
                        {shipment.internalNotes && <p className="mt-1 text-xs text-amber-800">Note: {shipment.internalNotes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(detail.refunds.length > 0 || detail.returns.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">Refunds</h3>
                    <ul className="space-y-1 text-xs">
                      {detail.refunds.map(refund => (
                        <li key={refund.id} className="space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="uppercase">{refund.status}{refund.manual ? " · manual" : ""}</span><span>{formatKzt(refund.amountMinor)}</span>
                          </div>
                          {refund.payoutReference && <p className="text-neutral-500">Paid out: <span className="font-mono">{refund.payoutReference}</span></p>}
                          {refund.manual && ["reserved", "pending", "unknown"].includes(refund.status) && (
                            <div className="flex flex-wrap gap-1">
                              <select aria-label="Payout method" className="border border-neutral-300 px-1" value={payout[refund.id]?.method ?? "kaspi"}
                                onChange={event => { const method = event.target.value; setPayout(current => ({ ...current, [refund.id]: { reference: current[refund.id]?.reference ?? "", method } })); }}>
                                {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <input aria-label="Payout reference" placeholder="Payout reference" maxLength={120} className="min-w-0 flex-1 border border-neutral-300 px-1" value={payout[refund.id]?.reference ?? ""}
                                onChange={event => { const reference = event.target.value; setPayout(current => ({ ...current, [refund.id]: { method: current[refund.id]?.method ?? "kaspi", reference } })); }} />
                              <button type="button" disabled={busy} onClick={() => void completeRefund(refund.id)} className="border border-black px-2 font-bold uppercase disabled:opacity-50">Record payout</button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">Returns</h3>
                    <ul className="space-y-1 text-xs">
                      {detail.returns.map(entry => <li key={entry.id} className="flex justify-between gap-2"><span className="uppercase">{entry.status}</span><span>{entry.items.reduce((sum, item) => sum + item.quantity, 0)} units · {entry.reason}</span></li>)}
                    </ul>
                  </div>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">Timeline</h3>
                <ol className="space-y-1 text-xs">
                  {detail.timeline.map(event => (
                    <li key={event.id} className="flex flex-wrap justify-between gap-2">
                      <span>{event.type}{event.visibility === "customer" ? " (customer)" : ""}{event.internalNote ? ` — ${event.internalNote}` : ""}</span>
                      <span className="font-mono text-neutral-500">{formatDate(event.occurredAt)}</span>
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
