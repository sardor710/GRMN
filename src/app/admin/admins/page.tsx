import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";

export default async function AdminUsersPage() {
  const access = await authorizeAdminPage("staff:manage");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  return <section className="max-w-2xl border border-neutral-300 bg-white p-8 text-black">
    <h1 className="text-2xl font-semibold">Staff access management</h1>
    <p className="mt-4">Staff creation, role changes, password reset, recovery and revocation controls are unavailable until their controlled lifecycle workflow is activated.</p>
    <p className="mt-3 text-neutral-600">Existing legacy CMS records cannot be used to sign in. Use the configured operator access process.</p>
  </section>;
}
