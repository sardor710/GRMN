import Screen from "../_components/ProductsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminProductContentPage() {
  const access = await authorizeAdminPage("catalog:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  // The document editor from beta: RU/KZ translations, auto-translate and per-variant content overrides.
  // On PostgreSQL its save projects the document into the commerce tables (server/cms/product-projection).
  // The structured catalog editor (categories, compatibility, swatches, quick edit) is /admin/products.
  return <Screen />;
}
