// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, T5.1): the customer's order tracker.
// Ordered → Packed → Shipped → Delivered with icons. Every reached step lights up in Garmin cyan (#6DCFF6) and the
// line along the way already travelled is cyan; the way ahead is grey. A cancelled order shows the tracker stopped
// (nothing lit) with a short note. Labels and dates come from the caller (EN/RU/KK through next-intl).
import { House, PackageCheck, ReceiptText, Truck } from "lucide-react";
import type { OrderStage } from "@/contracts/commerce";

export interface TrackerLabels { ordered: string; packed: string; shipped: string; delivered: string; cancelled: string; cancelledNote: string; progress: string }
export interface StageDates { ordered: string; packed: string | null; shipped: string | null; delivered: string | null }
type Step = "ordered" | "packed" | "shipped" | "delivered";

const STEPS: readonly { key: Step; Icon: typeof Truck }[] = [
  { key: "ordered", Icon: ReceiptText }, { key: "packed", Icon: PackageCheck }, { key: "shipped", Icon: Truck }, { key: "delivered", Icon: House },
];
const REACHED: Record<OrderStage, number> = { ordered: 0, packed: 1, shipped: 2, delivered: 3, cancelled: -1 };

export function OrderTracker({ stage, dates, compact = false, labels, formatDate }: {
  stage: OrderStage; dates?: StageDates; compact?: boolean; labels: TrackerLabels; formatDate?: (iso: string) => string;
}) {
  const reached = REACHED[stage] ?? 0;
  const circle = compact ? "h-7 w-7" : "h-11 w-11";
  const icon = compact ? "h-3.5 w-3.5" : "h-5 w-5";
  const lineTop = compact ? "top-[13px]" : "top-[21px]";
  return (
    <div className={compact ? "w-full" : "w-full py-1"}>
      <ol aria-label={labels.progress} className="flex w-full items-start">
        {STEPS.map(({ key, Icon }, index) => {
          const done = index <= reached, current = index === reached;
          const date = dates?.[key];
          return (
            <li key={key} data-step={key} data-done={done} aria-current={current ? "step" : undefined} className="relative flex flex-1 flex-col items-center text-center">
              {index > 0 && (
                <span aria-hidden data-line data-passed={done}
                  className={`absolute ${lineTop} right-1/2 h-[3px] w-full -translate-y-1/2 ${done ? "bg-[#6DCFF6]" : "bg-[#e3e3e3]"}`} />
              )}
              <span className={`relative z-10 flex ${circle} items-center justify-center rounded-full transition-colors ${done
                ? `bg-[#6DCFF6] text-black ${current && stage !== "delivered" ? "shadow-[0_0_0_5px_rgba(109,207,246,0.28)]" : ""}`
                : "border-2 border-[#d9d9d9] bg-white text-[#a3a3a3]"}`}>
                <Icon className={icon} aria-hidden />
              </span>
              <span className={`mt-1.5 leading-tight ${compact ? "text-[10px]" : "text-[12px]"} ${done ? "font-bold text-black" : "font-medium text-[#8a8a8a]"} ${current ? "uppercase tracking-[0.04em]" : ""}`}>{labels[key]}</span>
              {!compact && date && done && formatDate && <span className="mt-0.5 font-mono text-[10px] text-neutral-500">{formatDate(date)}</span>}
            </li>
          );
        })}
      </ol>
      {stage === "cancelled" && (
        <p className={`mt-2 text-center ${compact ? "text-[11px]" : "text-[12px]"} font-medium text-neutral-500`}>
          <span className="mr-1.5 bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-700">{labels.cancelled}</span>{labels.cancelledNote}
        </p>
      )}
    </div>
  );
}
