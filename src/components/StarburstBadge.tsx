import { GarminBadge } from "@/components/GarminBadge";

export function StarburstBadge({ label, className }: { label: string; className?: string }) {
  if (!label) return null;
  return <GarminBadge badge={label} variant="starburst" className={className} />;
}
