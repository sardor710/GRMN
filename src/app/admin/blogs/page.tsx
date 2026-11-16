import Screen from "./_components/BlogsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminBlogsPage() {
  const access = await authorizeAdminPage("content:write");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  return <Screen />;
}
