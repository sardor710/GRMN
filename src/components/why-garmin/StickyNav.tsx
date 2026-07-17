"use client";

import { useEffect, useState } from "react";

const BUY_NOW = "/c/wearables-smartwatches";
const SECTIONS = [
  { href: "#health", label: "Manage Health" },
  { href: "#exercise", label: "Get Into Sports" },
  { href: "#life", label: "Lifestyle Convenience" },
];

/**
 * Sticky section nav mirroring #nav from the original: scroll-spy highlights the
 * active section and clicks smooth-scroll with a header offset (77px desktop,
 * 102px mobile).
 */
export function StickyNav() {
  const [active, setActive] = useState("");

  useEffect(() => {
    const offset = window.innerWidth <= 900 ? 102 : 77;
    const onScroll = () => {
      const y = window.scrollY + offset;
      let current = "";
      for (const s of SECTIONS) {
        const el = document.querySelector(s.href) as HTMLElement | null;
        if (el && el.offsetTop < y) current = s.href.slice(1);
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    const offset = window.innerWidth <= 900 ? 102 : 77;
    const el = document.querySelector(href) as HTMLElement | null;
    const top = el ? el.offsetTop - offset + 1 : 0;
    window.scrollTo({ top, behavior: "smooth" });
    history.pushState({}, "", location.pathname + href);
  };

  return (
    <section id="nav">
      <div className="wrapper flex-box">
        <div className="title-con">
          <p className="uppercase">Why Garmin Watches?</p>
          <a className="btn-white-fill btn-size-small mobile-buy-now" href={BUY_NOW}>
            Buy Now
          </a>
        </div>
        <div className="list">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              className={`uppercase${active === s.href.slice(1) ? " active" : ""}`}
              href={s.href}
              onClick={(e) => handleClick(e, s.href)}
            >
              {s.label}
            </a>
          ))}
          <a className="btn-black-fill btn-size-default buy-now" href={BUY_NOW}>
            Buy Now
          </a>
        </div>
      </div>
    </section>
  );
}
