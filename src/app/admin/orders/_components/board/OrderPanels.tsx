"use client";

// Owner 2026-11-25 (plan T4.2): the order drawer's step panels — Pack (one serial per unit of every device, a tick for
// everything else), Ship (carrier and tracking, both optional), serial corrections while packed, and returns that
// name the serial coming back. Every action goes through the screen's post(), which adds the idempotency key and
// reloads the order and the board; the server decides what is allowed.
import { useState } from "react";
import { Check, PackageCheck, RotateCcw, ScanLine, Truck } from "lucide-react";
import type { AdminOrderDetailDTO, ShipmentDTO } from "@/contracts/commerce";
import { Button } from "@/components/admin/ui";
import { returnLines } from "./stage";

type Post = (body: Record<string, unknown>) => Promise<boolean>;
const field = "h-10 w-full border border-garmin-control bg-white px-3 text-sm text-black placeholder:text-[#9a9a9a] focus:border-black focus:outline-none";
const sectionTitle = "flex items-center gap-2 font-sans text-[13px] font-bold uppercase tracking-[0.06em] text-black";

/** Moves focus to the next serial box on Enter (barcode scanners type the serial, then Enter). */
function focusNext(current: HTMLInputElement) {
  const boxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-serial-box]"));
  const next = boxes[boxes.indexOf(current) + 1];
  if (next) next.focus();
}
const mentions = (error: string | null, serial: string) => !!error && !!serial.trim() && error.toUpperCase().includes(serial.trim().replace(/\s/g, "").toUpperCase());

export function PackPanel({ detail, busy, error, post }: { detail: AdminOrderDetailDTO; busy: boolean; error: string | null; post: Post }) {
  const items = detail.items.filter(item => item.remaining > 0);
  const [serials, setSerials] = useState<Record<string, string[]>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const missing = items.reduce((sum, item) => sum + (item.serialRequired
    ? Array.from({ length: item.remaining }, (_, index) => (serials[item.id]?.[index] ?? "").trim()).filter(value => !value).length
    : ticks[item.id] ? 0 : 1), 0);
  if (!items.length) return null;
  const setSerial = (itemId: string, index: number, value: string) =>
    setSerials(current => { const list = [...(current[itemId] ?? [])]; list[index] = value; return { ...current, [itemId]: list }; });
  async function submit() {
    const ok = await post({
      action: "create_shipment", orderId: detail.id, expectedOrderVersion: detail.version,
      lines: items.map(item => ({ orderItemId: item.id, quantity: item.remaining })),
      serials: items.filter(item => item.serialRequired).map(item => ({ orderItemId: item.id, units: Array.from({ length: item.remaining }, (_, index) => (serials[item.id]?.[index] ?? "").trim()) })),
      ...(note.trim() ? { internalNote: note.trim() } : {}),
    });
    if (ok) { setSerials({}); setTicks({}); setNote(""); }
  }
  return (
    <section aria-label="Pack order" className="border border-black bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-garmin-rule bg-[#f7f7f7] px-4 py-3">
        <h3 className={sectionTitle}><PackageCheck className="h-4 w-4" aria-hidden />Pack this order</h3>
        <span className={`text-xs font-medium ${missing ? "text-[#92400e]" : "text-[#166534]"}`}>{missing ? `${missing} left to check` : "Everything checked"}</span>
      </header>
      <ul className="divide-y divide-garmin-rule">
        {items.map(item => (
          <li key={item.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-black">{item.name}{item.sku && <span className="ml-2 text-xs tabular-nums text-muted-foreground">{item.sku}</span>}</p>
              <span className="shrink-0 text-xs text-muted-foreground">× {item.remaining}</span>
            </div>
            {item.serialRequired ? (
              <div className="mt-2 grid gap-2">
                {Array.from({ length: item.remaining }, (_, index) => {
                  const value = serials[item.id]?.[index] ?? "";
                  const clash = mentions(error, value);
                  return (
                    <label key={index} className="grid grid-cols-[auto_1fr] items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex w-24 items-center gap-1.5"><ScanLine className="h-3.5 w-3.5" aria-hidden />Unit {index + 1} of {item.remaining}</span>
                      <input data-serial-box aria-label={`Serial number for ${item.name}, unit ${index + 1} of ${item.remaining}`} aria-invalid={clash || undefined}
                        autoComplete="off" spellCheck={false} maxLength={64} placeholder="Scan or type the serial number" value={value}
                        className={`${field} font-mono tracking-wide ${clash ? "border-garmin-error bg-[#fff5f5]" : value.trim() ? "border-[#166534]" : ""}`}
                        onChange={event => setSerial(item.id, index, event.target.value)}
                        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); focusNext(event.currentTarget); } }} />
                    </label>
                  );
                })}
              </div>
            ) : (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-black">
                <input type="checkbox" className="h-4 w-4 accent-black" checked={!!ticks[item.id]} onChange={event => setTicks(current => ({ ...current, [item.id]: event.target.checked }))} />
                In the box <span className="text-xs text-muted-foreground">· no serial needed</span>
              </label>
            )}
          </li>
        ))}
      </ul>
      <div className="space-y-3 border-t border-garmin-rule px-4 py-3">
        <input aria-label="Internal note" placeholder="Internal note (staff only, optional)" maxLength={1000} className={field} value={note} onChange={event => setNote(event.target.value)} />
        <Button variant="primary" size="md" type="button" className="w-full" disabled={busy || missing > 0} onClick={() => void submit()}>
          <Check className="h-4 w-4" aria-hidden />Mark as packed
        </Button>
      </div>
    </section>
  );
}

