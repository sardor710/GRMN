import type { Metadata } from "next";
import "../globals.css";
import "../garmin-fonts.css";
import { getCurrentAdmin } from "@/lib/cms/auth";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import { bodyClassName, htmlClassName, siteIcons } from "../fonts";

export const metadata: Metadata = {
  title: "Garmin CMS Admin Portal",
  description: "Administrative Content & Commerce Management System",
  icons: siteIcons,
};

/** Root layout for the English-only, unprefixed admin panel. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await getCurrentAdmin();

  return (
    <html lang="en" className={htmlClassName}>
      <body className={bodyClassName}>
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
      </body>
    </html>
  );
}
