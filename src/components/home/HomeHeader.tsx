"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { topNav } from "@/lib/content";
import { homeFeaturedCards } from "@/lib/homepage-content";
import { useCart } from "@/lib/cart";
import {
  AccountIcon,
  CartIcon,
  ChevronRightIcon,
  GarminLogo,
  SearchIcon,
  SupportIcon,
} from "@/components/icons";
import styles from "./HomeHeader.module.css";

const navLabels = [
  "Smartwatches",
  "Sports & Fitness",
  "Outdoor Recreation",
  "Auto & Home",
  "Marine",
  "Aviation",
  "Sale",
];

const categoryLinks = [
  "/c/wearables-smartwatches",
  "/c/sports-fitness/running-smartwatches",
  "https://www.garmin.com/en-US/c/outdoor-recreation/",
  "https://www.garmin.com/en-US/c/automotive/",
  "https://www.garmin.com/en-US/c/marine/",
  "https://www.garmin.com/en-US/c/aviation/",
  "https://www.garmin.com/en-US/c/promotions/",
];

export function HomeHeader() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { count } = useCart();

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMobileOpen(false);
        setOpenIndex(null);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);

  const suggestions = query.trim()
    ? homeFeaturedCards.filter((card) => card.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
    : [];

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" aria-label="Garmin home" className={styles.logo}>
          <GarminLogo />
        </Link>

        <nav className={styles.desktopNav} aria-label="Main navigation" onMouseLeave={() => setOpenIndex(null)}>
          {topNav.map((item, index) => (
            <div
              key={item.label}
              className={styles.navItem}
              onMouseEnter={() => setOpenIndex(item.columns ? index : null)}
              onFocus={() => setOpenIndex(item.columns ? index : null)}
            >
              <Link href={categoryLinks[index]} className={styles.navLink}>
                {navLabels[index]}
              </Link>
            </div>
          ))}
          {openIndex !== null && topNav[openIndex]?.columns && (
            <div className={styles.megaMenu}>
              <div className={styles.megaInner}>
                {topNav[openIndex].columns?.map((column, columnIndex) => (
                  <div key={`${openIndex}-${columnIndex}`} className={styles.megaColumn}>
                    {column.heading && <h2 className={styles.megaHeading}>{column.heading}</h2>}
                    {column.links.map((link) => (
                      <Link key={link.label} href={link.href === "#" ? categoryLinks[openIndex] : link.href} className={styles.megaLink} onClick={() => setOpenIndex(null)}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className={styles.actions}>
          <a href="https://support.garmin.com/en-US/" className={styles.help}>
            <SupportIcon aria-hidden="true" /> Help
          </a>
          <button type="button" className={styles.iconButton} aria-label="Search" aria-expanded={searchOpen} onClick={() => { setSearchOpen((open) => !open); setOpenIndex(null); }}>
            <SearchIcon aria-hidden="true" />
          </button>
          <Link href="/account" className={styles.iconButton} aria-label="Account">
            <AccountIcon aria-hidden="true" />
          </Link>
          <Link href="/cart" className={styles.iconButton} aria-label={`Cart, ${count} items`}>
            <CartIcon aria-hidden="true" />
            {count > 0 && <span className={styles.cartCount}>{count}</span>}
          </Link>
          <button type="button" className={styles.menuToggle} aria-label="Menu" aria-expanded={mobileOpen} onClick={() => { setMobileOpen((open) => !open); setSearchOpen(false); }}>
            <span /> <span /> <span />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className={styles.searchPanel}>
          <label htmlFor="home-search" className={styles.searchLabel}>Search Garmin</label>
          <div className={styles.searchBox}>
            <SearchIcon aria-hidden="true" />
            <input id="home-search" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" autoComplete="off" />
            <button type="button" onClick={() => { setQuery(""); setSearchOpen(false); }} aria-label="Close search">×</button>
          </div>
          {query.trim() && (
            <div className={styles.searchResults}>
              {suggestions.length ? suggestions.map((card) => (
                <a key={card.title} href={card.href} onClick={() => setSearchOpen(false)}>{card.title}</a>
              )) : <p>No featured products found.</p>}
            </div>
          )}
        </div>
      )}

      {mobileOpen && (
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          {topNav.map((item, index) => (
            <Link href={categoryLinks[index]} key={item.label} onClick={() => setMobileOpen(false)}>
              {navLabels[index]} <ChevronRightIcon aria-hidden="true" />
            </Link>
          ))}
          <a href="https://support.garmin.com/en-US/" onClick={() => setMobileOpen(false)}>Help <ChevronRightIcon aria-hidden="true" /></a>
        </nav>
      )}
    </header>
  );
}
