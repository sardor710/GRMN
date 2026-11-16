import Screen from "./_components/OrdersScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminOrdersPage() {
  const access = await authorizeAdminPage("orders:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  return <Screen />;
}
