import { TrafficScreen } from "./_components/TrafficScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { cmsBackend } from "@/server/cms/source";

// Owner 2026-11-25: Admin ▸ Traffic — clicks by source (platform → format → campaign), visits by day,
// busiest hours and weekdays, most viewed products and devices.
export default async function AdminTrafficPage() {
  const access = await authorizeAdminPage("orders:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  if (cmsBackend() !== "postgres") return <AdminAccessDenied message="Traffic needs the PostgreSQL backend (CMS_BACKEND=postgres)." />;
  return <TrafficScreen />;
}
