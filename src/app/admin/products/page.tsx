import Screen from "./_components/ProductsScreen";
import PostgresScreen from "./_components/PostgresProductsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { cmsBackend } from "@/server/cms/source";

export default async function AdminProductsPage() {
  const access = await authorizeAdminPage("catalog:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  // The legacy JSON CMS has the options/variants editor; PostgreSQL uses the catalog service screen.
  return cmsBackend() === "postgres" ? <PostgresScreen /> : <Screen />;
}
