import CatalogScreen from "./_components/CatalogScreen";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { cmsBackend } from "@/server/cms/source";

export default async function AdminProductsPage() {
  const access = await authorizeAdminPage("catalog:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  // The product admin runs on the PostgreSQL catalog (plan D-R1); the JSON CMS is a read-only fallback.
  if (cmsBackend() !== "postgres") {
    return (
      <div role="alert" className="max-w-2xl border border-[#d9d9d9] bg-white p-6 font-sans text-[14px] text-black">
        <h1 className="g-heading text-[28px] uppercase">Products</h1>
        <p className="mt-2">The product admin needs the PostgreSQL catalog. Start the local stack with <code className="bg-[#f2f2f2] px-1">npm run dev:stack</code> (or set <code className="bg-[#f2f2f2] px-1">CMS_BACKEND=postgres</code>).</p>
      </div>
    );
  }
  return <CatalogScreen />;
}
