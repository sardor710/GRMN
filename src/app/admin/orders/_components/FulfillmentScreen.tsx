"use client";

import { createRequestGate } from "@/lib/admin/dashboard";
import { formatKzt } from "@/lib/money";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AdminOrderDetailDTO, AdminOrderSummaryDTO, ShipmentDTO } from "@/contracts/commerce";
import { DemoBadge } from "@/components/DemoBadge";
import { Button } from "@/components/admin/ui";
import { deliveryAddressLines } from "@/lib/account-client";
import { Archive, CircleAlert, CircleCheck, Clock3, Columns3, List, Search, X } from "lucide-react";
import { ACTION_LABEL, BOARD_COLUMNS, PERIOD_OPTIONS, canDrop, listQuery, nextAction, type BoardPeriod, type BoardStage, type NextAction } from "./board/stage";
import { DeliverPanel, PackPanel, ReturnsPanel, SerialEditor, ShipPanel } from "./board/OrderPanels";

// Task 16A: PostgreSQL-mode staff fulfillment. Every action sends the version it was based on and
// an idempotency key; the server decides eligibility (paid, not an exception, not legacy) and
// records the real timeline. No dates are typed here: milestones use the server clock.
// O07 (Task 21C): staff with payments:confirm confirm a manual payment here (method, reference, the
// amount received, an optional note), and record the payout of a manual refund.
// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, T4.2): a Board (New · Packed · Shipped ·
// Delivered) and a List view, an Archive (delivered orders leave the board at 00:00 Almaty the next day), periods,
// search by order number, customer or serial, and the order opens in a side panel with one clear next step:
// Pack (serial per unit of every device), Ship, Mark delivered.

// Task 3.3: "Demo" finds demo-checkout and sandbox demo-purchase orders (no money was charged).
const MODES = [["", "All payments"], ["live", "Real payments"], ["demo", "Demo orders"]] as const;
/** Demo checkout (Task 3.2) and D03a sandbox demo purchases are both demo money: they carry the DEMO badge. */
const isDemoMode = (mode: string) => mode === "demo" || mode === "sandbox";
const REASONS: Record<string, string> = {
  LEGACY_ORDER: "Imported order from the old site: item operations are not available.",
  ORDER_NOT_PAID: "Not paid yet: the order can be packed once the payment arrives.",
  FULFILLMENT_EXCEPTION: "Fulfillment exception: this order must not ship.",
  ORDER_NOT_SHIPPABLE: "This order cannot ship in its current state.",
};
/** Minor-unit KZT through the shared money formatter ("KZT 8,415.00"): BigInt-exact, no float division. */
const kzt = (amountMinor: string) => formatKzt({ minor: amountMinor }, "en");
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
const shortDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const newKey = () => `ui-${crypto.randomUUID()}`;
const METHODS = [["bank_transfer", "Bank transfer"], ["kaspi", "Kaspi"], ["cash", "Cash"]] as const;
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS);
const majorKzt = (amountMinor: string) => (BigInt(amountMinor) / BigInt(100)).toString() + "." + (BigInt(amountMinor) % BigInt(100)).toString().padStart(2, "0");
/** "8415", "8415.5" or "8415.50" KZT to minor units; null when it is not an amount. */
function minorKzt(value: string): string | null {
  const match = /^(\d{1,13})(?:[.,](\d{1,2}))?$/.exec(value.trim().replace(/[\s ]/g, ""));
  if (!match) return null;
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return minor > BigInt(0) ? minor.toString() : null;
}
const STAGE_LABEL: Record<BoardStage, string> = { new: "New", packed: "Packed", shipped: "Shipped", delivered: "Delivered" };
const STAGE_TONE: Record<BoardStage, string> = { new: "bg-[#f2f2f2] text-black", packed: "bg-[#e8f1f8] text-[#0d5a8c]", shipped: "bg-[#eef6ff] text-[#1e3a8a]", delivered: "bg-[#ecfdf3] text-[#166534]" };
const controlField = "h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none";

