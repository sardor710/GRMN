import { cn } from "@/lib/utils";

/** Task 3.3: the label on every demo-checkout order (storefront receipt, account orders, admin). The text is "DEMO" in every locale. */
export function DemoBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span data-demo-badge className={cn("inline-block border border-amber-400 bg-amber-50 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wider text-amber-900", className)}>
      {label}
    </span>
  );
}
