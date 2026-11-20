"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";

interface AdminLayoutShellProps {
  children: React.ReactNode;
  user?: {
    name: string;
    email: string;
    role: string;
    avatar?: string;
    permissions?: readonly string[];
  };
}

// Task 5b.1: white page, black Roboto text, Garmin rules; the menu is a fixed 256px rail from 1024px and a
// folding bar above the page below that.
export function AdminLayoutShell({ children, user }: AdminLayoutShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  if (isLoginPage) {
    return <div className="min-h-screen bg-white font-sans text-black antialiased">{children}</div>;
  }
  if (!user) return <main className="min-h-screen bg-white p-4 font-sans text-black md:p-8">{children}</main>;

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-black antialiased">
      <AdminSidebar permissions={user.permissions ?? []} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <AdminHeader user={user} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
