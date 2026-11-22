import { badgeClass } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Task 3.3: the operator label on demo and sandbox orders, money and report rows. Admin only since 2026-11-22: customers
 * see the candy-blue DemoDot instead and never read "demo". The `demo` tone (gold, dashed black border, bold uppercase)
 * keeps it an obvious operator label; the shape is square like every other admin badge (owner choice A, 2026-11-22).
 */
export function DemoBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span data-demo-badge className={badgeClass({ tone: "demo", size: "sm", className: cn("rounded-none align-middle", className) })}>
      {label}
    </span>
  );
}
