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

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#232732] bg-[#11141a] text-white font-sans">
      {/* Top Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-[#232732] px-5 bg-[#0f1117]">
        <Link href="/admin" className="flex items-center gap-2.5">
          <GarminLogo className="h-4 w-auto text-white" />
          <span className="font-heading tracking-widest text-[11px] font-bold text-[#007cc3] uppercase bg-[#007cc3]/10 px-1.5 py-0.5 border border-[#007cc3]/30">
            ADMIN
          </span>
        </Link>
        <span className="text-[10px] font-mono text-[#8a92a3] uppercase tracking-wider">
          v2.4.0
        </span>
      </div>

      {/* Navigation menu */}
      <div className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5 scrollbar-thin">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1 text-[10px] font-heading font-bold uppercase tracking-wider text-[#737b8c]">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center justify-between px-3 py-2 text-[13px] font-medium transition-colors border-l-2 ${
                        isActive
                          ? "border-[#007cc3] bg-[#1a202c] text-white font-semibold"
                          : "border-transparent text-[#b0b8c7] hover:bg-[#181c24] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? "text-[#007cc3]" : "text-[#737b8c]"
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#232834] text-[#a0a8b7] rounded">
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
      <div className="border-t border-[#232732] p-3 bg-[#0f1117]">
        <Link
          href="/"
          target="_blank"
          className="flex items-center justify-between border border-[#262c39] bg-[#161a22] px-3 py-2 text-[12px] text-[#c0c7d4] transition-colors hover:bg-[#1f2430] hover:text-white"
        >
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#007cc3]" />
            <span className="font-heading uppercase tracking-wider font-semibold">Live Storefront</span>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-[#737b8c]" />
        </Link>
      </div>
    </aside>
  );
}
