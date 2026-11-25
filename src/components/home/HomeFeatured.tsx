"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { CarouselBlock, CarouselCard, PromoCarouselItem } from "@/lib/cms/types";
import styles from "./HomeFeatured.module.css";
import { useLocalizeHref } from "@/i18n/useLocalizeHref";
import { badgeCode, badgeSize, discountPercent, savingsParts } from "@/lib/cms/carousel-badges";

function plainText(text: string) {
  return text.replace(/[®™]/g, "");
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  const uid = useId().replace(/:/g, "");
  const filter = `fp-shadow-${uid}`;
  const g0 = `fp-g0-${uid}`;
  const g1 = `fp-g1-${uid}`;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" fill="none" aria-hidden="true" focusable="false">
      <g filter={`url(#${filter})`}>
        <circle cx="34" cy="28" r="28" fill="white" />
        <circle cx="34" cy="28" r="27.75" stroke={`url(#${g0})`} strokeWidth="0.5" />
        <circle cx="34" cy="28" r="27.75" stroke={`url(#${g1})`} strokeWidth="0.5" />
      </g>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M29 21.1L30.9865 19L39.5 28L30.9865 37L29 34.9L35.527 28L29 21.1Z"
        fill="black"
        transform={direction === "left" ? "matrix(-1 0 0 1 68 0)" : undefined}
      />
      <defs>
        <filter id={filter} x="0" y="0" width="68" height="68" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset dy="6" />
          <feGaussianBlur stdDeviation="3" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="shadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="shadow" result="shape" />
        </filter>
        <linearGradient id={g0} x1="6.27399" y1="0" x2="6.27399" y2="55.452" gradientUnits="userSpaceOnUse">
          <stop stopOpacity="0.01" />
          <stop offset="0.8" stopOpacity="0.02" />
          <stop offset="1" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={g1} x1="6" y1="0" x2="6" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.12" />
          <stop offset="0.2" stopColor="white" stopOpacity="0.06" />
          <stop offset="1" stopColor="white" stopOpacity="0.01" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * garmin.ae-style starburst for every badge (owner 2026-11-23): a known code shows its localized label (SALE adds
 * the saving); any other text, e.g. the catalog's "Save 50,000 KZT", goes into the burst as it is.
 */
function CardBadge({ text, price, originalPrice }: { text: string; price?: string; originalPrice?: string }) {
  const t = useTranslations("HomeFeatured");
  const code = badgeCode(text);
  const savings = code ? null : savingsParts(text);
  if (savings) {
    return (
      <div className={`${styles.burst} home-display`} data-badge="CUSTOM" data-size="savings" data-tone="sale">
        <span>
          <span>{savings.word}</span>
          <span className={styles.burstAmount}>{savings.amount}</span>
        </span>
      </div>
    );
  }
  const label = code ? t(`badges.${code}`) : text.trim();
  const percent = code === "SALE" ? discountPercent(price, originalPrice) : null;
  return (
    <div className={`${styles.burst} home-display`} data-badge={code ?? "CUSTOM"} data-size={percent !== null ? "medium" : badgeSize(label)} data-tone={code === "SALE" ? "sale" : undefined}>
      <span>
        {label}
        {percent !== null && <span className={styles.burstPercent}>{`−${percent}%`}</span>}
      </span>
    </div>
  );
}

/**
 * Owner 2026-11-23: one carousel card for every item. Badge, price/old price and the button appear only
 * when the card has them; legacy promo items (`variant: "promo"`, `ctaText`) render through the same card.
 */
function CarouselCardView({ item, eager }: { item: CarouselCard | PromoCarouselItem; eager: boolean }) {
  const localize = useLocalizeHref();
  const card = item as CarouselCard;
  return (
    <a className={`${styles.slide} ${styles.product}`} href={card.href ? localize(card.href) : undefined} aria-label={plainText(card.title)}>
      {card.badge && (
        <div className={styles.badges}>
          <CardBadge text={card.badge} price={card.price} originalPrice={card.originalPrice} />
        </div>
      )}
      <div className={styles.imageContainer}>
        <Image
          src={card.image}
          alt={card.imageAlt ?? plainText(card.title)}
          width={600}
          height={600}
          sizes="240px"
          className={styles.productImage}
          priority={eager}
          unoptimized
        />
      </div>
      <div className={styles.text}>
        <h3 className={styles.name}>{card.title}</h3>
        {card.description && <p className={styles.copy}>{card.description}</p>}
        {card.price && (
          <p className={styles.prices}>
            <span className={styles.price}>{card.price}</span>
            {card.originalPrice && <span className={styles.originalPrice}>{card.originalPrice}</span>}
          </p>
        )}
        {card.ctaText && <span className={styles.button}>{card.ctaText}</span>}
        <div className={styles.footnote} />
      </div>
    </a>
  );
}

function FeaturedCarousel({ carousel }: { carousel: CarouselBlock }) {
  const t = useTranslations("HomeFeatured");
  const viewport = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(1);

  const measure = useCallback(() => {
    const view = viewport.current;
    const slides = track.current;
    if (!view || !slides || slides.children.length === 0) return null;
    const first = slides.children[0] as HTMLElement;
    const last = slides.children[slides.children.length - 1] as HTMLElement;
    const step = first.offsetWidth + 24;
    const total = last.offsetLeft + last.offsetWidth + 12;
    return { step, max: Math.max(0, total - view.clientWidth), visible: Math.max(1, Math.floor(view.clientWidth / step)) };
  }, []);

  useEffect(() => {
    const update = () => {
      const m = measure();
      if (!m) return;
      setMaxOffset(m.max);
      setOffset((current) => Math.min(current, m.max));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [measure]);

  const advance = (direction: -1 | 1) => {
    const m = measure();
    if (!m) return;
    setMaxOffset(m.max);
    setOffset((current) => Math.min(m.max, Math.max(0, current + direction * m.visible * m.step)));
  };

  const items = [...carousel.items].sort((a, b) => a.order - b.order);

  return (
    <div className={styles.root} data-home-featured="">
      <h2 className={styles.header}>{carousel.title}</h2>
      <section ref={viewport} className={styles.slider} aria-label={carousel.title}>
        <div
          ref={track}
          className={styles.slides}
          style={{ ["--featured-offset" as string]: `${-offset}px` }}
        >
          {items.map((item, index) => (
            <CarouselCardView key={item.id || index} item={item} eager={index < 4} />
          ))}
        </div>
        {offset > 0 && (
          <button type="button" title={t("previous")} className={`${styles.arrow} ${styles.arrowLeft}`} onClick={() => advance(-1)}>
            <span className={styles.visuallyHidden}>{t("previous")}</span>
            <ArrowIcon direction="left" />
          </button>
        )}
        {offset < maxOffset && (
          <button type="button" title={t("next")} className={`${styles.arrow} ${styles.arrowRight}`} onClick={() => advance(1)}>
            <span className={styles.visuallyHidden}>{t("next")}</span>
            <ArrowIcon direction="right" />
          </button>
        )}
      </section>
    </div>
  );
}

interface HomeFeaturedProps {
  carousels?: CarouselBlock[];
}

export function HomeFeatured({ carousels }: HomeFeaturedProps) {
  const active = (carousels ?? [])
    .filter((carousel) => carousel.active !== false && carousel.items.length > 0)
    .sort((a, b) => a.order - b.order);

  if (active.length === 0) return null;

  return (
    <>
      {active.map((carousel) => (
        <FeaturedCarousel key={carousel.id} carousel={carousel} />
      ))}
    </>
  );
}
