"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { GarminLogo } from "@/components/icons";
import { cn } from "@/lib/utils";

// Task 5b.1: the admin menu follows garmin.com's side menu (SideFilterMenu.spec.md, MegaMenu.spec.md):
// Roboto 14px, group headings 14px 500 with a 1px #D8D8D8 rule, links 14px / 34px pitch, hover underline,
// the open item bold with Garmin's inset black bar. No icons or pseudo-badges. Below 1024px the menu folds
// into one bar like Garmin's mobile "Filter and Sort" bar.

interface NavItem {
  label: string;
  href: string;
}

const navSections: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ label: "Dashboard", href: "/admin" }] },
  {
    title: "Store",
    items: [
      { label: "Orders", href: "/admin/orders" },
      { label: "Products", href: "/admin/products" },
      { label: "Discounts", href: "/admin/discounts" },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Homepage", href: "/admin/homepage" },
      { label: "Banners", href: "/admin/banners" },
      { label: "Blog", href: "/admin/blogs" },
      { label: "SEO", href: "/admin/seo" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Clients", href: "/admin/clients" },
      { label: "Staff", href: "/admin/admins" },
    ],
  },
  { title: "System", items: [{ label: "Settings", href: "/admin/settings" }] },
];

const navPermissions: Record<string, string> = {
  "/admin/products": "catalog:read", "/admin/discounts": "catalog:read",
  "/admin/orders": "orders:read", "/admin/clients": "customers:read",
  "/admin/homepage": "content:write", "/admin/banners": "content:write",
  "/admin/blogs": "content:write", "/admin/seo": "content:write",
  "/admin/admins": "staff:manage", "/admin/settings": "settings:write",
};

export function AdminSidebar({ permissions }: { permissions: readonly string[] }) {
  const pathname = usePathname();
  // The folded menu is open for the page it was opened on only, so any route change closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenOn(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const sections = navSections
    .map(section => ({ ...section, items: section.items.filter(item => !navPermissions[item.href] || permissions.includes(navPermissions[item.href])) }))
    .filter(section => section.items.length > 0);

  return (
    <aside className="z-40 flex w-full flex-col border-b border-garmin-control bg-white text-black lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-garmin-rule px-4">
        <Link href="/admin" className="flex items-center gap-3">
          <GarminLogo className="h-4 w-auto text-black" />
          <span className="text-sm font-medium tracking-[0.64px]">Admin</span>
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="admin-menu"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 py-3.5 text-base font-bold lg:hidden"
        >
          Menu
          <svg aria-hidden="true" viewBox="0 0 18.2 11.2" className={cn("h-2 w-3 fill-current transition-transform", open && "rotate-180")}>
            <path d="M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z" />
          </svg>
        </button>
      </div>

      <nav id="admin-menu" aria-label="Admin" className={cn("flex-1 overflow-y-auto overscroll-contain px-4 pb-6 lg:block", open ? "block" : "hidden")}>
        {sections.map(section => (
          <div key={section.title}>
            <p className="mb-2 border-b border-garmin-rule pb-3.5 pt-6 text-sm font-medium tracking-[0.64px]">{section.title}</p>
            <ul>
              {section.items.map(item => {
                const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block py-2 pl-3 text-sm leading-[17.5px] tracking-[0.64px] text-black hover:underline",
                        isActive ? "font-bold shadow-[inset_3.2px_0_0_#000]" : "font-normal",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-garmin-rule px-4 py-3 lg:block", open ? "block" : "hidden")}>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm tracking-[0.64px] text-black hover:underline"
        >
          View store
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </aside>
  );
}
