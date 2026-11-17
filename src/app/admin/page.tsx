import Screen from "./_components/DashboardScreen";
import ReportsScreen from "./_components/ReportsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { cmsBackend } from "@/server/cms/source";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminDashboardPage() {
  const access = await authorizeAdminPage();
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  // PostgreSQL mode: SQL summaries, exports and the low-stock restock list (Task 18B). The legacy
  // dashboard aggregates the JSON store in the browser and stays for legacy mode only.
  return cmsBackend() === "postgres" ? <ReportsScreen /> : <Screen />;
}