export function ShipPanel({ shipment, busy, post }: { shipment: ShipmentDTO; busy: boolean; post: Post }) {
  const [carrier, setCarrier] = useState(shipment.carrier ?? "");
  const [tracking, setTracking] = useState(shipment.trackingReference ?? "");
  return (
    <section aria-label="Ship order" className="border border-black bg-white">
      <header className="border-b border-garmin-rule bg-[#f7f7f7] px-4 py-3"><h3 className={sectionTitle}><Truck className="h-4 w-4" aria-hidden />Hand over to delivery</h3></header>
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">Carrier (optional)<input aria-label="Carrier" maxLength={120} className={`${field} mt-1`} value={carrier} onChange={event => setCarrier(event.target.value)} /></label>
        <label className="text-xs font-medium text-muted-foreground">Tracking number (optional)<input aria-label="Tracking reference" maxLength={120} className={`${field} mt-1 font-mono`} value={tracking} onChange={event => setTracking(event.target.value)} /></label>
        <Button variant="primary" size="md" type="button" className="sm:col-span-2" disabled={busy}
          onClick={() => void post({ action: "dispatch", shipmentId: shipment.id, expectedVersion: shipment.version, ...(carrier.trim() ? { carrier: carrier.trim() } : {}), ...(tracking.trim() ? { trackingReference: tracking.trim() } : {}) })}>
          <Truck className="h-4 w-4" aria-hidden />Mark as shipped
        </Button>
      </div>
    </section>
  );
}

