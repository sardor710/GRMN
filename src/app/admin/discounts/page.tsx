import Screen from "./_components/DiscountsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminDiscountsPage() {
  const access = await authorizeAdminPage("catalog:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  return <Screen />;
}
