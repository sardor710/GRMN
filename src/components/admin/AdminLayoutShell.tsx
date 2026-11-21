"use client";

import { useState } from "react";
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

export function AdminLayoutShell({ children, user }: AdminLayoutShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";
  // Below lg the sidebar is an off-canvas drawer opened from the header's menu button.
  const [navOpen, setNavOpen] = useState(false);

  if (isLoginPage) {
    return <div className="min-h-screen bg-neutral-100 text-black antialiased">{children}</div>;
  }
  if (!user) return <main className="min-h-screen bg-neutral-100 p-8 text-black">{children}</main>;

  return (
    <div className="min-h-screen bg-neutral-100 text-black flex flex-col antialiased">
      <AdminSidebar permissions={user.permissions ?? []} open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <AdminHeader user={user} navOpen={navOpen} onMenu={() => setNavOpen((open) => !open)} />
        <main className="flex-1 overflow-x-hidden bg-neutral-50 p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
