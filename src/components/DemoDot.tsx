import { cn } from "@/lib/utils";

/**
 * Owner 2026-11-22: customers never read "demo". A demo or sandbox order is marked with a garmin.com candy-blue
 * (#6DCFF6) square dot; the label is for assistive technology only and uses the neutral "no payment" wording.
 */
export function DemoDot({ label, className }: { label: string; className?: string }) {
  return <span data-demo-dot role="img" aria-label={label} className={cn("inline-block h-2 w-2 shrink-0 bg-[#6dcff6] align-middle", className)} />;
}
