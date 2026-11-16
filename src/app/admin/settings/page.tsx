import Screen from "./_components/SettingsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminSettingsPage() {
  const access = await authorizeAdminPage("settings:write");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  return <Screen />;
}
