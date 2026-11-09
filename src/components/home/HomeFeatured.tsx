"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { homeFeaturedCards } from "@/lib/homepage-content";
import styles from "./HomeFeatured.module.css";

const CARD_STEP = 347;

const starburstPath = Array.from({ length: 28 }, (_, index) => {
  const angle = (Math.PI * index) / 14 - Math.PI / 2;
  const radius = index % 2 === 0 ? 49 : 43;
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
}).join(" ") + "Z";

export function HomeFeatured() {
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

  return (
    <section className={styles.section} aria-labelledby="home-featured-heading">
      <h2 id="home-featured-heading" className={styles.header}>Featured</h2>
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
          aria-label="Featured products"
        >
          {homeFeaturedCards.map((card, index) => (
            <a
              className={`${styles.card} ${card.edgeToEdge ? styles.edgeCard : styles.productCard}`}
              href={card.href}
              key={card.title}
              aria-label={`${card.title}. ${card.description}`}
            >
              {card.edgeToEdge ? (
                <>
                  <Image
                    src={card.image}
                    alt=""
                    fill
                    sizes="323px"
                    className={styles.edgeImage}
                    priority={index < 2}
                  />
                  <div className={styles.edgeText}>
                    <h3 className={styles.cardTitle}>{card.title}</h3>
                    <p className={styles.description}>{card.description}</p>
                    <span className={styles.edgeButton}>Shop</span>
                  </div>
                </>
              ) : (
                <>
                  {card.badge && (
                    <span className={styles.badge} aria-label={card.badge}>
                      <svg viewBox="0 0 100 100" aria-hidden="true"><path d={starburstPath} /></svg>
                      <span className={styles.badgeLabel}>{card.badge}</span>
                    </span>
                  )}
                  <div className={styles.productImage}>
                    <Image src={card.image} alt="" fill sizes="280px" className={styles.containImage} />
                  </div>
                  <div className={styles.productText}>
                    <h3 className={styles.cardTitle}>{card.title}</h3>
                    <p className={styles.description}>{card.description}</p>
                  </div>
                </>
              )}
            </a>
          ))}
        </div>
        {canGoBack && (
          <button
            type="button"
            className={`${styles.arrow} ${styles.previous}`}
            onClick={() => advance(-1)}
            aria-label="Previous featured products"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </button>
        )}
        {canGoNext && (
          <button
            type="button"
            className={`${styles.arrow} ${styles.next}`}
            onClick={() => advance(1)}
            aria-label="Next featured products"
          >
            <ChevronRightIcon aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
