/** Garmin badge pills (Badges.spec.md): Published black, Draft gray #D9D9D9, Archived white with a gray rule. */
export const statusPillClass = (status: string) =>
  status === "published"
    ? "bg-black text-white border-black"
    : status === "draft"
      ? "bg-garmin-badge-gray text-black border-garmin-badge-gray"
      : "bg-white text-muted-foreground border-garmin-control";
