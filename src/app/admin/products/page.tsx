import Screen from "./_components/ProductsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminProductsPage() {
  const access = await authorizeAdminPage("catalog:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  return <Screen />;
}
