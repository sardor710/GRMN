import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Status pill from garmin.com `.g__badge` (radius 1.625em, Roboto 400) and its colour variants:
// candy-blue #6DCFF6, lime #CAD54F, gold #F0B800, red #C20F2F, pink #F7607B, gray #D9D9D9, black.
// Badges are pills in both admin control shapes, so this file does not read ./shape.
export type StatusTone = "success" | "info" | "warning" | "danger" | "accent" | "neutral" | "muted" | "dark";

const tones: Record<StatusTone, string> = {
  success: "bg-[#cad54f] text-black border-[#cad54f]",
  info: "bg-[#6dcff6] text-black border-[#6dcff6]",
  warning: "bg-[#f0b800] text-black border-[#f0b800]",
  danger: "bg-[#c20f2f] text-white border-[#c20f2f]",
  accent: "bg-[#f7607b] text-black border-[#f7607b]",
  neutral: "bg-[#d9d9d9] text-black border-[#d9d9d9]",
  muted: "bg-white text-[#595959] border-[#d9d9d9]",
  dark: "bg-black text-white border-black",
};

/** Dot colour used by StatusSelect and compact legends (same palette). */
export const toneDot: Record<StatusTone, string> = {
  success: "bg-[#9aa62a]",
  info: "bg-[#0fb0f0]",
  warning: "bg-[#f0b800]",
  danger: "bg-[#c20f2f]",
  accent: "bg-[#f7607b]",
  neutral: "bg-[#8c8c8c]",
  muted: "bg-white border border-[#8c8c8c]",
  dark: "bg-black",
};

// Every status string the admin shows, mapped once so screens agree on colour.
const STATUS_TONES: Record<string, StatusTone> = {
  published: "success", active: "success", in: "success", paid: "success", delivered: "success", vip: "dark", captured: "success",
  draft: "neutral", inactive: "neutral", pending: "warning", low: "warning", new: "info", processing: "info", shipped: "info",
  archived: "muted", expired: "muted", disabled: "muted", closed: "muted",
  out: "danger", canceled: "danger", cancelled: "danger", suspended: "danger", failed: "danger",
  refunded: "accent", returned: "accent",
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONES[status.toLowerCase()] ?? "neutral";
}

const LABELS: Record<string, string> = { in: "In stock", low: "Low stock", out: "Out of stock" };
export function statusLabel(status: string): string {
  const known = LABELS[status.toLowerCase()];
  if (known) return known;
  return status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "—";
}

export interface StatusBadgeProps {
  /** A status key (published, draft, low, …); picks tone and label unless overridden. */
  status?: string;
  tone?: StatusTone;
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
}

export function StatusBadge({ status = "", tone, size = "sm", className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full border font-sans font-normal",
        size === "sm" ? "px-2.5 py-px text-[12px] leading-[18px]" : "px-3.5 py-1 text-[14px] leading-[21px]",
        tones[tone ?? toneForStatus(status)],
        className,
      )}
    >
      {children ?? statusLabel(status)}
    </span>
  );
}
