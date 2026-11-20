import { badgeClass } from "@/components/ui/badge";

/**
 * Task 3.3: the label on every demo-checkout order (storefront receipt, account orders, admin). The text is "DEMO" in every locale.
 * Task 5a.2: same pill system as product badges (ui/badge), but the `demo` tone (gold, black border, bold uppercase) keeps it
 * an obvious operator label rather than merchandising.
 */
export function DemoBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span data-demo-badge className={badgeClass({ tone: "demo", size: "sm", className: className ? `align-middle ${className}` : "align-middle" })}>
      {label}
    </span>
  );
}
