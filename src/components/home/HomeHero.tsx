"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { homeHeroSlides } from "@/lib/homepage-content";
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "@/components/icons";
import styles from "./HomeHero.module.css";

const duration = 5000;

export function HomeHero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const changingSlide = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const goTo = useCallback((nextIndex: number) => {
    remaining.current = duration;
    changingSlide.current = true;
    setIndex((nextIndex + homeHeroSlides.length) % homeHeroSlides.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timeout = window.setTimeout(() => {
      remaining.current = duration;
      changingSlide.current = true;
      setIndex((current) => (current + 1) % homeHeroSlides.length);
    }, remaining.current);
    return () => {
      window.clearTimeout(timeout);
      if (changingSlide.current) {
        changingSlide.current = false;
      } else {
        remaining.current = Math.max(0, remaining.current - (Date.now() - started));
      }
    };
  }, [index, paused]);

  return (
    <section
      className={styles.hero}
      aria-label="Featured Garmin products"
      aria-roledescription="carousel"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        touchStart.current = null;
        if (!start || !touch) return;
        const distanceX = touch.clientX - start.x;
        const distanceY = touch.clientY - start.y;
        if (Math.abs(distanceX) < 45 || Math.abs(distanceX) <= Math.abs(distanceY)) return;
        goTo(index + (distanceX < 0 ? 1 : -1));
      }}
      onTouchCancel={() => { touchStart.current = null; }}
    >
      <div className={`${styles.track} ${styles[`index${index}`]}`}>
        {homeHeroSlides.map((slide, slideIndex) => (
          <div key={slide.key} className={styles.slide} aria-hidden={slideIndex !== index}>
            <picture className={styles.picture}>
              <source media="(max-width: 640px)" srcSet={`/homepage/hero/${slide.key}-3-M.jpg`} />
              <source media="(max-width: 990px)" srcSet={`/homepage/hero/${slide.key}-2-T.jpg`} />
              <Image
                src={`/homepage/hero/${slide.key}-1-D.jpg`}
                alt=""
                fill
                priority={slideIndex === 0}
                sizes="100vw"
                className={styles.image}
              />
            </picture>
            <div className={styles.caption}>
              <h1>{slide.title}</h1>
              <p>{slide.subtitle}</p>
              <a href={slide.href} className={styles.shop} tabIndex={slideIndex === index ? 0 : -1}>SHOP</a>
            </div>
          </div>
        ))}
      </div>

      <button type="button" aria-label="Previous slide" className={`${styles.arrow} ${styles.previous}`} onClick={() => goTo(index - 1)}>
        <ChevronLeftIcon aria-hidden="true" />
      </button>
      <button type="button" aria-label="Next slide" className={`${styles.arrow} ${styles.next}`} onClick={() => goTo(index + 1)}>
        <ChevronRightIcon aria-hidden="true" />
      </button>
      <button type="button" aria-label={paused ? "Play slideshow" : "Pause slideshow"} className={styles.playPause} onClick={() => setPaused((value) => !value)}>
        <svg viewBox="0 0 40 40" className={`${styles.progress} ${paused ? styles.progressPaused : ""}`} aria-hidden="true">
          <circle className={styles.progressTrack} cx="20" cy="20" r="18" />
          <circle key={index} className={`${styles.progressFill} ${paused ? styles.progressPaused : ""}`} cx="20" cy="20" r="18" pathLength="100" />
        </svg>
        {paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
      </button>
      <span className={styles.srOnly} aria-live="polite">Slide {index + 1} of {homeHeroSlides.length}: {homeHeroSlides[index].title}</span>
    </section>
  );
}
