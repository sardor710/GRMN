"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { CarouselBlock, ProductCarouselItem, PromoCarouselItem } from "@/lib/cms/types";
import styles from "./HomeFeatured.module.css";
import { useLocalizeHref } from "@/i18n/useLocalizeHref";

type CarouselItem = ProductCarouselItem | PromoCarouselItem;

function plainText(text: string) {
  return text.replace(/[®™]/g, "");
}

function isPromo(item: CarouselItem, carousel: CarouselBlock) {
  if (item.variant) return item.variant === "promo";
  return carousel.type === "promo";
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

function PromoTile({ item, eager }: { item: PromoCarouselItem; eager: boolean }) {
  const localize = useLocalizeHref();
  const t = useTranslations("HomeFeatured");
  return (
    <a className={`${styles.slide} ${styles.promo}`} href={localize(item.href || "#")}>
      <Image
        src={item.image}
        alt={item.imageAlt ?? plainText(item.title)}
        fill
        sizes="(max-width: 640px) 75vw, (max-width: 989px) 40vw, 23vw"
        className={styles.promoImage}
        priority={eager}
        unoptimized
      />
      <div className={styles.promoText}>
        <h3 className={styles.name}>{item.title}</h3>
        <span className={styles.button}>{item.ctaText || t("shop")}</span>
      </div>
    </a>
  );
}

function ProductCard({ item, eager }: { item: ProductCarouselItem; eager: boolean }) {
  const localize = useLocalizeHref();
  return (
    <a className={`${styles.slide} ${styles.product}`} href={localize(item.href || "#")} aria-label={plainText(item.title)}>
      {item.badge && (
        <div className={styles.badges}>
          <div className={styles.badge}>{item.badge}</div>
        </div>
      )}
      <div className={styles.imageContainer}>
        <Image
          src={item.image}
          alt={item.imageAlt ?? plainText(item.title)}
          width={600}
          height={600}
          sizes="240px"
          className={styles.productImage}
          priority={eager}
          unoptimized
        />
      </div>
      <div className={styles.text}>
        <h3 className={styles.name}>{item.title}</h3>
        {item.description && <p className={styles.copy}>{item.description}</p>}
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
          {items.map((item, index) =>
            isPromo(item, carousel) ? (
              <PromoTile key={item.id || index} item={item as PromoCarouselItem} eager={index < 4} />
            ) : (
              <ProductCard key={item.id || index} item={item as ProductCarouselItem} eager={index < 4} />
            ),
          )}
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
