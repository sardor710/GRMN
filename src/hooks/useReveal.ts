"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Adds an `is-visible` class (pair with `.marq-reveal`) when the element
 * scrolls into view. Fires once by default.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; once?: boolean; rootMargin?: string } = {}
) {
  const { threshold = 0.25, once = true, rootMargin = "0px 0px -10% 0px" } = options;
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) io.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once, rootMargin]);

  return { ref, visible };
}