export function DeliverPanel({ shipment, busy, post }: { shipment: ShipmentDTO; busy: boolean; post: Post }) {
  return (
    <section aria-label="Confirm delivery" className="flex flex-wrap items-center justify-between gap-3 border border-black bg-white px-4 py-3">
      <p className="text-sm text-black">Shipped {shipment.dispatchedAt ? new Date(shipment.dispatchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}{shipment.trackingReference ? ` · ${shipment.trackingReference}` : ""}. Did it arrive?</p>
      <Button variant="primary" size="md" type="button" disabled={busy}
        onClick={() => { if (confirm("Confirm the customer received this order?")) void post({ action: "deliver", shipmentId: shipment.id, expectedVersion: shipment.version }); }}>
        <Check className="h-4 w-4" aria-hidden />Mark delivered
      </Button>
    </section>
  );
}

/** Serial corrections while a shipment is packed (ready); locked after it ships. */
export function SerialEditor({ detail, shipment, busy, error, post }: { detail: AdminOrderDetailDTO; shipment: ShipmentDTO; busy: boolean; error: string | null; post: Post }) {
  const lines = shipment.items.filter(line => (line.serials?.length ?? 0) > 0 || detail.items.find(item => item.id === line.orderItemId)?.serialRequired);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  if (shipment.status !== "ready" || !lines.length) return null;
  return (
    <div className="mt-3 space-y-3 border-t border-garmin-rule pt-3">
      {lines.map(line => {
        const name = detail.items.find(item => item.id === line.orderItemId)?.name ?? "Item";
        const current = edits[line.orderItemId] ?? Array.from({ length: line.quantity }, (_, index) => line.serials?.[index]?.serial ?? "");
        const changed = edits[line.orderItemId] !== undefined;
        return (
          <div key={line.orderItemId}>
            <p className="text-xs font-medium text-muted-foreground">{name} — serial numbers{(line.serials?.length ?? 0) === 0 ? " (missing: packed before serials were recorded)" : ""}</p>
            <div className="mt-1 grid gap-1.5">
              {current.map((value, index) => (
                <input key={index} data-serial-box aria-label={`Serial number for ${name}, unit ${index + 1}`} maxLength={64} spellCheck={false} autoComplete="off"
                  className={`h-8 w-full border px-2 font-mono text-[13px] tracking-wide focus:border-black focus:outline-none ${mentions(error, value) ? "border-garmin-error bg-[#fff5f5]" : "border-garmin-control"}`}
                  value={value} onChange={event => { const list = [...current]; list[index] = event.target.value; setEdits(all => ({ ...all, [line.orderItemId]: list })); }} />
              ))}
            </div>
            {changed && (
              <div className="mt-1.5 flex gap-2">
                <Button variant="secondary" size="sm" type="button" disabled={busy || current.some(value => !value.trim())}
                  onClick={() => void post({ action: "set_serials", shipmentId: shipment.id, expectedVersion: shipment.version, orderItemId: line.orderItemId, units: current.map(value => value.trim()) })
                    .then(ok => { if (ok) setEdits(all => { const next = { ...all }; delete next[line.orderItemId]; return next; }); })}>Save serials</Button>
                <Button variant="ghost" size="sm" type="button" onClick={() => setEdits(all => { const next = { ...all }; delete next[line.orderItemId]; return next; })}>Undo</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const RETURN_STATUS: Record<string, string> = { requested: "Requested", authorized: "Approved", received: "Received", inspected: "Inspected", rejected: "Rejected", cancelled: "Cancelled", closed: "Closed" };

/** Returns of shipped units: staff tick the serial(s) coming back; a received return frees the serial for resale. */
export function ReturnsPanel({ detail, busy, post }: { detail: AdminOrderDetailDTO; busy: boolean; post: Post }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const shipped = detail.shipments.filter(shipment => shipment.status === "dispatched" || shipment.status === "delivered");
  const onReturn = new Set(detail.returns.filter(entry => !["rejected", "cancelled"].includes(entry.status)).flatMap(entry => entry.items.flatMap(item => item.serials ?? [])));
  const byItem = new Map<string, { serials: { id: string; serial: string }[]; units: number }>();
  for (const shipment of shipped) for (const line of shipment.items) {
    const entry = byItem.get(line.orderItemId) ?? { serials: [], units: 0 };
    entry.units += line.quantity;
    for (const serial of line.serials ?? []) if (!serial.returned && !onReturn.has(serial.serial)) entry.serials.push(serial);
    byItem.set(line.orderItemId, entry);
  }
  const step = (returnId: string, version: number, returnAction: string, extra: Record<string, unknown> = {}) => post({ action: "update_return", returnId, expectedVersion: version, returnAction, ...extra });
  const [hint, setHint] = useState<string | null>(null);
  async function create() {
    const lines = returnLines(byItem, picked, counts);
    if (!lines.length) { setHint("Pick a serial number or type how many units come back."); return; }
    if (!reason.trim()) { setHint("Write the reason for the return."); return; }
    setHint(null);
    if (await post({ action: "create_return", orderId: detail.id, reason: reason.trim(), lines })) { setOpen(false); setPicked({}); setCounts({}); setReason(""); }
  }
  if (!shipped.length && !detail.returns.length) return null;
  return (
    <section aria-label="Returns" className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-garmin-rule pb-2.5">
        <h3 className={sectionTitle}><RotateCcw className="h-4 w-4" aria-hidden />Returns</h3>
        {shipped.length > 0 && !open && <Button variant="outline" size="sm" type="button" onClick={() => setOpen(true)}>Start a return</Button>}
      </div>
      {open && (
        <div className="space-y-3 border border-garmin-control p-3">
          {[...byItem.entries()].map(([orderItemId, entry]) => {
            const name = detail.items.find(item => item.id === orderItemId)?.name ?? "Item";
            return (
              <div key={orderItemId}>
                <p className="text-sm font-medium">{name}</p>
                {entry.serials.length ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {entry.serials.map(serial => (
                      <label key={serial.id} className={`flex cursor-pointer items-center gap-2 border px-2.5 py-1.5 font-mono text-xs ${picked[serial.id] ? "border-black bg-black text-white" : "border-garmin-control"}`}>
                        <input type="checkbox" className="sr-only" checked={!!picked[serial.id]} onChange={event => setPicked(current => ({ ...current, [serial.id]: event.target.checked }))} />
                        {serial.serial}
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">Units coming back
                    <input type="number" min={0} max={entry.units} aria-label={`Units of ${name} coming back`} className="h-8 w-20 border border-garmin-control px-2 tabular-nums focus:border-black focus:outline-none" value={counts[orderItemId] ?? ""} onChange={event => setCounts(current => ({ ...current, [orderItemId]: event.target.value }))} />
                  </label>
                )}
              </div>
            );
          })}
          <input aria-label="Return reason" placeholder="Reason (e.g. faulty strap sensor)" maxLength={500} className={field} value={reason} onChange={event => setReason(event.target.value)} />
          {hint && <p role="status" className="text-xs text-[#92400e]">{hint}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" type="button" disabled={busy} onClick={() => void create()}>Create return</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {detail.returns.length > 0 && (
        <ul className="space-y-2">
          {detail.returns.map(entry => (
            <li key={entry.id} className="border border-garmin-control p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{RETURN_STATUS[entry.status] ?? entry.status}<span className="ml-2 text-xs font-normal text-muted-foreground">{entry.items.reduce((sum, item) => sum + item.quantity, 0)} unit(s) · {entry.reason}</span></span>
                <span className="flex flex-wrap gap-1">
                  {entry.status === "requested" && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void step(entry.id, entry.version, "authorize")}>Approve</Button>}
                  {entry.status === "authorized" && <Button variant="secondary" size="sm" type="button" disabled={busy}
                    onClick={() => void step(entry.id, entry.version, "receive", { lines: entry.items.map(item => ({ returnItemId: item.id, receivedQuantity: item.quantity })) })}>Mark received</Button>}
                  {(entry.status === "requested" || entry.status === "authorized") && <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => void step(entry.id, entry.version, "reject")}>Reject</Button>}
                </span>
              </div>
              {entry.items.some(item => item.serials?.length) && <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.items.flatMap(item => item.serials ?? []).join(" · ")}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
