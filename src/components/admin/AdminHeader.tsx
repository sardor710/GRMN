"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Search,
  LogOut,
  User,
  Shield,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Globe,
} from "lucide-react";

interface AdminHeaderProps {
  user?: {
    name: string;
    email: string;
    role: string;
    avatar?: string;
  };
}

export function AdminHeader({ user }: AdminHeaderProps) {
  const router = useRouter();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } catch {
      router.push("/admin/login");
    }
  };

  const adminName = user?.name || "Garmin Administrator";
  const adminEmail = user?.email || "admin@garmin.com";
  const adminRole = user?.role || "super_admin";

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#232836] bg-[#0c0e14]/95 backdrop-blur-md px-6 font-sans">
      {/* Search bar & Live Pulse */}
      <div className="flex items-center gap-4">
        <div className="relative w-80 lg:w-96">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#737b8c]" />
          <input
            type="text"
            placeholder="Search watches, SKUs, orders, or clients (⌘K)..."
            className="h-9 w-full rounded border border-[#262c3c] bg-[#12151e] pl-9 pr-8 text-[12px] text-white placeholder-[#555f73] focus:border-[#007cc3] focus:outline-none transition-colors"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[9px] text-[#555f73] border border-[#262c3c] bg-[#181c28] px-1 py-0.5 rounded">
            /
          </kbd>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* SEO Hub Link */}
        <Link
          href="/admin/seo"
          className="hidden md:flex items-center gap-1.5 border border-[#262c3c] bg-[#12151e] px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-bold text-[#c0c7d4] hover:border-[#007cc3] hover:text-white transition-colors rounded"
        >
          <Globe className="h-3.5 w-3.5 text-[#22c55e]" />
          <span>SEO Engine</span>
        </Link>

        {/* Live Storefront Link */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 border border-[#262c3c] bg-[#12151e] px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-bold text-[#c0c7d4] hover:border-[#007cc3] hover:text-white transition-colors rounded"
        >
          <span>Storefront</span>
          <ExternalLink className="h-3.5 w-3.5 text-[#737b8c]" />
        </a>

        {/* Notifications button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative flex h-9 w-9 items-center justify-center border border-[#262c3c] bg-[#12151e] text-[#c0c7d4] transition-colors hover:border-[#384257] hover:text-white rounded"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#007cc3] ring-2 ring-[#0c0e14]" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 border border-[#262c3c] bg-[#12151e] p-3 shadow-2xl z-50 rounded">
              <div className="flex items-center justify-between border-b border-[#232836] pb-2">
                <span className="font-heading uppercase tracking-wider text-[11px] font-bold text-white">
                  Notifications
                </span>
                <span className="text-[10px] text-[#00a0df] cursor-pointer hover:underline">
                  Clear
                </span>
              </div>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto font-sans">
                <div className="flex items-start gap-2.5 p-2.5 bg-[#171b26] border border-[#232836] rounded">
                  <CheckCircle2 className="h-4 w-4 text-[#4ade80] mt-0.5 shrink-0" />
                  <div className="text-[12px]">
                    <p className="text-white font-semibold">New Order Placed</p>
                    <p className="text-[#8a92a3] text-[11px]">
                      MARQ Adventurer Damascus Steel · $3,100
                    </p>
                    <span className="text-[9px] font-mono text-[#555f73] mt-1 inline-block">12m ago</span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 bg-[#171b26] border border-[#232836] rounded">
                  <AlertCircle className="h-4 w-4 text-[#fbbf24] mt-0.5 shrink-0" />
                  <div className="text-[12px]">
                    <p className="text-white font-semibold">Low Stock Notice</p>
                    <p className="text-[#8a92a3] text-[11px]">
                      MARQ Aviator Gen 2 (8 units remaining in warehouse)
                    </p>
                    <span className="text-[9px] font-mono text-[#555f73] mt-1 inline-block">1h ago</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 border border-[#262c3c] bg-[#12151e] p-1.5 pr-3 transition-colors hover:border-[#384257] rounded"
          >
            <div className="h-7 w-7 bg-[#007cc3] flex items-center justify-center font-heading font-bold text-white text-xs rounded">
              {adminName.charAt(0)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-[12px] font-semibold text-white leading-none">{adminName}</p>
              <p className="font-heading text-[10px] text-[#737b8c] uppercase tracking-wider mt-0.5 font-bold">
                {adminRole.replace("_", " ")}
              </p>
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 border border-[#262c3c] bg-[#12151e] p-2 shadow-2xl z-50 font-sans rounded">
              <div className="border-b border-[#232836] px-3 py-2">
                <p className="text-[13px] font-semibold text-white">{adminName}</p>
                <p className="text-[11px] text-[#8a92a3] truncate">{adminEmail}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-[#007cc3]" />
                  <span className="font-heading tracking-wider bg-[#007cc3]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#00a0df] uppercase border border-[#00a0df]/20 rounded">
                    {adminRole.replace("_", " ")}
                  </span>
                </div>
              </div>
              <div className="py-1">
                <Link
                  href="/admin/admins"
                  className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#c0c7d4] hover:bg-[#181c28] hover:text-white rounded transition-colors"
                >
                  <User className="h-4 w-4 text-[#737b8c]" />
                  <span>Team Permissions</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
