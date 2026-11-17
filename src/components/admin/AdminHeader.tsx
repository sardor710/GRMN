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
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-neutral-200 bg-white px-6 font-sans">
      {/* Search bar */}
      <div className="flex items-center gap-4">
        <div className="relative w-80 lg:w-96">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search watches, SKUs, orders, or clients..."
            className="h-9 w-full border border-neutral-300 bg-neutral-50 pl-9 pr-8 text-[13px] text-black placeholder-neutral-400 focus:border-black focus:bg-white focus:outline-none transition-colors"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-neutral-400 border border-neutral-200 bg-white px-1.5 py-0.5">
            /
          </kbd>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* SEO Hub Link */}
        <Link
          href="/admin/seo"
          className="hidden md:flex items-center gap-1.5 border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-700 hover:border-black hover:text-black transition-colors"
        >
          <Globe className="h-3.5 w-3.5 text-[#007cc3]" />
          <span>SEO Engine</span>
        </Link>

        {/* Live Storefront Link */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-700 hover:border-black hover:text-black transition-colors"
        >
          <span>Storefront</span>
          <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
        </a>

        {/* Notifications button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative flex h-9 w-9 items-center justify-center border border-neutral-200 bg-white text-neutral-700 transition-colors hover:border-black hover:text-black"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#007cc3]" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 border border-neutral-300 bg-white p-4 shadow-xl z-50">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5">
                <span className="font-heading uppercase tracking-wider text-[12px] font-bold text-black">
                  Notifications
                </span>
                <span className="text-[11px] text-[#007cc3] cursor-pointer hover:underline">
                  Mark all read
                </span>
              </div>
              <div className="mt-3 space-y-2.5 max-h-64 overflow-y-auto">
                <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50 border border-neutral-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-[12px]">
                    <p className="text-black font-semibold">New Order Placed</p>
                    <p className="text-neutral-600 text-[11px]">
                      MARQ Adventurer Damascus Steel · $3,100
                    </p>
                    <span className="text-[10px] font-mono text-neutral-400 mt-1 inline-block">12m ago</span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50 border border-neutral-200">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-[12px]">
                    <p className="text-black font-semibold">Low Stock Notice</p>
                    <p className="text-neutral-600 text-[11px]">
                      MARQ Aviator Gen 2 (8 units remaining)
                    </p>
                    <span className="text-[10px] font-mono text-neutral-400 mt-1 inline-block">1h ago</span>
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
            className="flex items-center gap-2.5 border border-neutral-200 bg-white p-1.5 pr-3 transition-colors hover:border-black"
          >
            <div className="h-7 w-7 bg-black flex items-center justify-center font-heading font-bold text-white text-xs">
              {adminName.charAt(0)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-[13px] font-semibold text-black leading-none">{adminName}</p>
              <p className="font-heading text-[10px] text-neutral-500 uppercase tracking-wider mt-0.5">
                {adminRole.replace("_", " ")}
              </p>
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 border border-neutral-300 bg-white p-2 shadow-xl z-50 font-sans">
              <div className="border-b border-neutral-200 px-3 py-2.5">
                <p className="text-[13px] font-semibold text-black">{adminName}</p>
                <p className="text-[11px] text-neutral-500 truncate">{adminEmail}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-[#007cc3]" />
                  <span className="font-heading tracking-wider bg-[#007cc3]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#007cc3] uppercase border border-[#007cc3]/20">
                    {adminRole.replace("_", " ")}
                  </span>
                </div>
              </div>
              <div className="py-1">
                <Link
                  href="/admin/admins"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] text-neutral-700 hover:bg-neutral-100 hover:text-black transition-colors"
                >
                  <User className="h-4 w-4 text-neutral-400" />
                  <span>Team Permissions</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-rose-600 hover:bg-rose-50 transition-colors"
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