/** Payment pill: amber while waiting, green tick once paid, red when it failed or was refunded. */
function PaymentPill({ pill }: { pill: AdminOrderSummaryDTO["paymentPill"] }) {
  if (pill === "paid") return <span data-payment-pill="paid" className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-semibold text-[#166534]"><CircleCheck className="h-3.5 w-3.5" aria-hidden />Paid</span>;
  if (pill === "problem") return <span data-payment-pill="problem" className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-[11px] font-semibold text-[#991b1b]"><CircleAlert className="h-3.5 w-3.5" aria-hidden />Payment failed / refunded</span>;
  return <span data-payment-pill="awaiting" className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-[11px] font-semibold text-[#92400e]"><Clock3 className="h-3.5 w-3.5" aria-hidden />Awaiting payment</span>;
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
  // State slots 0–19 keep their order (unit tests address slot 3 = selected order, slot 4 = its detail).
  const [layout, setLayout] = useState<"board" | "list">("board");
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
  const [, setQuantities] = useState<Record<string, string>>({});
  useState(""); // slot 10 (carrier, now in the Ship panel)
  useState(""); // slot 11 (tracking, now in the Ship panel)
  useState(""); // slot 12 (note, now in the Pack panel)
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
  // Owner 2026-11-25 board state.
  const [view, setView] = useState<"active" | "archive">("active");
  const [period, setPeriod] = useState<BoardPeriod>("all");
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<BoardStage, number> | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [focus, setFocus] = useState<NextAction | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardStage | null>(null);

  const filters = { view, period, from: range.from, to: range.to, q: search, mode };
  const query = listQuery(filters);
  const loadOrders = useCallback(async (cursor?: string | null) => {
    const ticket = queueGate.begin();
    setListError(null);
    try {
      const response = await fetch(`/api/admin/orders?${cursor ? listQuery(filters, cursor) : query}`, { cache: "no-store", signal: ticket.signal });
      if (!response.ok) { const message = await readError(response); if (ticket.isCurrent()) { setListError(message); if (!cursor) setOrders([]); } return; }
      const page = await response.json() as { items: AdminOrderSummaryDTO[]; nextCursor?: string | null; counts?: Record<BoardStage, number> | null };
      if (!ticket.isCurrent()) return;
      setOrders(current => cursor ? [...(current ?? []), ...page.items] : page.items);
      setNextCursor(page.nextCursor ?? null);
      if (!cursor) setCounts(page.counts ?? null);
    } catch (reason) {
      if (!ticket.isCurrent()) return;
      setListError(`The orders could not be loaded: ${reason instanceof Error ? reason.message : String(reason)}`);
      if (!cursor) setOrders([]);
    }
    // `filters` is rebuilt every render; `query` is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, queueGate]);
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
  const selectOrder = (id: string, step: NextAction | null = null) => { setActionError(null); setFocus(step); setSelected(id); };
  const closeOrder = () => { setActionError(null); setFocus(null); setSelected(null); };

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

  const showBoard = layout === "board" && view === "active" && !search;
  const readyShipment = detail?.shipments.find(shipment => shipment.status === "ready") ?? null;
  const dispatchedShipment = detail?.shipments.find(shipment => shipment.status === "dispatched") ?? null;
  const canPack = !!detail && detail.fulfillable.allowed && detail.items.some(item => item.remaining > 0);
  const itemLine = (order: AdminOrderSummaryDTO) => { const names = order.itemNames ?? []; return names.join(", ") + (order.itemsCount > names.length && names.length ? ` +${order.itemsCount - names.length} more` : ""); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="g-heading g-h2 text-black">{view === "archive" ? "Order archive" : "Orders"}</h1>
          <p className="text-sm text-muted-foreground">{view === "archive"
            ? "Delivered orders from earlier days, cancelled, refunded, returned and imported orders."
            : "New → Packed → Shipped → Delivered. Delivered orders move to the archive at midnight."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === "active" && (
            <div role="group" aria-label="Layout" className="inline-flex border border-garmin-control">
              <button type="button" aria-pressed={layout === "board"} onClick={() => setLayout("board")} className={`inline-flex h-10 items-center gap-1.5 px-3.5 text-[13px] font-medium uppercase tracking-[0.04em] ${layout === "board" ? "bg-black text-white" : "bg-white text-black hover:bg-[#f2f2f2]"}`}><Columns3 className="h-4 w-4" aria-hidden />Board</button>
              <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")} className={`inline-flex h-10 items-center gap-1.5 border-l border-garmin-control px-3.5 text-[13px] font-medium uppercase tracking-[0.04em] ${layout === "list" ? "bg-black text-white" : "bg-white text-black hover:bg-[#f2f2f2]"}`}><List className="h-4 w-4" aria-hidden />List</button>
            </div>
          )}
          <Button variant={view === "archive" ? "primary" : "outline"} size="md" type="button" onClick={() => { setView(view === "archive" ? "active" : "archive"); setOrders(null); }}>
            <Archive className="h-4 w-4" aria-hidden />{view === "archive" ? "Back to active orders" : "Archive"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-y border-garmin-rule py-3">
        <div role="search" className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#808080]" aria-hidden />
          <input type="search" aria-label="Search orders" placeholder="Order number, customer, phone or serial number" className={`${controlField} w-full pl-9`}
            value={searchText} onChange={event => { setSearchText(event.target.value); if (!event.target.value) setSearch(""); }}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setSearch(searchText.trim()); } }} />
        </div>
        <select aria-label="Period" className="g-select m-0 h-10 w-44 py-0 text-sm" value={period} onChange={event => setPeriod(event.target.value as BoardPeriod)}>
          {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {period === "custom" && (
          <span className="flex items-center gap-2 text-sm">
            <input type="date" aria-label="From" className={controlField} value={range.from} max={range.to || undefined} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} />
            <span className="text-muted-foreground">–</span>
            <input type="date" aria-label="To" className={controlField} value={range.to} min={range.from || undefined} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} />
          </span>
        )}
        <select aria-label="Payment mode filter" className="g-select m-0 h-10 w-40 py-0 text-sm" value={mode} onChange={event => setMode(event.target.value)}>
          {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {listError && <p role="alert" className="border border-garmin-error p-3 text-sm text-garmin-error">{listError}</p>}
      {actionError && !selected && <p role="alert" data-action-error className="border border-garmin-error p-3 text-sm text-garmin-error">{actionError}</p>}
      {search && <p className="text-sm text-muted-foreground">Results for “{search}” in active and archived orders. <button type="button" className="underline" onClick={() => { setSearch(""); setSearchText(""); }}>Clear search</button></p>}

      {orders === null ? <p className="py-10 text-center text-sm text-muted-foreground">Loading orders…</p> : showBoard ? (
        <section aria-label="Order board" className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {BOARD_COLUMNS.map(column => {
            const cards = orders.filter(order => (order.stage ?? "new") === column.stage);
            const dragged = orders.find(order => order.id === dragging);
            const droppable = !!dragged && canDrop(dragged, column.stage);
            return (
              <div key={column.stage} aria-label={`${column.label} orders`}
                className={`flex min-h-[320px] w-[280px] shrink-0 snap-start flex-col border bg-[#f7f7f7] transition-colors lg:w-auto ${dropTarget === column.stage && droppable ? "border-black bg-[#eef9fe]" : droppable ? "border-dashed border-black" : "border-transparent"}`}
                onDragOver={event => { if (droppable) { event.preventDefault(); setDropTarget(column.stage); } }}
                onDragLeave={() => setDropTarget(current => current === column.stage ? null : current)}
                onDrop={event => { event.preventDefault(); setDropTarget(null); if (dragged && droppable) selectOrder(dragged.id, nextAction(dragged)); setDragging(null); }}>
                <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                  <div>
                    <h2 className="font-sans text-[13px] font-bold uppercase tracking-[0.08em] text-black">{column.label}</h2>
                    <p className="text-[11px] text-muted-foreground">{column.hint}</p>
                  </div>
                  <span className="min-w-7 rounded-full bg-black px-2 py-0.5 text-center text-xs font-bold tabular-nums text-white">{counts?.[column.stage] ?? cards.length}</span>
                </header>
                <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                  {cards.length === 0 && <li className="flex flex-1 items-center justify-center border border-dashed border-[#d9d9d9] p-4 text-center text-xs text-muted-foreground">No orders</li>}
                  {cards.map(order => {
                    const step = nextAction(order);
                    return (
                      <li key={order.id} draggable={!!step} onDragStart={event => { event.dataTransfer.effectAllowed = "move"; setDragging(order.id); }} onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                        className={`group border bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:border-black hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] ${selected === order.id ? "border-black" : "border-[#e5e5e5]"} ${dragging === order.id ? "opacity-50" : ""} ${step ? "cursor-grab active:cursor-grabbing" : ""}`}>
                        <button type="button" onClick={() => selectOrder(order.id)} className="block w-full p-3 text-left">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold tabular-nums text-black">{order.orderNumber}</span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">{shortDate(order.placedAt)}</span>
                          </span>
                          <span className="mt-1 block truncate text-sm text-black">{order.contactName}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={itemLine(order)}>{itemLine(order)}</span>
                          <span className="mt-2 block text-[15px] font-bold tabular-nums text-black">{kzt(order.total.amountMinor)}</span>
                        </button>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f0f0] px-3 py-2">
                          <span className="flex flex-wrap items-center gap-1.5">
                            {order.stage === "new" && <PaymentPill pill={order.paymentPill} />}
                            {order.stage !== "new" && order.paymentPill !== "paid" && <PaymentPill pill={order.paymentPill} />}
                            {isDemoMode(order.paymentMode) && <span className="rounded-full border border-[#d9d9d9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#555]">Demo</span>}
                            {order.fulfillmentStatus === "exception" && <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#991b1b]">Exception</span>}
                            {order.stage === "delivered" && order.deliveredAt && <span className="text-[11px] text-muted-foreground">Delivered {shortDate(order.deliveredAt)}</span>}
                          </span>
                          {step && <Button variant="secondary" size="sm" type="button" onClick={() => selectOrder(order.id, step)}>{ACTION_LABEL[step]}</Button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      ) : orders.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No orders.</p> : (
        <section aria-label="Order list" className="overflow-x-auto border border-garmin-control">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="bg-[#f7f7f7] text-left text-[11px] font-bold uppercase tracking-[0.06em] text-black [&>th]:px-3 [&>th]:py-2.5"><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th className="text-right">Total</th><th>Payment</th><th>Stage</th></tr></thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className={`border-t border-garmin-rule hover:bg-[#fafafa] [&>td]:px-3 [&>td]:py-2.5 ${selected === order.id ? "bg-[#f7f7f7]" : ""}`}>
                  <td><button type="button" onClick={() => selectOrder(order.id)} className="font-bold tabular-nums text-black underline-offset-2 hover:underline">{order.orderNumber}</button>
                    {isDemoMode(order.paymentMode) && <DemoBadge label="DEMO" className="ml-2 text-[10px]" />}
                    {order.legacy && <span className="ml-2 bg-[#f2f2f2] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#555]">Imported</span>}</td>
                  <td className="whitespace-nowrap tabular-nums text-muted-foreground">{shortDate(order.placedAt)}</td>
                  <td className="max-w-[180px] truncate">{order.contactName}</td>
                  <td className="max-w-[220px] truncate text-muted-foreground" title={itemLine(order)}>{itemLine(order)}</td>
                  <td className="whitespace-nowrap text-right font-bold tabular-nums">{kzt(order.total.amountMinor)}</td>
                  <td><PaymentPill pill={order.paymentPill} /></td>
                  <td>{order.status === "cancelled" ? <span className="text-xs font-semibold uppercase text-[#808080]">Cancelled</span>
                    : <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${STAGE_TONE[order.stage]}`}>{STAGE_LABEL[order.stage]}</span>}
                    {order.archived && view === "active" && <span className="ml-1.5 text-[11px] text-muted-foreground">· archived</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextCursor && <div className="border-t border-garmin-rule p-3 text-center"><Button variant="outline" size="sm" type="button" onClick={() => void loadOrders(nextCursor)}>Load more orders</Button></div>}
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Close order" className="absolute inset-0 bg-black/30" onClick={closeOrder} />
          <section aria-label="Order detail" className="relative flex h-full w-full max-w-[640px] flex-col overflow-y-auto bg-white shadow-[-12px_0_32px_rgba(0,0,0,0.18)]">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-garmin-rule bg-white px-5 py-4">
              {detail ? (
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="g-heading g-h4 tabular-nums">{detail.orderNumber}</h2>
                  {detail.status === "cancelled" ? <span className="bg-[#f2f2f2] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#555]">Cancelled</span>
                    : <span data-status-badge className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${STAGE_TONE[detail.stage]}`}>{STAGE_LABEL[detail.stage]}</span>}
                  <PaymentPill pill={detail.paymentPill} />
                  {isDemoMode(detail.paymentMode) && <DemoBadge label={detail.paymentMode === "sandbox" ? "DEMO · SANDBOX" : "DEMO"} className="text-[10px]" />}
                  {detail.legacy && <span className="bg-[#f2f2f2] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#555]">Imported</span>}
                </div>
              ) : <span className="text-sm text-muted-foreground">{detailError ? "" : "Loading order…"}</span>}
              <Button variant="ghost" size="icon-sm" type="button" aria-label="Close" onClick={closeOrder}><X className="h-5 w-5" aria-hidden /></Button>
            </div>
            <div className="space-y-5 px-5 py-5">
              {detailError && <p role="alert" className="border border-garmin-error p-3 text-sm text-garmin-error">{detailError}</p>}
              {actionError && <p role="alert" data-action-error className="border border-garmin-error p-3 text-sm text-garmin-error">{actionError}</p>}
              {detail && (
                <>
                  <p className="text-sm text-muted-foreground">{detail.contactName} · placed {formatDate(detail.placedAt)} · <span className="font-bold text-black tabular-nums">{kzt(detail.total.amountMinor)}</span></p>
                  {!detail.fulfillable.allowed && detail.fulfillable.reason && detail.stage === "new" && detail.status !== "cancelled" && <p className="border border-[#fde68a] bg-[#fffbeb] p-2.5 text-sm text-[#92400e]">{REASONS[detail.fulfillable.reason]}</p>}

                  {canPack && (focus === "pack" || !readyShipment) && <PackPanel key={`pack-${detail.id}-${detail.version}`} detail={detail} busy={busy} error={actionError} post={body => post(body)} />}
                  {readyShipment && <ShipPanel key={`ship-${readyShipment.id}-${readyShipment.version}`} shipment={readyShipment} busy={busy || !detail.fulfillable.allowed} post={body => post(body)} />}
                  {dispatchedShipment && <DeliverPanel shipment={dispatchedShipment} busy={busy} post={body => post(body)} />}

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
                  {deliveryLines(detail.deliveryAddress).length > 0 && (
                    <div className="text-sm">
                      <h3 className="text-xs font-bold uppercase text-muted-foreground">Deliver to</h3>
                      <div className="mt-1 leading-relaxed">{deliveryLines(detail.deliveryAddress).map((line, index) => <p key={index}>{line}</p>)}</div>
                      {detail.contact.email && <p className="text-muted-foreground">{detail.contact.email}</p>}
                    </div>
                  )}
                  <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
                    <thead><tr className="bg-muted text-left text-xs font-bold uppercase tracking-[-0.2px] text-black [&>th]:px-2 [&>th]:py-2"><th>Item</th><th>Qty</th><th>Shipped</th><th>Serial</th></tr></thead>
                    <tbody>
                      {detail.items.map(item => (
                        <tr key={item.id} className="border-t border-garmin-rule [&>td]:px-2">
                          <td className="py-1.5">{item.name}{item.sku ? <span className="ml-1 tabular-nums text-xs text-muted-foreground">{item.sku}</span> : null}</td>
                          <td>{item.quantity}</td><td>{item.shipped}</td>
                          <td className="text-xs text-muted-foreground">{item.serialRequired ? "Needed" : "Not needed"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                  <div>
                    <h3 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Shipments</h3>
                    {detail.shipments.length === 0 ? <p className="text-sm text-muted-foreground">Not packed yet.</p> : (
                      <ul className="space-y-2">
                        {detail.shipments.map(shipment => (
                          <li key={shipment.id} className="border border-garmin-control p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold capitalize">{shipment.status === "ready" ? "Packed" : shipment.status}</span>
                              <span className="text-muted-foreground">{shipment.items.map(line => `${line.quantity}× ${detail.items.find(item => item.id === line.orderItemId)?.name ?? "item"}`).join(", ")}</span>
                              {shipment.status === "ready" && <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => { if (confirm("Unpack this order? Its serial numbers are released.")) void act(shipment, "cancel"); }}>Unpack</Button>}
                            </div>
                            {shipment.status !== "ready" && shipment.items.some(line => line.serials?.length) && (
                              <p className="mt-1 font-mono text-xs text-black">{shipment.items.flatMap(line => (line.serials ?? []).map(serial => serial.serial + (serial.returned ? " (returned)" : ""))).join(" · ")}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">Packed {formatDate(shipment.createdAt)} · Shipped {formatDate(shipment.dispatchedAt)} · Delivered {formatDate(shipment.deliveredAt)}{shipment.carrier ? ` · ${shipment.carrier}` : ""}{shipment.trackingReference ? ` · ${shipment.trackingReference}` : ""}</p>
                            {shipment.internalNotes && <p className="mt-1 text-sm text-garmin-error">Note: {shipment.internalNotes}</p>}
                            <SerialEditor key={`${shipment.id}-${shipment.version}`} detail={detail} shipment={shipment} busy={busy} error={actionError} post={body => post(body)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <ReturnsPanel key={`returns-${detail.id}-${detail.version}-${detail.returns.map(entry => entry.version).join(".")}`} detail={detail} busy={busy} post={body => post(body)} />
                  {detail.refunds.length > 0 && (
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
                  )}
                  {!detail.legacy && detail.status !== "cancelled" && detail.status !== "closed" && (
                    <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void cancelOrder()} className="border-garmin-error text-garmin-error">Cancel order</Button>
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
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
