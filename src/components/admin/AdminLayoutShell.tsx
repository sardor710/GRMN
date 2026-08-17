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
  };
}

export function AdminLayoutShell({ children, user }: AdminLayoutShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  if (isLoginPage) {
    return <div className="min-h-screen bg-[#07080a] text-white">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#090a0c] text-white flex flex-col antialiased">
      <AdminSidebar />
      <div className="pl-64 flex flex-col flex-1 min-h-screen">
        <AdminHeader user={user} />
        <main className="flex-1 p-6 md:p-8 bg-[#090a0c] overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
