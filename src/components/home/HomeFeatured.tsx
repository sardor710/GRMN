"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { homeFeaturedCards } from "@/lib/homepage-content";
import type { CarouselBlock, ProductCarouselItem, PromoCarouselItem } from "@/lib/cms/types";
import styles from "./HomeFeatured.module.css";

const CARD_STEP = 347;

const starburstPath = Array.from({ length: 28 }, (_, index) => {
  const angle = (Math.PI * index) / 14 - Math.PI / 2;
  const radius = index % 2 === 0 ? 49 : 43;
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
}).join(" ") + "Z";

interface SingleCarouselProps {
  carousel: CarouselBlock;
}

function SingleCarousel({ carousel }: SingleCarouselProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoNext, setCanGoNext] = useState(true);

  const updateArrows = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    setCanGoBack(element.scrollLeft > 4);
    setCanGoNext(element.scrollLeft + element.clientWidth < element.scrollWidth - 4);
  }, []);

  const advance = (direction: -1 | 1) => {
    scroller.current?.scrollBy({ left: direction * CARD_STEP, behavior: "smooth" });
  };

  const isProduct = carousel.type === "product";

  return (
    <section className={styles.section} aria-label={carousel.title}>
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4">
        <div>
          <h2 className={styles.header}>{carousel.title}</h2>
          {carousel.subtitle && (
            <p className="text-xs text-neutral-500 font-sans mt-0.5">{carousel.subtitle}</p>
          )}
        </div>
      </div>

      <div className={styles.carousel}>
        <div
          ref={scroller}
          className={styles.scroller}
          onScroll={updateArrows}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              advance(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
          tabIndex={0}
          aria-label={carousel.title}
        >
          {carousel.items.map((item, index) => {
            const prodItem = item as ProductCarouselItem;
            const promoItem = item as PromoCarouselItem;

            if (!isProduct) {
              // Type 2: Promo photo & hyperlink button
              return (
                <a
                  className={`${styles.card} ${styles.edgeCard}`}
                  href={promoItem.href || "#"}
                  key={promoItem.id || index}
                  aria-label={`${promoItem.title}. ${promoItem.description}`}
                >
                  <Image
                    src={promoItem.image || "/homepage/featured/holiday.jpg"}
                    alt=""
                    fill
                    sizes="323px"
                    className={styles.edgeImage}
                    priority={index < 2}
                    unoptimized
                  />
                  <div className={styles.edgeText}>
                    <h3 className={styles.cardTitle}>{promoItem.title}</h3>
                    <p className={styles.description}>{promoItem.description}</p>
                    <span className={styles.edgeButton}>{promoItem.ctaText || "Shop"}</span>
                  </div>
                </a>
              );
            }

            // Type 1: Product, price, and tag (NEW / SALE)
            return (
              <a
                className={`${styles.card} ${styles.productCard}`}
                href={prodItem.href || "#"}
                key={prodItem.id || index}
                aria-label={`${prodItem.title}. ${prodItem.description}`}
              >
                {prodItem.badge && (
                  <span className={styles.badge} aria-label={prodItem.badge}>
                    <svg viewBox="0 0 100 100" aria-hidden="true"><path d={starburstPath} /></svg>
                    <span className={styles.badgeLabel}>{prodItem.badge}</span>
                  </span>
                )}
                <div className={styles.imageContainer}>
                  <Image
                    src={prodItem.image || "/homepage/featured/fenix9.jpg"}
                    alt=""
                    fill
                    sizes="323px"
                    className={styles.productImage}
                    priority={index < 2}
                    unoptimized
                  />
                </div>
                <div className={styles.productDetails}>
                  <h3 className={styles.cardTitle}>{prodItem.title}</h3>
                  <p className={styles.description}>{prodItem.description}</p>
                  {prodItem.price && (
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xs font-bold text-neutral-900 font-mono">
                        {prodItem.price}
                      </span>
                      {prodItem.originalPrice && (
                        <span className="text-[11px] text-neutral-400 line-through font-mono">
                          {prodItem.originalPrice}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </a>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Previous items"
          className={`${styles.arrow} ${styles.previous}`}
          onClick={() => advance(-1)}
          disabled={!canGoBack}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next items"
          className={`${styles.arrow} ${styles.next}`}
          onClick={() => advance(1)}
          disabled={!canGoNext}
        >
          <ChevronRightIcon aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

interface HomeFeaturedProps {
  carousels?: CarouselBlock[];
}

export function HomeFeatured({ carousels }: HomeFeaturedProps) {
  const activeCarousels = carousels?.filter((c) => c.active !== false && c.items.length > 0);

  if (activeCarousels) {
    return (
      <div className="space-y-4">
        {activeCarousels.map((carousel) => (
          <SingleCarousel key={carousel.id} carousel={carousel} />
        ))}
      </div>
    );
  }

  // Fallback to initial static cards
  return (
    <SingleCarousel
      carousel={{
        id: "default-featured",
        title: "Featured",
        type: "promo",
        active: true,
        order: 1,
        items: homeFeaturedCards.map((c, i) => ({
          id: `card-${i}`,
          title: c.title,
          description: c.description,
          image: c.image,
          href: c.href,
          ctaText: "Shop",
          badge: c.badge,
          order: i,
        })),
      }}
    />
  );
}
