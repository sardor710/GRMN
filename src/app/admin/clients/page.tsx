import Screen from "./_components/ClientsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminClientsPage() {
  const access = await authorizeAdminPage("customers:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  return <Screen />;
}
