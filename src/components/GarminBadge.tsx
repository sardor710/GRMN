import { badgeClass, productBadgeLabel, productBadgeTone } from "@/components/ui/badge";

export type BadgeType =
  | "NEW"
  | "CUSTOMIZABLE"
  | "SALE"
  | "BEST SELLER"
  | "LIMITED EDITION"
  | "CARBON EDITION"
  | "GARMIN SIGNATURE"
  | "EXCLUSIVE"
  | "POPULAR"
  | string;

/**
 * A product's stored badge label as garmin.com's single pill (Task 5a.2, Badges.spec.md): `New` / `Sale` in
 * candy-blue, other labels in gray. The old multicolour ribbon and starburst are gone.
 * `variant` only chooses placement: "ribbon" sits over the card image at top/left 16px (`.badge-wrapper`);
 * "pill" and "starburst" render inline.
 */
export function GarminBadge({
  badge,
  variant = "ribbon",
  className = "",
}: {
  badge: string;
  variant?: "ribbon" | "pill" | "starburst";
  className?: string;
}) {
  if (!badge || badge === "NONE") return null;
  return (
    <span
      data-badge={badge.trim().toUpperCase()}
      className={badgeClass({ tone: productBadgeTone(badge), className: variant === "ribbon" ? `absolute left-4 top-4 z-10 ${className}` : className })}
    >
      {productBadgeLabel(badge)}
    </span>
  );
}
