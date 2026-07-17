"use client";

import { useEffect, useRef, useState } from "react";

interface Slide {
  /** Marks a slide that contains a <video> so it restarts on activation */
  isVideo?: boolean;
  content: React.ReactNode;
}

interface ContentSliderProps {
  slides: Slide[];
  /** ms between auto-advances (original uses 4000) */
  interval?: number;
}

/**
 * Auto-cycling crossfade slider matching the original `.content-slider`.
 * Slides are absolutely stacked (see why-garmin.css); only the active one is
 * opaque. Advances every `interval` ms and restarts videos on activation.
 * Slider height tracks the tallest slide's inner wrapper (+10px), like the
 * original jQuery load handler.
 */
export function ContentSlider({ slides, interval = 4000 }: ContentSliderProps) {
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const wrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Measure tallest inner wrapper and lock the slider height (like the original).
  useEffect(() => {
    const measure = () => {
      let max = 0;
      wrapperRefs.current.forEach((el) => {
        if (el && el.offsetHeight > max) max = el.offsetHeight;
      });
      if (max > 0) setHeight(max + 10);
    };
    measure();
    const ro = new ResizeObserver(measure);
    wrapperRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [slides.length]);

  // Auto-advance.
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, interval);
    return () => clearInterval(t);
  }, [slides.length, interval]);

  // Restart a video when its slide becomes active.
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    const cons = slider.querySelectorAll<HTMLDivElement>(".slider-con");
    const el = cons[active];
    const video = el?.querySelector("video");
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }, [active]);

  return (
    <div className="content-slider">
      <div className="slider" ref={sliderRef} style={{ height }}>
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`slider-con${slide.isVideo ? " video" : ""}${i === active ? " active" : ""}`}
          >
            <div
              className="banner-inner-wrapper"
              ref={(el) => {
                wrapperRefs.current[i] = el;
              }}
            >
              {slide.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
