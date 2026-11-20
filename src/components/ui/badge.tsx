import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Task 5a.2: the one badge pill (garmin.com `.g__badge`, docs/research/www.garmin.com/components/Badges.spec.md).
 * Roboto 14/21 400, padding 7px 14px (.5em 1em), radius 22.75px (1.625em), no uppercase, no tracking, no shadow.
 * Product badges are candy-blue `New` / `Sale`. The operator `demo` tone (DemoBadge) keeps the pill shape but has its
 * own colour (--garmin-demo, used by no product tone), a dashed border and bold uppercase text, so it never reads as merchandising.
 */
export type BadgeTone = "candy-blue" | "black" | "red" | "pink" | "lime" | "gold" | "gray" | "demo";

const TONE: Record<BadgeTone, string> = {
  "candy-blue": "bg-garmin-candy-blue text-black",
  black: "bg-black text-white",
  red: "bg-garmin-badge-red text-white",
  pink: "bg-garmin-badge-pink text-black",
  lime: "bg-garmin-badge-lime text-black",
  gold: "bg-garmin-badge-gold text-black",
  gray: "bg-garmin-badge-gray text-black",
  // Operator label, not merchandising: its own colour (no product tone uses it), dashed border, bold uppercase.
  demo: "border border-dashed border-black bg-garmin-demo font-bold uppercase text-black",
};

/** Class string for the pill, for places that cannot render the component (e.g. a CSS-module card). */
export function badgeClass({ tone = "candy-blue", size = "md", className }: { tone?: BadgeTone; size?: "md" | "sm"; className?: string } = {}): string {
  return cn(
    "inline-block w-fit break-words rounded-[1.625em] font-sans",
    size === "md" ? "px-[1em] py-[.5em] text-[14px] leading-[21px]" : "px-[.75em] py-[.125em] text-[12px] leading-[18px]",
    TONE[tone],
    className,
  );
}

export function Badge({ tone = "candy-blue", size = "md", className, children, ...data }: { tone?: BadgeTone; size?: "md" | "sm"; className?: string; children: ReactNode } & { [key: `data-${string}`]: string | boolean | undefined }) {
  return (
    <span {...data} className={badgeClass({ tone, size, className })}>
      {children}
    </span>
  );
}

/** The localized words for the two Garmin product badges (`ProductBadge.new` / `ProductBadge.sale` messages). */
export interface ProductBadgeLabels { new: string; sale: string }

/**
 * Garmin badge wording: `NEW` → `New`, `SALE` → `Sale`; other stored labels become sentence case ("LIMITED EDITION" →
 * "Limited edition"). Final review M17: on the storefront a stored NEW / SALE uses the page's messages (`labels`),
 * like the computed sale badge; other stored labels are the owner's own text and are kept.
 */
export function productBadgeLabel(badge: string, labels?: ProductBadgeLabels): string {
  const text = badge.trim();
  if (!text) return "";
  const key = text.toUpperCase();
  if (labels && key === "NEW") return labels.new;
  if (labels && key === "SALE") return labels.sale;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Garmin shows `New` and `Sale` in candy-blue; any other stored label is kept, in the neutral gray pill. */
export function productBadgeTone(badge: string): BadgeTone {
  const key = badge.trim().toUpperCase();
  return key === "NEW" || key === "SALE" ? "candy-blue" : "gray";
}
