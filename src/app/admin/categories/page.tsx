import { CategoriesScreen } from "@/components/admin/categories/CategoriesScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { cmsBackend } from "@/server/cms/source";

// Owner 2026-11-22: Admin ▸ Categories — the top menu's categories and subcategories, accessory categories and
// types (band sizes, charger types), and the series used by the Series filter.
export default async function AdminCategoriesPage() {
  const access = await authorizeAdminPage("catalog:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  if (cmsBackend() !== "postgres") {
    return (
      <div role="alert" className="max-w-2xl border border-[#d9d9d9] bg-white p-6 font-sans text-[14px] text-black">
        <h1 className="g-heading text-[28px] uppercase">Categories</h1>
        <p className="mt-2">Categories need the PostgreSQL catalog (<code className="bg-[#f2f2f2] px-1">CMS_BACKEND=postgres</code>).</p>
      </div>
    );
  }
  return <CategoriesScreen />;
}
