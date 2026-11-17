"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { megaNav, takeoverBar, type MegaNavItem } from "@/lib/homepage-nav";
import { homeFeaturedCards } from "@/lib/homepage-content";
import { useCart } from "@/lib/cart";
import { GarminLogo } from "@/components/icons";
import {
  GhAccountIcon,
  GhCartIcon,
  GhHelpIcon,
  GhMenuIcon,
  GhMinusIcon,
  GhPlusIcon,
  GhSearchIcon,
} from "./header-icons";
import styles from "./HomeHeader.module.css";
import { useLocalizeHref } from "@/i18n/useLocalizeHref";

const HELP_HREF = "https://support.garmin.com/en-US/";

function NavHref({ href, className, children, onClick }: { href: string; className?: string; children: React.ReactNode; onClick?: () => void }) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

function MegaMenu({ item, onNavigate }: { item: MegaNavItem; onNavigate: () => void }) {
  return (
    <div className={styles.megaMenu} role="region" aria-label={`${item.label} menu`}>
      {item.columns?.map((column, columnIndex) => (
        <div key={columnIndex} className={styles.megaColumn}>
          {column.map((group, groupIndex) => (
            <Fragment key={`${group.heading}-${groupIndex}`}>
              <span className={styles.megaHeading}>{group.heading || " "}</span>
              <div className={styles.megaLinks}>
                {group.links.map((link) => (
                  <NavHref key={link.label} href={link.href} className={styles.megaLink} onClick={onNavigate}>
                    {link.label}
                  </NavHref>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      ))}
      {item.promos && (
        <div className={`${styles.megaColumn} ${styles.promoColumn}`}>
          {item.promos.map((promo) => (
            <NavHref key={promo.title} href={promo.href} className={styles.promoCard} onClick={onNavigate}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={promo.image} alt="" className={styles.promoImage} width={600} height={525} />
              <span className={styles.promoGrouping}>
                <span className={styles.promoHeading}>{promo.title}</span>
                <span className={styles.promoCopy}>{promo.copy}</span>
                <span className={styles.promoCta} />
              </span>
            </NavHref>
          ))}
        </div>
      )}
    </div>
  );
}

export function HomeHeader() {
  const localize = useLocalizeHref();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileItem, setMobileItem] = useState<number | null>(null);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const { count } = useCart();

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const closeAll = () => {
      setSearchOpen(false);
      setMobileOpen(false);
      setOpenIndex(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    const onPointer = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpenIndex(null);
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  const suggestions = query.trim()
    ? homeFeaturedCards.filter((card) => card.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
    : [];

  const closeMenus = () => {
    setOpenIndex(null);
    setMobileOpen(false);
  };

  return (
    <header ref={headerRef} className={styles.header}>
      <div className={styles.content}>
        <div className={styles.logoContainer}>
          <Link href="/" aria-label="Navigate to Garmin.com" className={styles.logo} onClick={closeMenus}>
            <GarminLogo />
          </Link>
        </div>

        <nav className={styles.nav} aria-label="Site Navigation" onPointerLeave={(event) => { if (event.pointerType === "mouse") setOpenIndex(null); }}>
          <ul className={styles.categories}>
            {megaNav.map((item, index) => {
              const active = openIndex === index;
              return (
                <li
                  key={item.label}
                  className={`${styles.item} ${active ? styles.itemActive : ""}`}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "mouse") return;
                    setSearchOpen(false);
                    setOpenIndex(item.columns ? index : null);
                  }}
                >
                  {item.columns ? (
                    <>
                      <button
                        type="button"
                        className={styles.itemLink}
                        aria-expanded={active}
                        onClick={() => {
                          setSearchOpen(false);
                          setOpenIndex(active ? null : index);
                        }}
                      >
                        {item.label}
                      </button>
                      {active && <MegaMenu item={item} onNavigate={closeMenus} />}
                    </>
                  ) : (
                    <NavHref href={item.href} className={styles.itemLink} onClick={closeMenus}>
                      {item.label}
                    </NavHref>
                  )}
                </li>
              );
            })}
            {/* Live site keeps a mobile-only "Help" item here (0px wide on desktop); it shifts the centered row by half a gap. */}
            <li className={styles.itemSpacer} aria-hidden="true" />
          </ul>
        </nav>

        <div className={styles.utility}>
          <a href={HELP_HREF} className={styles.help}>
            <GhHelpIcon />
            Help
          </a>
          <button
            type="button"
            className={styles.utilityButton}
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              setOpenIndex(null);
              setMobileOpen(false);
            }}
          >
            <GhSearchIcon />
          </button>
          <Link href="/account" className={styles.utilityButton} aria-label="Account" onClick={closeMenus}>
            <GhAccountIcon />
          </Link>
          <Link href="/cart" className={styles.utilityButton} aria-label={`Cart, ${count} items`} onClick={closeMenus}>
            <GhCartIcon className={styles.cartIcon} />
            {count > 0 && <span className={styles.cartCount}>{count}</span>}
          </Link>
          <button
            type="button"
            className={styles.hamburger}
            aria-label="Toggle Menu"
            aria-expanded={mobileOpen}
            onClick={() => {
              setMobileOpen((open) => !open);
              setSearchOpen(false);
            }}
          >
            <GhMenuIcon />
          </button>
        </div>
      </div>

      {!mobileOpen && (
        <div className={styles.takeover}>
          <a href={localize(takeoverBar.href)} className={styles.takeoverLink}>
            {takeoverBar.label}
          </a>
        </div>
      )}

      {mobileOpen && (
        <nav className={styles.mobileNav} aria-label="Mobile Site Navigation">
          {megaNav.map((item, index) => {
            const expanded = mobileItem === index;
            return (
              <div key={item.label} className={styles.mobileItem}>
                {item.columns ? (
                  <button
                    type="button"
                    className={styles.mobileItemLink}
                    aria-expanded={expanded}
                    onClick={() => {
                      setMobileItem(expanded ? null : index);
                      setMobileGroup(null);
                    }}
                  >
                    {item.label}
                    {expanded ? <GhMinusIcon className={styles.mobileIcon} /> : <GhPlusIcon className={styles.mobileIcon} />}
                  </button>
                ) : (
                  <NavHref href={item.href} className={styles.mobileItemLink} onClick={closeMenus}>
                    {item.label}
                  </NavHref>
                )}
                {expanded && item.columns && (
                  <div className={styles.mobileMenu}>
                    {item.columns.flat().filter((group) => group.heading).map((group) => {
                      const groupKey = `${index}-${group.heading}`;
                      const groupOpen = mobileGroup === groupKey;
                      return (
                        <div key={groupKey}>
                          <button
                            type="button"
                            className={styles.mobileHeading}
                            aria-expanded={groupOpen}
                            onClick={() => setMobileGroup(groupOpen ? null : groupKey)}
                          >
                            {group.heading}
                            {groupOpen ? <GhMinusIcon className={styles.mobileIcon} /> : <GhPlusIcon className={styles.mobileIcon} />}
                          </button>
                          {groupOpen && (
                            <div className={styles.mobileLinks}>
                              {group.links.map((link) => (
                                <NavHref key={link.label} href={link.href} className={styles.mobileLink} onClick={closeMenus}>
                                  {link.label}
                                </NavHref>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div className={styles.mobileItem}>
            <a href={HELP_HREF} className={`${styles.mobileItemLink} ${styles.mobileHelp}`}>
              <span>
                <GhHelpIcon className={styles.mobileHelpIcon} />
                Help
              </span>
            </a>
          </div>
        </nav>
      )}

      {searchOpen && (
        <div className={styles.searchPanel}>
          <label htmlFor="home-search" className={styles.searchLabel}>Search Garmin</label>
          <div className={styles.searchBox}>
            <GhSearchIcon />
            <input
              id="home-search"
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products"
              autoComplete="off"
            />
            <button type="button" onClick={() => { setQuery(""); setSearchOpen(false); }} aria-label="Close search">×</button>
          </div>
          {query.trim() && (
            <div className={styles.searchResults}>
              {suggestions.length ? suggestions.map((card) => (
                <a key={card.title} href={localize(card.href)} onClick={() => setSearchOpen(false)}>{card.title}</a>
              )) : <p>No featured products found.</p>}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
