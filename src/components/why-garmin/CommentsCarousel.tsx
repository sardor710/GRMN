"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reviews, type Review } from "./data";

const GAP = 30;

function perViewFor(w: number) {
  if (w >= 1025) return 4;
  if (w >= 769) return 3;
  if (w >= 500) return 2;
  return 1;
}

/** Shuffle avoiding adjacent duplicate watch-face images (mirrors comments.js). */
function shuffle(list: Review[]): Review[] {
  const build = () => {
    const remaining = [...list];
    const out: Review[] = [];
    let prev: string | null = null;
    while (remaining.length) {
      const cands = remaining.filter((i) => i.img !== prev);
      const pool = cands.length ? cands : remaining;
      const sel = pool[Math.floor(Math.random() * pool.length)];
      out.push(sel);
      remaining.splice(remaining.indexOf(sel), 1);
      prev = sel.img;
    }
    return out;
  };
  let best: Review[] = list;
  let lowest = Infinity;
  for (let a = 0; a < 20; a++) {
    const s = build();
    const dup = s.reduce((c, it, i) => c + (i && it.img === s[i - 1].img ? 1 : 0), 0);
    if (dup < lowest) {
      best = s;
      lowest = dup;
    }
    if (lowest === 0) break;
  }
  return best;
}

export function CommentsCarousel() {
  const [width, setWidth] = useState(1200);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Review[]>(reviews);
  const trackWrapRef = useRef<HTMLDivElement>(null);

  // Shuffle once after mount. This must run in an effect (not a state
  // initializer) so the server and first client render agree, then the
  // randomized order is applied client-side — matching the original site.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setItems(shuffle(reviews)), []);

  useEffect(() => {
    const el = trackWrapRef.current;
    if (!el) return;
    // ResizeObserver fires immediately on observe with the current size,
    // which seeds the initial width without a synchronous setState.
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const perView = perViewFor(width);
  const pages = Math.max(1, Math.ceil(items.length / perView));
  const clampedPage = Math.min(page, pages - 1);
  const slideW = (width - (perView - 1) * GAP) / perView;
  const offset = -(clampedPage * perView) * (slideW + GAP);

  const go = (dir: number) => setPage((p) => (p + dir + pages) % pages);

  const dots = useMemo(() => Array.from({ length: pages }), [pages]);

  return (
    <section id="comments">
      <div className="swiper">
        <div className="swiper-track-wrap" ref={trackWrapRef}>
          <div
            className="swiper-wrapper"
            style={{ transform: `translate3d(${offset}px,0,0)` }}
          >
            {items.map((item, i) => (
              <div
                className="swiper-slide"
                key={i}
                style={{ width: slideW, marginRight: GAP }}
              >
                <figure>
                  <img src={`/minisite/why-garmin/images/${item.img}`} alt={item.feature} />
                </figure>
                <div className="text-con">
                  <h4>My favorite features - {item.feature}</h4>
                  <p>{item.comments}</p>
                  <small>
                    {item.name}, using {item.device}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="swiper-pagination">
          {dots.map((_, i) => (
            <span
              key={i}
              className={`swiper-pagination-bullet${i === clampedPage ? " swiper-pagination-bullet-active" : ""}`}
              onClick={() => setPage(i)}
            />
          ))}
        </div>
      </div>
      <div className="swiper-button swiper-button-next" onClick={() => go(1)} />
      <div className="swiper-button swiper-button-prev" onClick={() => go(-1)} />
    </section>
  );
}
