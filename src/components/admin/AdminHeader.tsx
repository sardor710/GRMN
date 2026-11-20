"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Task 5b.1: a plain 64px bar like garmin.com's header row (white, 1px #D8D8D8 rule, 24px gutters).
// The decorative search box, the hard-coded notification feed and the duplicate SEO shortcut are gone:
// none of them did anything.

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
  const [logoutError, setLogoutError] = useState("");

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/admin/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Sign-out failed. Retry to end your session.");
      router.push("/admin/login");
      router.refresh();
    } catch {
      setLogoutError("Sign-out failed. Retry to end your session.");
    }
  };

  const adminName = user?.name || "Administrator";
  const adminEmail = user?.email || "";
  const adminRole = (user?.role || "staff").replace(/_/g, " ");

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-end gap-6 border-b border-garmin-rule bg-white px-4 text-sm text-black md:px-6">
      {logoutError && <span role="alert" className="text-garmin-error">{logoutError}</span>}
      <Link href="/admin/login" className="tracking-[0.64px] hover:underline">Verify MFA again</Link>

      <div className="relative">
        <button
          type="button"
          aria-expanded={showProfileMenu}
          aria-haspopup="menu"
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className="flex h-16 items-center gap-2 text-left font-medium tracking-[0.64px] hover:shadow-[inset_0_-3.2px_0_#000] aria-expanded:shadow-[inset_0_-3.2px_0_#000]"
        >
          <span className="max-w-40 truncate">{adminName}</span>
          <span className="hidden font-normal capitalize text-muted-foreground sm:inline">{adminRole}</span>
        </button>

        {showProfileMenu && (
          <div role="menu" className="absolute right-0 z-50 w-60 border border-garmin-rule bg-white shadow-garmin-raised">
            <div className="border-b border-garmin-rule px-4 py-3">
              <p className="font-bold">{adminName}</p>
              {adminEmail && <p className="truncate text-muted-foreground">{adminEmail}</p>}
              <p className="capitalize text-muted-foreground">{adminRole}</p>
            </div>
            <Link
              role="menuitem"
              href="/admin/admins"
              onClick={() => setShowProfileMenu(false)}
              className="block px-4 py-2 hover:underline"
            >
              Staff
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={handleLogout}
              className="block w-full px-4 py-2 text-left hover:underline"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
