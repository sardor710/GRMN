import Screen from "./_components/SettingsScreen";
import StoreSettingsScreen from "./_components/StoreSettingsScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { cmsBackend } from "@/server/cms/source";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminSettingsPage() {
  const access = await authorizeAdminPage("settings:write");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  // PostgreSQL mode: typed, versioned settings and the USD rate editor (Task 18B).
  return cmsBackend() === "postgres" ? <StoreSettingsScreen /> : <Screen />;
}
