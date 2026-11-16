import Screen from "./_components/SEOScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminSEOPage() {
  const access = await authorizeAdminPage();
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  if (!access.permissions.some(permission => permission === "catalog:read" || permission === "content:write")) return <AdminAccessDenied message="Your current access does not allow SEO sources." />;
  return <Screen permissions={access.permissions} />;
}
