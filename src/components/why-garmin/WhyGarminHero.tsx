"use client";

import { useEffect, useRef, useState } from "react";

const B = "/minisite/why-garmin";

/** Hero: background video + title with the user-count counting up to 513. */
export function WhyGarminHero() {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const target = 513;
    const duration = 2000;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section id="hero">
      <div className="wrapper">
        <video id="video-hero" playsInline muted autoPlay className="lazyloaded">
          <source src={`${B}/video/hero.mp4`} type="video/mp4" />
        </video>
        <video id="video-hero-m" playsInline muted autoPlay className="lazyloaded">
          <source src={`${B}/video/hero-m.mp4`} type="video/mp4" />
        </video>
        <div className="container">
          <h1>
            <span className="why">Why Garmin Watches?</span>
            <br />
            <span className="user">
              Experiences from{" "}
              <span className="count-number counter">{count}</span> Users
            </span>
          </h1>
        </div>
      </div>
    </section>
  );
}
