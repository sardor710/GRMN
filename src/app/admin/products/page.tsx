import Screen from "./_components/ProductsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminProductsPage() {
  const access = await authorizeAdminPage("catalog:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  // One editor for both stores: options/variants, photos, the garmin.com importer and translations.
  // On PostgreSQL the save projects the document into the commerce tables (server/cms/product-projection).
  return <Screen />;
}
