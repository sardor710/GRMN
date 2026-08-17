import { getCurrentAdmin } from "@/lib/cms/auth";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";

export const metadata = {
  title: "Garmin CMS Admin Portal",
  description: "Administrative Content & Commerce Management System",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getCurrentAdmin();

  return (
    <AdminLayoutShell
      user={
        admin
          ? {
              name: admin.name,
              email: admin.email,
              role: admin.role,
              avatar: admin.avatar,
            }
          : undefined
      }
    >
      {children}
    </AdminLayoutShell>
  );
}
