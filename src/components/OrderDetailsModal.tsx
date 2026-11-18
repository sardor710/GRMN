"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  X,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  CreditCard,
  Copy,
  Check,
  Calendar,
  Phone,
  Mail,
  User,
  ExternalLink,
  Printer,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import type { Order, OrderMilestone } from "@/lib/cms/types";
import {
  generateOrderMilestones,
  calculateOrderRouteProgress,
  calculateOrderSubtotal,
} from "@/lib/cms/order-lifecycle";
import { formatDateTime, formatMoney } from "@/i18n/format";
import { useAppLocale } from "@/i18n/useAppLocale";

/** Statuses with an `Account.status.*` message (shared with the account order list). */
const ORDER_STATUSES = new Set(["new", "processing", "shipped", "delivered", "canceled", "cancelled", "returned"]);
const PAYMENT_STATUSES = new Set(["paid", "pending", "refunded"]);
const STAGES = new Set(["created", "processing", "shipped", "out_for_delivery", "delivered"]);

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OrderDetailsModal({ order, isOpen, onClose }: OrderDetailsModalProps) {
  const t = useTranslations("OrderDetails");
  const ts = useTranslations("Account.status");
  const locale = useAppLocale();
  // Same ungrouped price look as before ($1099.99); separators follow the locale.
  const money = (n: number) => formatMoney(n, locale, "USD", { grouping: false });
  const when = (iso?: string) => formatDateTime(iso, locale) || t("notAvailable");
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [copiedOrderNum, setCopiedOrderNum] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !order) return null;

  const milestones: OrderMilestone[] =
    order.milestones && order.milestones.length === 5
      ? order.milestones
      : generateOrderMilestones(order);

  const progressPercent = calculateOrderRouteProgress(order.fulfillmentStatus);
  const subtotal = calculateOrderSubtotal(order.items);
  const isCanceled = order.fulfillmentStatus === "canceled" || order.fulfillmentStatus === "cancelled";
  const carrier = order.carrier || "Garmin Express Priority";
  const milestoneLabel = (m: OrderMilestone) => (STAGES.has(m.stage) ? t(`milestones.${m.stage}.label`) : m.label);
  const milestoneDescription = (m: OrderMilestone) =>
    STAGES.has(m.stage)
      ? t(`milestones.${m.stage}.description`, { carrier, tracking: order.trackingNumber || "GRM-TRK-PENDING" })
      : m.description;

  const handleCopyOrderNum = () => {
    if (!order.orderNumber) return;
    navigator.clipboard?.writeText(order.orderNumber);
    setCopiedOrderNum(true);
    setTimeout(() => setCopiedOrderNum(false), 2000);
  };

  const handleCopyTracking = () => {
    if (!order.trackingNumber) return;
    navigator.clipboard?.writeText(order.trackingNumber);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white border border-neutral-300 shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-900 px-6 py-4 text-white">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center bg-[#007cc3] text-white">
              <Package className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="order-details-title" className="text-lg font-bold tracking-tight text-white font-heading uppercase">
                  {t("title", { number: order.orderNumber || order.id })}
                </h2>
                <button
                  type="button"
                  onClick={handleCopyOrderNum}
                  title={t("copyNumber")}
                  className="text-neutral-400 hover:text-white transition-colors p-1"
                >
                  {copiedOrderNum ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="text-xs text-neutral-400 font-mono">
                {t("reference", { id: order.id, date: when(order.createdAt) })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                order.fulfillmentStatus === "delivered"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : order.fulfillmentStatus === "shipped"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : order.fulfillmentStatus === "processing"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : isCanceled
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-neutral-700 text-neutral-200 border border-neutral-600"
              }`}
            >
              {ORDER_STATUSES.has(order.fulfillmentStatus) ? ts(order.fulfillmentStatus) : order.fulfillmentStatus}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1.5 transition-colors focus:outline-none"
              aria-label={t("close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* MODAL SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ROUTE MAP: PROCESS FROM CREATION UNTIL DELIVERED */}
          <div className="border border-neutral-200 bg-neutral-50/70 p-5 rounded-none">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 pb-3 mb-5">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#007cc3]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-black">
                  {t("routeMap")}
                </h3>
              </div>
              <div className="text-xs text-neutral-500 font-mono">
                {t.rich("carrier", { carrier, b: (chunks) => <span className="font-semibold text-black">{chunks}</span> })}
                {order.trackingNumber && (
                  <>
                    {" · "}
                    <span>{t("tracking")} </span>
                    <button
                      type="button"
                      onClick={handleCopyTracking}
                      className="font-semibold text-[#007cc3] hover:underline inline-flex items-center gap-1"
                    >
                      <span>{order.trackingNumber}</span>
                      {copiedTracking ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {isCanceled ? (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{t("canceled")}</span>
              </div>
            ) : (
              <div>
                {/* Horizontal Progress Bar Track (Desktop) */}
                <div className="relative mb-6 hidden md:block">
                  <div className="absolute top-4 left-6 right-6 h-1 bg-neutral-200 -z-0">
                    <div
                      className="h-full bg-[#007cc3] transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-5 relative z-10">
                    {milestones.map((m, idx) => (
                      <div key={idx} className="flex flex-col items-center text-center px-1">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                            m.completed
                              ? "border-[#007cc3] bg-[#007cc3] text-white"
                              : m.current
                              ? "border-[#007cc3] bg-white text-[#007cc3] ring-4 ring-[#007cc3]/20"
                              : "border-neutral-300 bg-white text-neutral-400"
                          }`}
                        >
                          {m.completed ? (
                            <Check className="h-4 w-4 stroke-[3]" />
                          ) : (
                            <span className="text-[11px] font-bold">{idx + 1}</span>
                          )}
                        </div>
                        <p
                          className={`mt-2 text-xs font-semibold uppercase tracking-wider ${
                            m.completed || m.current ? "text-black" : "text-neutral-400"
                          }`}
                        >
                          {milestoneLabel(m)}
                        </p>
                        <p className="text-[11px] text-neutral-500 font-mono mt-0.5">
                          {when(m.date)}
                        </p>
                        {m.location && (
                          <p className="text-[10px] text-neutral-400 truncate max-w-[130px] mt-0.5">
                            {m.location}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vertical Timeline (Mobile) */}
                <div className="space-y-4 md:hidden">
                  {milestones.map((m, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 mt-0.5 ${
                          m.completed
                            ? "border-[#007cc3] bg-[#007cc3] text-white"
                            : m.current
                            ? "border-[#007cc3] bg-white text-[#007cc3] ring-2 ring-[#007cc3]/20"
                            : "border-neutral-300 bg-white text-neutral-400"
                        }`}
                      >
                        {m.completed ? (
                          <Check className="h-3 w-3 stroke-[3]" />
                        ) : (
                          <span className="text-[10px] font-bold">{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 pb-3 border-b border-neutral-200">
                        <div className="flex items-center justify-between">
                          <p
                            className={`text-xs font-semibold uppercase ${
                              m.completed || m.current ? "text-black" : "text-neutral-400"
                            }`}
                          >
                            {milestoneLabel(m)}
                          </p>
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {when(m.date)}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-600 mt-0.5">{milestoneDescription(m)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PRODUCTS INCLUDED IN THIS ORDER */}
          <div>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                <Package className="h-4 w-4 text-[#007cc3]" />
                {t("products", { count: order.items?.length || 0 })}
              </h3>
              <span className="text-xs text-neutral-500 font-mono">
                {t("itemsTotal", { amount: money(subtotal) })}
              </span>
            </div>

            <div className="border border-neutral-200 divide-y divide-neutral-100 bg-white">
              {order.items && order.items.length > 0 ? (
                order.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-16 shrink-0 bg-neutral-50 border border-neutral-200 p-1 flex items-center justify-center">
                        <Image
                          src={item.image || "/images/products/1228429.jpg"}
                          alt={item.name}
                          width={60}
                          height={60}
                          className="object-contain max-h-full max-w-full"
                        />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-black">{item.name}</h4>
                        <p className="text-xs text-neutral-400 font-mono mt-0.5">
                          {t("sku", { id: item.productId })}
                        </p>
                        <p className="text-xs text-neutral-600 mt-1">
                          {t.rich("qty", {
                            quantity: item.quantity,
                            price: money(item.price || 0),
                            b: (chunks) => <span className="font-semibold text-black">{chunks}</span>,
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="text-right sm:self-center">
                      <span className="text-xs text-neutral-400 block font-mono">{t("lineTotal")}</span>
                      <span className="g-heading text-base font-semibold text-black">
                        {money((item.price || 0) * (item.quantity || 1))}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-neutral-500">
                  {t("noItems")}
                </div>
              )}
            </div>
          </div>

          {/* SHIPPING & PAYMENT DETAILS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Delivery & Shipping Address */}
            <div className="border border-neutral-200 bg-white p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-black border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-[#007cc3]" />
                {t("shippingHeading")}
              </h4>
              <div className="text-xs space-y-1.5 pt-1">
                <p className="font-semibold text-black flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-neutral-400" />
                  <span>{order.clientName}</span>
                </p>
                <p className="text-neutral-700 flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                  <span>{order.shippingAddress}</span>
                </p>
                {order.clientPhone && (
                  <p className="text-neutral-600 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-neutral-400" />
                    <span>{order.clientPhone}</span>
                  </p>
                )}
                {order.clientEmail && (
                  <p className="text-neutral-600 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="font-mono text-[11px]">{order.clientEmail}</span>
                  </p>
                )}
                {order.comments && (
                  <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 italic">
                    {t("note", { comments: order.comments })}
                  </div>
                )}
              </div>
            </div>

            {/* Payment Summary */}
            <div className="border border-neutral-200 bg-white p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-black border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-[#007cc3]" />
                {t("paymentHeading")}
              </h4>
              <div className="text-xs space-y-2 pt-1">
                <div className="flex items-center justify-between text-neutral-600">
                  <span>{t("paymentStatus")}</span>
                  <span className="font-semibold uppercase tracking-wider px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {PAYMENT_STATUSES.has(order.paymentStatus) ? t(`payment.${order.paymentStatus}`) : order.paymentStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-600">
                  <span>{t("paymentMethod")}</span>
                  <span className="font-medium text-black">{t("paymentMethodValue")}</span>
                </div>
                <div className="flex items-center justify-between text-neutral-600">
                  <span>{t("subtotal")}</span>
                  <span className="font-mono text-black">{money(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-neutral-600">
                  <span>{t("shipping")}</span>
                  <span className="text-emerald-700 font-semibold">{t("freeShipping")}</span>
                </div>
                <div className="pt-2 border-t border-neutral-200 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-black">
                    {t("grandTotal")}
                  </span>
                  <span className="g-heading text-lg font-bold text-black">
                    {money(order.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-6 py-3.5">
          <div className="text-xs text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>{t("certified")}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{t("print")}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-black hover:bg-neutral-800 text-white px-5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
            >
              {t("closeButton")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
