import { GarminBadge } from "@/components/GarminBadge";
import type { ProductBadgeLabels } from "@/components/ui/badge";

export function StarburstBadge({ label, className, labels }: { label: string; className?: string; labels?: ProductBadgeLabels }) {
  if (!label) return null;
  return <GarminBadge badge={label} variant="starburst" className={className} labels={labels} />;
}
