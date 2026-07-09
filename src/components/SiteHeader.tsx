"use client";

import { useState } from "react";
import Link from "next/link";
import { topNav } from "@/lib/content";
import { useCart } from "@/lib/cart";
import {
  GarminLogo,
  SearchIcon,
  AccountIcon,
  CartIcon,
  SupportIcon,
  ChevronRightIcon,
} from "@/components/icons";

export function SiteHeader() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count } = useCart();

  return (
    <header className="relative z-[9999] w-full bg-white">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        {/* Logo */}
        <Link href="/" aria-label="Garmin home" className="flex shrink-0 items-center">
          <GarminLogo className="h-[19px] w-auto text-black" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex" onMouseLeave={() => setOpenIndex(null)}>
          <ul className="flex items-center gap-6">
            {topNav.map((item, i) => (
              <li
                key={item.label}
                className="flex h-16 items-center"
                onMouseEnter={() => setOpenIndex(item.columns ? i : null)}
              >
                <Link
                  href={item.href}
                  className="text-[13px] tracking-[0.04em] text-black transition-colors hover:text-[#007cc3]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Mega-menu dropdown */}
          {openIndex !== null && topNav[openIndex]?.columns && (
            <div
              className="absolute inset-x-0 top-16 z-50 border-t border-neutral-200 bg-white shadow-[0_12px_24px_-8px_rgba(0,0,0,0.15)]"
              onMouseEnter={() => setOpenIndex(openIndex)}
            >
              <div className="mx-auto flex max-w-[1200px] gap-16 px-6 py-8">
                {topNav[openIndex]!.columns!.map((col, ci) => (
                  <div key={ci} className="min-w-[200px]">
                    {col.heading && (
                      <h3 className="g-heading mb-4 text-[13px] tracking-[0.08em] text-black">
                        {col.heading}
                      </h3>
                    )}
                    <ul className="space-y-3">
                      {col.links.map((link) => (
                        <li key={link.label}>
                          <Link
                            href={link.href}
                            className="text-[14px] text-neutral-700 transition-colors hover:text-[#007cc3]"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-4 lg:gap-5">
          <a
            href="#"
            className="hidden items-center gap-1.5 text-[13px] text-black transition-colors hover:text-[#007cc3] sm:flex"
          >
            <SupportIcon className="h-5 w-5" />
            <span>Support</span>
          </a>
          <button aria-label="Search" className="text-black transition-colors hover:text-[#007cc3]">
            <SearchIcon className="h-5 w-5" />
          </button>
          <button aria-label="Account" className="text-black transition-colors hover:text-[#007cc3]">
            <AccountIcon className="h-5 w-5" />
          </button>
          <button aria-label="Cart" className="relative text-black transition-colors hover:text-[#007cc3]">
            <CartIcon className="h-5 w-5" />
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-medium leading-none text-white">
              {count}
            </span>
          </button>
          {/* Mobile hamburger */}
          <button
            aria-label="Menu"
            className="flex flex-col gap-[5px] lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className="block h-[2px] w-6 bg-black" />
            <span className="block h-[2px] w-6 bg-black" />
            <span className="block h-[2px] w-6 bg-black" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-neutral-200 bg-white lg:hidden">
          <ul className="divide-y divide-neutral-100">
            {topNav.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between px-4 py-4 text-[14px] tracking-[0.04em] text-black"
                >
                  {item.label}
                  {item.columns && <ChevronRightIcon className="h-4 w-4 text-neutral-400" />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
