import Screen from "./_components/OrdersScreen";
import FulfillmentScreen from "./_components/FulfillmentScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { cmsBackend } from "@/server/cms/source";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminOrdersPage() {
  const access = await authorizeAdminPage("orders:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  // PostgreSQL mode: the fulfillment service (Task 16A). Legacy mode keeps the JSON order screen.
  return cmsBackend() === "postgres" ? <FulfillmentScreen /> : <Screen />;
}
