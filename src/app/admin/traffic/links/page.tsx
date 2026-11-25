import { LinkBuilder } from "./LinkBuilder";
import { authorizeAdminPage } from "@/server/auth/admin-page";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { cmsBackend } from "@/server/cms/source";

// Owner 2026-11-25: Admin ▸ Campaign links — tagged links for Instagram/Facebook posts, stories and ads.
export default async function AdminCampaignLinksPage() {
  const access = await authorizeAdminPage("orders:read");
  if (!access.allowed) return <AdminAccessDenied message={access.message} />;
  if (cmsBackend() !== "postgres") return <AdminAccessDenied message="Campaign links need the PostgreSQL backend (CMS_BACKEND=postgres)." />;
  return <LinkBuilder />;
}
