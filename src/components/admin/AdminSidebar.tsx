"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Package,
  Percent,
  Image as ImageIcon,
  BookOpen,
  ShoppingBag,
  Settings,
  ExternalLink,
  Globe,
  LayoutTemplate,
} from "lucide-react";
import { GarminLogo } from "@/components/icons";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: "Analytics",
    items: [
      { label: "Executive Dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    title: "Store Management",
    items: [
      { label: "Products & Inventory", href: "/admin/products", icon: Package },
      { label: "Customer Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Discounts & Promos", href: "/admin/discounts", icon: Percent },
    ],
  },
  {
    title: "Media & Content",
    items: [
      { label: "Homepage Management", href: "/admin/homepage", icon: LayoutTemplate, badge: "NEW" },
      { label: "Banners & Hero Rotators", href: "/admin/banners", icon: ImageIcon },
      { label: "Editorial & Blogs", href: "/admin/blogs", icon: BookOpen },
      { label: "SEO Optimization", href: "/admin/seo", icon: Globe, badge: "PRO" },
    ],
  },
  {
    title: "User Management",
    items: [
      { label: "Clients & Customers", href: "/admin/clients", icon: Users },
      { label: "Admins & Permissions", href: "/admin/admins", icon: ShieldCheck },
    ],
  },
  {
    title: "System Config",
    items: [
      { label: "Store Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

const navPermissions: Record<string,string> = {
  "/admin/products": "catalog:read", "/admin/discounts": "catalog:read",
  "/admin/orders": "orders:read", "/admin/clients": "customers:read",
  "/admin/homepage": "content:write", "/admin/banners": "content:write",
  "/admin/blogs": "content:write", "/admin/seo": "content:write",
  "/admin/admins": "staff:manage", "/admin/settings": "settings:write",
};
export function AdminSidebar({permissions, open = false, onNavigate}: {permissions: readonly string[]; open?: boolean; onNavigate?: () => void}) {
  const pathname = usePathname();

  return (
    <aside
      id="admin-sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-neutral-200 bg-white text-black font-sans transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      {/* Top Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-5 bg-white">
        <Link href="/admin" className="flex items-center gap-2">
          <GarminLogo className="h-4 w-auto text-black" />
          <span className="font-heading tracking-widest text-[10px] font-bold text-[#007cc3] uppercase bg-[#007cc3]/10 px-1.5 py-0.5 border border-[#007cc3]/20">
            ADMIN
          </span>
        </Link>
        <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
          v2.4
        </span>
      </div>

      {/* Navigation menu */}
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1 text-[11px] font-heading font-normal uppercase tracking-[0.08em] text-neutral-400">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.filter(item => !navPermissions[item.href] || permissions.includes(navPermissions[item.href])).map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex items-center justify-between px-3 py-2 text-[13px] transition-colors border-l-2 ${
                        isActive
                          ? "border-black bg-neutral-100 text-black font-semibold"
                          : "border-transparent text-neutral-600 hover:bg-neutral-50 hover:text-black font-normal"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? "text-black" : "text-neutral-500"
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[#007cc3]/10 text-[#007cc3] border border-[#007cc3]/20 font-bold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom Storefront shortcut */}
      <div className="border-t border-neutral-200 p-3 bg-neutral-50">
        <Link
          href="/"
          target="_blank"
          className="group flex items-center justify-between border border-neutral-300 bg-white px-3 py-2 text-[12px] text-neutral-700 transition-colors hover:border-black hover:text-black"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#007cc3]" />
            <span className="font-heading uppercase tracking-wider font-semibold">Live Storefront</span>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-neutral-400 group-hover:text-black" />
        </Link>
      </div>
    </aside>
  );
}
